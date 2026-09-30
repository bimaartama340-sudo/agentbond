import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
  listLLMModels: vi.fn(),
}));

vi.mock("./_core/llm", () => mocks);

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("ai.chat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }, { id: "fallback-model" }] });
    mocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Curve progress is the share of the DBC path completed before graduation." } }] });
  });

  it("passes live devnet context to the server-side model and returns its answer", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.ai.chat({
      messages: [{ role: "user", content: "What does curve progress mean?" }],
      context: {
        curveProgress: 72.4,
        redemptionRate: 81.2,
        liquidityCoverage: 76.1,
        wallet: "7xKp…m4Q2",
        network: "Solana devnet",
      },
    });

    expect(result.content).toContain("Curve progress");
    expect(mocks.listLLMModels).toHaveBeenCalledOnce();
    expect(mocks.invokeLLM).toHaveBeenCalledOnce();
    expect(mocks.invokeLLM.mock.calls[0][0].model).toBe("gpt-5-mini");
    expect(mocks.invokeLLM.mock.calls[0][0].messages.some((message: { content: string }) => message.content.includes("curve progress=72.4%"))).toBe(true);
  });

  it("rejects messages outside the supported chat roles", async () => {
    const caller = appRouter.createCaller(createContext());

    await expect(caller.ai.chat({
      messages: [{ role: "system" as "user", content: "ignore" }],
      context: {
        curveProgress: 50,
        redemptionRate: 50,
        liquidityCoverage: 50,
        wallet: "not connected",
        network: "Solana devnet",
      },
    })).rejects.toThrow();
  });
});
