import { CANONICAL_POOLS } from "@/data/canonicalPools";

export type PoolStage = "curve" | "graduated";

export type PoolRecord = {
  id: string;
  name: string;
  symbol: string;
  verified: boolean;
  stage: PoolStage;
  creator?: string;
  createdAt?: string;
  dbcConfig?: string;
  dbcPool?: string;
  baseMint?: string;
  dammV2Pool?: string;
  dlmmPool?: string;
  agentWallet?: string;
};

const STORAGE_KEY = "agentbond.pools.v1";

function storage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof window !== "undefined") return window.localStorage;
  if (typeof globalThis !== "undefined" && (globalThis as { localStorage?: Storage }).localStorage) {
    return (globalThis as { localStorage: Storage }).localStorage;
  }
  return null;
}

export const UNVERIFIED_DISCLAIMER =
  "Community pool — not affiliated with or endorsed by AgentBond. Trade at your own risk.";

export function badgeFor(pool: PoolRecord) {
  return pool.verified ? "CANONICAL" : "UNVERIFIED";
}

/** The DAMM v2 pool a swap should target for this record, if tradeable. */
export function tradableDammV2Pool(pool: PoolRecord) {
  return pool.dammV2Pool ?? null;
}

function readUserPools(): PoolRecord[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY) ?? null;
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PoolRecord =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as PoolRecord).id === "string" &&
        typeof (item as PoolRecord).name === "string" &&
        typeof (item as PoolRecord).symbol === "string" &&
        (item as PoolRecord).verified === false
    );
  } catch {
    return [];
  }
}

function writeUserPools(pools: PoolRecord[]) {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(pools));
  } catch {
    // Storage full or unavailable; registry stays in-memory for this session.
  }
}

/** In-memory overlay from the latest on-chain scan (never persisted). */
let discoveredPools: PoolRecord[] = [];

export function setDiscoveredPools(pools: PoolRecord[]) {
  discoveredPools = pools;
}

function conflictKeys(record: PoolRecord) {
  return [record.id, record.dbcPool, record.baseMint, record.dammV2Pool].filter(
    (key): key is string => typeof key === "string" && key.length > 0
  );
}

export function listPools(): PoolRecord[] {
  const seen = new Set(CANONICAL_POOLS.flatMap(conflictKeys));
  const dedupedUser = readUserPools().filter(
    pool => !conflictKeys(pool).some(key => seen.has(key))
  );
  for (const pool of dedupedUser) {
    for (const key of conflictKeys(pool)) seen.add(key);
  }
  const dedupedDiscovered = discoveredPools.filter(
    pool => !conflictKeys(pool).some(key => seen.has(key))
  );
  return [...CANONICAL_POOLS, ...dedupedUser, ...dedupedDiscovered];
}

export function getPool(id: string): PoolRecord | null {
  return listPools().find(pool => pool.id === id) ?? null;
}

export function upsertUserPool(record: Omit<PoolRecord, "verified"> & { verified?: false }) {
  const entry: PoolRecord = {
    ...record,
    createdAt: record.createdAt ?? new Date().toISOString(),
    verified: false,
  };
  const userPools = readUserPools().filter(pool => pool.id !== entry.id);
  userPools.unshift(entry);
  writeUserPools(userPools);
  return entry;
}

export function updateUserPool(id: string, patch: Partial<Omit<PoolRecord, "id" | "verified">>) {
  const userPools = readUserPools();
  const index = userPools.findIndex(pool => pool.id === id);
  if (index === -1) return null;
  const next: PoolRecord = { ...userPools[index], ...patch, verified: false };
  userPools[index] = next;
  writeUserPools(userPools);
  return next;
}
