import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { invokeLLM, listLLMModels } from "./_core/llm.js";
import { systemRouter } from "./_core/systemRouter.js";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc.js";
import { sdk } from "./_core/sdk.js";
import { createAgntStakingPosition, getAgntStakingSummary, getNotificationPreferences, listAgntStakingPositions, listExpiringAgntStakingPositions, unstakeAgntPosition, updateNotificationPreferences } from "./db.js";

const chatMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(3000),
});

const telemetryContext = z.object({
  curveProgress: z.number().min(0).max(100),
  redemptionRate: z.number().min(0).max(100),
  liquidityCoverage: z.number().min(0).max(100),
  wallet: z.string().max(120),
  network: z.literal("Solana devnet"),
});

const SYSTEM_PROMPT = `You are AgentBond Copilot, a concise product guide inside a Solana devnet prototype. Explain the DBC lifecycle in plain language: DBC handles programmable price discovery in a virtual pool, graduation moves liquidity to DAMM v2, and DLMM concentrates active liquidity into price bands. Explain the telemetry metrics without making investment promises. Never claim that a transaction was signed, never invent an on-chain signature, and remind users this prototype is in devnet simulation mode when relevant. Keep answers under 120 words. Use short paragraphs or bullets.`;

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    session: publicProcedure.query(({ ctx }) => sdk.getSessionExpiry(ctx.req)),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  notifications: router({
    preferences: protectedProcedure.query(({ ctx }) => getNotificationPreferences(ctx.user.openId)),
    updatePreferences: protectedProcedure.input(z.object({ sessionExpiry: z.boolean(), stakingActivity: z.boolean(), stakingExpiry: z.boolean() })).mutation(({ ctx, input }) => updateNotificationPreferences(ctx.user.openId, input)),
  }),
  ai: router({
    chat: publicProcedure
      .input(z.object({ messages: z.array(chatMessage).max(12), context: telemetryContext }))
      .mutation(async ({ input }) => {
        const { data } = await listLLMModels();
        const model = data.find((candidate) => candidate.id === "gpt-5-mini")?.id ?? data[0]?.id;
        const context = `Live context: network=${input.context.network}; wallet=${input.context.wallet}; curve progress=${input.context.curveProgress.toFixed(1)}%; redemption rate=${input.context.redemptionRate.toFixed(1)}%; liquidity coverage=${input.context.liquidityCoverage.toFixed(1)}%.`;
        const response = await invokeLLM({
          model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "system", content: context },
            ...input.messages.map((message) => ({ role: message.role, content: message.content })),
          ],
          maxTokens: 500,
          reasoning: { effort: "minimal" },
        });
        const content = response.choices[0]?.message?.content;
        const text = typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((part) => (typeof part === "string" ? part : "text" in part ? part.text : "")).join("\n").trim()
            : "";
        return {
          content: text || "The co-pilot returned no text. Try asking about one metric at a time.",
        };
      }),
  }),
  staking: router({
    list: protectedProcedure
      .input(z.object({ walletAddress: z.string().trim().min(3).max(120).optional(), status: z.enum(["all", "active", "unstaked"]).default("all"), search: z.string().trim().max(120).default(""), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(25).default(5) }))
      .query(({ ctx, input }) => listAgntStakingPositions(ctx.user.openId, { walletAddress: input.walletAddress, status: input.status, search: input.search, startDate: input.startDate, endDate: input.endDate, limit: input.pageSize, offset: (input.page - 1) * input.pageSize })),
    export: protectedProcedure
      .input(z.object({ walletAddress: z.string().trim().min(3).max(120).optional(), status: z.enum(["all", "active", "unstaked"]).default("all"), search: z.string().trim().max(120).default(""), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))
      .query(({ ctx, input }) => listAgntStakingPositions(ctx.user.openId, { walletAddress: input.walletAddress, status: input.status, search: input.search, startDate: input.startDate, endDate: input.endDate, limit: 1000, offset: 0 })),
    create: protectedProcedure
      .input(z.object({
        walletAddress: z.string().trim().min(3).max(120),
        amount: z.number().int().min(1).max(1_000_000_000),
        durationDays: z.number().int().min(1).max(3650),
        reward: z.number().min(0).max(1_000_000_000),
      }))
      .mutation(({ ctx, input }) => createAgntStakingPosition({ ...input, ownerOpenId: ctx.user.openId, reward: input.reward.toFixed(2) })),
    unstake: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), walletAddress: z.string().trim().min(3).max(120) }))
      .mutation(({ ctx, input }) => unstakeAgntPosition(input.id, ctx.user.openId, input.walletAddress)),
    summary: protectedProcedure.input(z.object({ activityDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30) })).query(({ ctx, input }) => getAgntStakingSummary(ctx.user.openId, input.activityDays)),
    expiring: protectedProcedure.query(({ ctx }) => listExpiringAgntStakingPositions(ctx.user.openId, 3)),
  }),
});

export type AppRouter = typeof appRouter;
