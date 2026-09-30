import { describe, expect, it } from "vitest";
import {
  calculateAgntApy,
  calculateAgntReward,
  getTelemetryPeriodOffset,
  simulatedWallets,
} from "./simulations";

describe("AGNT staking simulation", () => {
  it("calculates a pro-rated reward without negative inputs", () => {
    expect(calculateAgntReward(1000, 30)).toBe(10.52);
    expect(calculateAgntReward(-100, -10)).toBe(0);
  });

  it("increases the simulated APY for longer lock periods", () => {
    expect(calculateAgntApy(30)).toBe(12.8);
    expect(calculateAgntApy(60)).toBe(14.2);
    expect(calculateAgntApy(90)).toBe(15.4);
  });

  it("exposes clearly labeled fake wallet identities", () => {
    expect(simulatedWallets.phantom.network).toBe("Solana testnet");
    expect(simulatedWallets.metamask.address).toContain("0xAGNT");
  });

  it("maps telemetry windows to stable preview offsets", () => {
    expect(getTelemetryPeriodOffset("24H")).toBe(0);
    expect(getTelemetryPeriodOffset("7D")).toBe(-3);
    expect(getTelemetryPeriodOffset("30D")).toBe(-7);
  });
});
