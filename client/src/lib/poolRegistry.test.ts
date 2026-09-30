import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  badgeFor,
  getPool,
  listPools,
  updateUserPool,
  upsertUserPool,
} from "./poolRegistry";

const localStorageMock = (() => {
  let store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  };
})();

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorageMock.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pool registry", () => {
  it("lists the canonical AGNT entry as verified", () => {
    const pools = listPools();
    expect(pools).toHaveLength(1);
    expect(pools[0].symbol).toBe("AGNT");
    expect(pools[0].verified).toBe(true);
    expect(badgeFor(pools[0])).toBe("CANONICAL");
  });

  it("upserts and updates user pools as unverified", () => {
    const entry = upsertUserPool({
      id: "user-pool-1",
      name: "Test Token",
      symbol: "TEST",
      stage: "curve",
      dbcPool: "11111111111111111111111111111111",
    });
    expect(entry.verified).toBe(false);
    expect(badgeFor(entry)).toBe("UNVERIFIED");
    expect(listPools()).toHaveLength(2);

    const updated = updateUserPool("user-pool-1", { stage: "graduated", dammV2Pool: "2222" });
    expect(updated?.stage).toBe("graduated");
    expect(updated?.dammV2Pool).toBe("2222");
    expect(updated?.verified).toBe(false);
    expect(getPool("user-pool-1")?.dammV2Pool).toBe("2222");
  });

  it("rejects stored entries that claim verified status", () => {
    localStorageMock.setItem(
      "agentbond.pools.v1",
      JSON.stringify([{ id: "fake", name: "Fake", symbol: "FAKE", verified: true }])
    );
    expect(listPools()).toHaveLength(1);
  });

  it("survives corrupted localStorage", () => {
    localStorageMock.setItem("agentbond.pools.v1", "{not json");
    expect(listPools()).toHaveLength(1);
  });

  it("never lets user pools override a canonical id", () => {
    upsertUserPool({
      id: "agnt-canonical",
      name: "Impostor",
      symbol: "AGNT",
      stage: "curve",
    });
    const pools = listPools();
    const canonical = pools.find(pool => pool.id === "agnt-canonical");
    expect(canonical?.name).toBe("AgentBond");
    expect(pools).toHaveLength(1);
  });
});
