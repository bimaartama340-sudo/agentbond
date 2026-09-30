import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { PublicKey } from "@solana/web3.js";

vi.mock("@meteora-ag/cp-amm-sdk", () => ({ CpAmm: class {} }));
vi.mock("@meteora-ag/dlmm", () => ({ default: { create: vi.fn() } }));
import {
  buildDammV2MigrationPreview,
  createLiquidityLifecyclePlan,
  assertDevnetEnvironment,
  assertMeteoraWritesEnabled,
  createVirtualPool,
  executeDbcSwap,
  executeDammV2Swap,
  fromRawAmount,
  readLiquidityLifecycle,
  resolveSwapMints,
  simulateDlmmLiquidityTransaction,
  toRawAmount,
  validateSwapAmount,
  validateSwapSlippage,
  withReadRetry,
  type SolanaProvider,
} from "./meteora";

// Tests must be independent of the developer's local .env values.
beforeEach(() => {
  vi.stubEnv("VITE_METEORA_ENABLE_TRANSACTIONS", "");
  vi.stubEnv("VITE_METEORA_DBC_POOL", "");
  vi.stubEnv("VITE_METEORA_DAMM_V2_POOL", "");
  vi.stubEnv("VITE_METEORA_DLMM_POOL", "");
  vi.stubEnv("VITE_METEORA_DAMM_V2_CONFIG", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const readOnlyProvider = {} as SolanaProvider;
const sendingProvider = {
  sendTransaction: async () => "test-signature",
} as SolanaProvider;

describe("Meteora transaction validation", () => {
  it("keeps transaction writes disabled by default", () => {
    expect(() => assertMeteoraWritesEnabled()).toThrow("Meteora transactions are disabled");
  });
  it("allows the configured Devnet network", () => {
    expect(() => assertDevnetEnvironment()).not.toThrow();
  });
  it("rejects swaps with a non-positive amount before building a transaction", async () => {
    await expect(
      executeDbcSwap({
        walletAddress: "11111111111111111111111111111111",
        amountSol: 0,
        buyBaseToken: true,
        provider: sendingProvider,
      })
    ).rejects.toThrow("Swap amount must be greater than zero");
  });

  it("rejects transactions when the wallet cannot send", async () => {
    await expect(
      executeDbcSwap({
        walletAddress: "11111111111111111111111111111111",
        amountSol: 0.01,
        buyBaseToken: true,
        provider: readOnlyProvider,
      })
    ).rejects.toThrow("Connected wallet cannot send transactions");
  });

  it("rejects virtual-pool creation with a non-positive initial buy", async () => {
    await expect(
      createVirtualPool({
        walletAddress: "11111111111111111111111111111111",
        amountSol: 0,
        provider: sendingProvider,
      })
    ).rejects.toThrow("Initial liquidity amount must be greater than zero");
  });
});

describe("Local liquidity lifecycle", () => {
  it("reports optional DAMM v2 and DLMM stages as not configured by default", async () => {
    const lifecycle = await readLiquidityLifecycle();
    expect(lifecycle.dammV2.status).toBe("not-configured");
    expect(lifecycle.dlmm.status).toBe("not-configured");
    expect(lifecycle.dammV2.poolAddress).toBeNull();
    expect(lifecycle.dlmm.poolAddress).toBeNull();
  });
});

describe("Read-only RPC and SDK retry policy", () => {
  it("retries transient RPC/SDK errors and returns the later success", async () => {
    let attempts = 0;
    const result = await withReadRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("RPC timeout while fetching DLMM account");
        return "ok";
      },
      { retries: 2, delayMs: 0 }
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("does not retry invalid configuration errors", async () => {
    let attempts = 0;
    await expect(
      withReadRetry(
        async () => {
          attempts += 1;
          throw new Error("PublicKey is invalid");
        },
        { retries: 2, delayMs: 0 }
      )
    ).rejects.toThrow("PublicKey is invalid");
    expect(attempts).toBe(1);
  });
});

describe("DBC to DAMM v2 to DLMM orchestration plan", () => {
  it("blocks downstream stages until the DBC pool is verified", () => {
    const plan = createLiquidityLifecyclePlan({
      dbcPoolAddress: null,
      dbcPoolFound: null,
      lifecycle: null,
    });
    expect(plan.stages.map(stage => stage.status)).toEqual(["blocked", "blocked", "blocked"]);
    expect(plan.nextAction).toContain("Configure and verify");
  });

  it("moves through DAMM v2 and DLMM readiness in order", () => {
    const plan = createLiquidityLifecyclePlan({
      dbcPoolAddress: "pool",
      dbcPoolFound: true,
      lifecycle: {
        dammV2: { status: "ready", poolAddress: "damm", message: "ready" },
        dlmm: { status: "not-configured", poolAddress: null, message: "pending" },
      },
    });
    expect(plan.stages.map(stage => stage.status)).toEqual(["ready", "ready", "pending"]);
    expect(plan.nextAction).toContain("DLMM pool");
  });
});

describe("DBC to DAMM v2 migration builder", () => {
  it("requires a verified DBC pool configuration", async () => {
    await expect(
      buildDammV2MigrationPreview({
        walletAddress: "11111111111111111111111111111111",
      })
    ).rejects.toThrow("VITE_METEORA_DBC_POOL is not configured");
  });

  it("requires an explicit DAMM v2 config before building", async () => {
    await expect(
      buildDammV2MigrationPreview({
        walletAddress: "11111111111111111111111111111111",
        poolAddress: "11111111111111111111111111111111",
      })
    ).rejects.toThrow("VITE_METEORA_DAMM_V2_CONFIG is not configured");
  });
});

describe("DLMM liquidity simulation", () => {
  it("creates a spot strategy preview without submission", () => {
    const preview = simulateDlmmLiquidityTransaction({
      activeBinId: 42,
      binRange: 3,
      totalXAmount: 0.1,
      totalYAmount: 0.2,
    });
    expect(preview.strategy).toBe("spot");
    expect(preview.minBinId).toBe(39);
    expect(preview.maxBinId).toBe(45);
    expect(preview.submitted).toBe(false);
  });
});

describe("DAMM v2 swap inputs", () => {
  it("accepts slippage inside the allowed range and rejects outside values", () => {
    expect(() => validateSwapSlippage(100)).not.toThrow();
    expect(() => validateSwapSlippage(10)).not.toThrow();
    expect(() => validateSwapSlippage(1000)).not.toThrow();
    expect(() => validateSwapSlippage(5)).toThrow("Slippage must be between");
    expect(() => validateSwapSlippage(1001)).toThrow("Slippage must be between");
    expect(() => validateSwapSlippage(Number.NaN)).toThrow("Slippage must be between");
  });

  it("requires a positive finite swap amount", () => {
    expect(() => validateSwapAmount(0.01)).not.toThrow();
    expect(() => validateSwapAmount(0)).toThrow("Swap amount must be greater than zero");
    expect(() => validateSwapAmount(-1)).toThrow("Swap amount must be greater than zero");
    expect(() => validateSwapAmount(Number.NaN)).toThrow("Swap amount must be greater than zero");
  });

  it("converts human amounts to raw units and back", () => {
    expect(toRawAmount(0.01, 9).toString()).toBe("10000000");
    expect(toRawAmount(1.5, 6).toString()).toBe("1500000");
    expect(fromRawAmount("10000000", 9)).toBeCloseTo(0.01);
    expect(fromRawAmount("1500000", 6)).toBeCloseTo(1.5);
  });

  it("maps swap directions onto the pool's A/B mints regardless of side", () => {
    const baseMint = new PublicKey("7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9");
    const nativeMint = new PublicKey("So11111111111111111111111111111111111111112");
    const baseIsA = resolveSwapMints({ tokenAMint: baseMint, tokenBMint: nativeMint }, "sol-to-agnt");
    expect(baseIsA.inputTokenMint.equals(nativeMint)).toBe(true);
    expect(baseIsA.outputTokenMint.equals(baseMint)).toBe(true);
    const baseIsB = resolveSwapMints({ tokenAMint: nativeMint, tokenBMint: baseMint }, "agnt-to-sol");
    expect(baseIsB.inputTokenMint.equals(baseMint)).toBe(true);
    expect(baseIsB.outputTokenMint.equals(nativeMint)).toBe(true);
  });

  it("rejects swaps when transaction writes are disabled", async () => {
    await expect(
      executeDammV2Swap({
        walletAddress: "11111111111111111111111111111111",
        direction: "sol-to-agnt",
        amount: 0.01,
        provider: sendingProvider,
      })
    ).rejects.toThrow("Meteora transactions are disabled");
  });

  it("rejects swaps with an invalid amount before touching the network", async () => {
    await expect(
      executeDammV2Swap({
        walletAddress: "11111111111111111111111111111111",
        direction: "sol-to-agnt",
        amount: 0,
        provider: sendingProvider,
      })
    ).rejects.toThrow("Swap amount must be greater than zero");
  });

  it("rejects swaps when the wallet cannot send", async () => {
    await expect(
      executeDammV2Swap({
        walletAddress: "11111111111111111111111111111111",
        direction: "agnt-to-sol",
        amount: 1,
        provider: readOnlyProvider,
      })
    ).rejects.toThrow("Connected wallet cannot send transactions");
  });
});
