import { describe, expect, it, vi } from "vitest";
vi.mock("@meteora-ag/cp-amm-sdk", () => ({ CpAmm: class {} }));
vi.mock("@meteora-ag/dlmm", () => ({ default: { create: vi.fn() } }));
import {
  createLiquidityLifecyclePlan,
  simulateDlmmLiquidityTransaction,
} from "./meteora";

describe("AgentBond liquidity lifecycle E2E", () => {
  it("moves from verified DBC through DAMM v2 into a DLMM preview", () => {
    const plan = createLiquidityLifecyclePlan({
      dbcPoolAddress: "dbc-pool",
      dbcPoolFound: true,
      lifecycle: {
        dammV2: { status: "ready", poolAddress: "damm-pool", message: "ready" },
        dlmm: { status: "ready", poolAddress: "dlmm-pool", message: "ready" },
      },
    });
    const simulation = simulateDlmmLiquidityTransaction({
      activeBinId: 100,
      binRange: 5,
      totalXAmount: 0.1,
      totalYAmount: 0.1,
      strategy: "spot",
    });
    expect(plan.stages.map(stage => stage.status)).toEqual(["ready", "ready", "ready"]);
    expect(plan.nextAction).toContain("transaction builders");
    expect(simulation.minBinId).toBe(95);
    expect(simulation.maxBinId).toBe(105);
    expect(simulation.requiresWalletApproval).toBe(true);
    expect(simulation.submitted).toBe(false);
  });

  it("rejects an unsafe DLMM simulation amount", () => {
    expect(() =>
      simulateDlmmLiquidityTransaction({
        activeBinId: 100,
        totalXAmount: 0,
        totalYAmount: 0.1,
      })
    ).toThrow("DLMM token X amount must be greater than zero");
  });
});
