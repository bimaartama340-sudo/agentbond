import { describe, expect, it } from "vitest";
import { classifyAppError } from "./ErrorBoundary";

describe("classifyAppError", () => {
  it("classifies RPC and network failures", () => {
    expect(classifyAppError(new Error("Solana RPC timeout"))).toBe("rpc");
    expect(classifyAppError(new Error("fetch failed with 503"))).toBe("rpc");
  });

  it("classifies wallet signing failures", () => {
    expect(classifyAppError(new Error("User rejected the request"))).toBe("wallet");
    expect(classifyAppError(new Error("Phantom provider unavailable"))).toBe("wallet");
  });

  it("classifies Meteora SDK failures", () => {
    expect(classifyAppError(new Error("Meteora DLMM PublicKey is invalid"))).toBe("sdk");
    expect(classifyAppError(new Error("DAMM v2 SDK transaction failed"))).toBe("sdk");
  });

  it("keeps unrelated failures in the application category", () => {
    expect(classifyAppError(new Error("Unexpected render failure"))).toBe("application");
    expect(classifyAppError(null)).toBe("application");
  });
});
