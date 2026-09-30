import { and, desc, eq, gte, like, lt, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { AgntStakingPosition, InsertAgntStakingPosition, InsertUser, agntStakingPositions, users } from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export type NotificationPreferences = { sessionExpiry: boolean; stakingActivity: boolean; stakingExpiry: boolean };
const defaultNotificationPreferences: NotificationPreferences = { sessionExpiry: true, stakingActivity: true, stakingExpiry: true };

export async function getNotificationPreferences(openId: string): Promise<NotificationPreferences> {
  const db = await getDb();
  if (!db) return defaultNotificationPreferences;
  const result = await db.select({ notificationPreferences: users.notificationPreferences }).from(users).where(eq(users.openId, openId)).limit(1);
  try {
    const stored = result[0]?.notificationPreferences ? JSON.parse(result[0].notificationPreferences) as Partial<NotificationPreferences> : {};
    return { ...defaultNotificationPreferences, ...stored };
  } catch {
    return defaultNotificationPreferences;
  }
}

export async function updateNotificationPreferences(openId: string, preferences: NotificationPreferences) {
  const db = await getDb();
  if (!db) return preferences;
  await db.update(users).set({ notificationPreferences: JSON.stringify(preferences) }).where(eq(users.openId, openId));
  return preferences;
}

export async function listExpiringAgntStakingPositions(ownerOpenId: string, withinDays = 3) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: agntStakingPositions.id, walletAddress: agntStakingPositions.walletAddress, amount: agntStakingPositions.amount, durationDays: agntStakingPositions.durationDays, createdAt: agntStakingPositions.createdAt, expiresAt: sql<Date>`date_add(${agntStakingPositions.createdAt}, interval ${agntStakingPositions.durationDays} day)` }).from(agntStakingPositions).where(and(eq(agntStakingPositions.ownerOpenId, ownerOpenId), eq(agntStakingPositions.status, "active"), sql`date_add(${agntStakingPositions.createdAt}, interval ${agntStakingPositions.durationDays} day) between now() and date_add(now(), interval ${sql.raw(String(withinDays))} day)`)).orderBy(agntStakingPositions.createdAt);
}

export async function listAgntStakingPositions(ownerOpenId: string, options: { walletAddress?: string; status: "all" | "active" | "unstaked"; search: string; startDate?: string; endDate?: string; limit: number; offset: number }) {
  const db = await getDb();
  if (!db) return { items: [], total: 0 };
  const filters = [eq(agntStakingPositions.ownerOpenId, ownerOpenId)];
  if (options.walletAddress) filters.push(eq(agntStakingPositions.walletAddress, options.walletAddress));
  if (options.status !== "all") filters.push(eq(agntStakingPositions.status, options.status));
  if (options.search) filters.push(or(like(agntStakingPositions.walletAddress, `%${options.search}%`), sql`CAST(${agntStakingPositions.id} AS CHAR) LIKE ${`%${options.search}%`}`)!);
  if (options.startDate) filters.push(gte(agntStakingPositions.createdAt, new Date(`${options.startDate}T00:00:00.000Z`)));
  if (options.endDate) filters.push(lt(agntStakingPositions.createdAt, new Date(`${options.endDate}T23:59:59.999Z`)));
  const scope = and(...filters);
  const [items, countResult] = await Promise.all([
    db.select().from(agntStakingPositions).where(scope).orderBy(desc(agntStakingPositions.createdAt)).limit(options.limit).offset(options.offset),
    db.select({ count: sql<number>`count(*)` }).from(agntStakingPositions).where(scope),
  ]);
  return { items, total: Number(countResult[0]?.count ?? 0) };
}

export async function getAgntStakingSummary(ownerOpenId: string, activityDays: 7 | 30 | 90 = 30) {
  const db = await getDb();
  if (!db) return { totalPositions: 0, activePositions: 0, totalStaked: 0, totalRewards: 0, lastActivityAt: null, activity: [] };
  const [summary, latest, activity] = await Promise.all([
    db.select({
      totalPositions: sql<number>`count(*)`,
      activePositions: sql<number>`coalesce(sum(case when ${agntStakingPositions.status} = 'active' then 1 else 0 end), 0)`,
      totalStaked: sql<number>`coalesce(sum(${agntStakingPositions.amount}), 0)`,
      totalRewards: sql<number>`coalesce(sum(${agntStakingPositions.reward}), 0)`,
    }).from(agntStakingPositions).where(eq(agntStakingPositions.ownerOpenId, ownerOpenId)),
    db.select({ createdAt: agntStakingPositions.createdAt }).from(agntStakingPositions).where(eq(agntStakingPositions.ownerOpenId, ownerOpenId)).orderBy(desc(agntStakingPositions.createdAt)).limit(1),
    db.select({ day: sql<string>`date(${agntStakingPositions.createdAt})`, positions: sql<number>`count(*)`, rewards: sql<number>`coalesce(sum(${agntStakingPositions.reward}), 0)`, staked: sql<number>`coalesce(sum(${agntStakingPositions.amount}), 0)` }).from(agntStakingPositions).where(and(eq(agntStakingPositions.ownerOpenId, ownerOpenId), sql`${agntStakingPositions.createdAt} >= date_sub(now(), interval ${sql.raw(String(activityDays))} day)`)).groupBy(sql`date(${agntStakingPositions.createdAt})`).orderBy(sql`date(${agntStakingPositions.createdAt})`),
  ]);
  return { ...summary[0], totalPositions: Number(summary[0]?.totalPositions ?? 0), activePositions: Number(summary[0]?.activePositions ?? 0), totalStaked: Number(summary[0]?.totalStaked ?? 0), totalRewards: Number(summary[0]?.totalRewards ?? 0), lastActivityAt: latest[0]?.createdAt ?? null, activity: activity.map((entry) => ({ day: entry.day, positions: Number(entry.positions), rewards: Number(entry.rewards), staked: Number(entry.staked) })) };
}

export async function createAgntStakingPosition(position: InsertAgntStakingPosition): Promise<AgntStakingPosition | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.insert(agntStakingPositions).values(position);
  const created = await db.select().from(agntStakingPositions).where(eq(agntStakingPositions.id, result[0].insertId)).limit(1);
  return created[0];
}

export async function unstakeAgntPosition(id: number, ownerOpenId: string, walletAddress: string): Promise<AgntStakingPosition | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const scope = and(eq(agntStakingPositions.id, id), eq(agntStakingPositions.ownerOpenId, ownerOpenId), eq(agntStakingPositions.walletAddress, walletAddress));
  await db.update(agntStakingPositions).set({ status: "unstaked", unstakedAt: new Date() }).where(scope);
  const updated = await db.select().from(agntStakingPositions).where(scope).limit(1);
  return updated[0];
}
