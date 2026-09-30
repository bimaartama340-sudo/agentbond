import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAgntStakingPosition: vi.fn(),
  getAgntStakingSummary: vi.fn(),
  listAgntStakingPositions: vi.fn(),
  unstakeAgntPosition: vi.fn(),
}));

vi.mock("./db", () => mocks);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: { openId: "user-1" } as TrpcContext["user"],
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("staking persistence procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAgntStakingPositions.mockResolvedValue([]);
    mocks.getAgntStakingSummary.mockResolvedValue({ totalPositions: 2, activePositions: 1, totalStaked: 1000, totalRewards: 10.52, lastActivityAt: null });
    mocks.createAgntStakingPosition.mockResolvedValue({ id: 4, walletAddress: "7xKp4n…m4Q2", amount: 1000, durationDays: 30, reward: "10.52", status: "active" });
    mocks.unstakeAgntPosition.mockResolvedValue({ id: 4, walletAddress: "7xKp4n…m4Q2", amount: 1000, durationDays: 30, reward: "10.52", status: "unstaked" });
  });

  it("lists paginated positions for the authenticated account and wallet", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.staking.list({ walletAddress: "7xKp4n…m4Q2", startDate: "2026-09-01", endDate: "2026-09-20", page: 2, pageSize: 5 });
    expect(mocks.listAgntStakingPositions).toHaveBeenCalledWith("user-1", { walletAddress: "7xKp4n…m4Q2", status: "all", search: "", startDate: "2026-09-01", endDate: "2026-09-20", limit: 5, offset: 5 });
  });

  it("formats reward values before persisting a position", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.staking.create({ walletAddress: "7xKp4n…m4Q2", amount: 1000, durationDays: 30, reward: 10.525 });
    expect(mocks.createAgntStakingPosition).toHaveBeenCalledWith({ ownerOpenId: "user-1", walletAddress: "7xKp4n…m4Q2", amount: 1000, durationDays: 30, reward: "10.53" });
  });

  it("scopes an unstake request to the account and wallet", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.staking.unstake({ id: 4, walletAddress: "7xKp4n…m4Q2" });
    expect(mocks.unstakeAgntPosition).toHaveBeenCalledWith(4, "user-1", "7xKp4n…m4Q2");
  });

  it("uses the account scope for complete CSV export data", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.staking.export({ walletAddress: "7xKp4n…m4Q2" });
    expect(mocks.listAgntStakingPositions).toHaveBeenCalledWith("user-1", { walletAddress: "7xKp4n…m4Q2", status: "all", search: "", startDate: undefined, endDate: undefined, limit: 1000, offset: 0 });
  });

  it("rejects private history access without a session", async () => {
    const caller = appRouter.createCaller({ ...createContext(), user: null });
    await expect(caller.staking.list({ walletAddress: "7xKp4n…m4Q2" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns the authenticated account activity summary", async () => {
    const caller = appRouter.createCaller(createContext());
    await caller.staking.summary({ activityDays: 30 });
    expect(mocks.getAgntStakingSummary).toHaveBeenCalledWith("user-1", 30);
  });
});
