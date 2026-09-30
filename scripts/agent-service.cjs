#!/usr/bin/env node
/**
 * AgentBond agent service (Devnet).
 *
 * Watches the agent's service wallet for on-chain "tasks" (SOL transfer +
 * prompt memo), answers them via memo transactions, and spends a fixed share
 * of every payment buying back its own token on its DAMM v2 market. The
 * buyback is a plain on-chain swap signed by the agent keypair — the token
 * sink is fully verifiable in the Explorer.
 *
 * Keypair: AGENT_PRIVATE_KEY in the env file OUTSIDE this repo (never logged).
 * Optional LLM: AGENT_LLM_ENDPOINT (OpenAI-compatible), AGENT_LLM_API_KEY,
 * AGENT_LLM_MODEL. Without them the agent replies with a deterministic
 * fallback so the loop stays testable.
 *
 * Usage: AGENT_ENV_PATH=~/.config/agentbond.env node scripts/agent-service.cjs
 */

const fs = require("fs");
const path = require("path");
const BN = require("bn.js");
const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  unpackMint,
  TOKEN_PROGRAM_ID,
  NATIVE_MINT,
} = require("@solana/spl-token");
const { CpAmm } = require("@meteora-ag/cp-amm-sdk");

const DEFAULT_ENV_PATH = path.join(
  process.env.HOME ?? "",
  "Documents/AgentBond/meteora-invent/studio/.env"
);

const RPC = "https://api.devnet.solana.com";
const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
// Defaults = canonical AGNT market (client/src/data/canonicalPools.ts).
// Any pool can run its own agent: set AGENT_MARKET_POOL + AGENT_TOKEN_MINT.
const DEFAULT_MARKET_POOL = "Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw";
const DEFAULT_TOKEN_MINT = "7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9";
const BUYBACK_MIN_LAMPORTS = 60_000; // below this a swap is not worth the fee
const POLL_MS = 15_000;
const MEMO_CHUNK = 400;
const SLIPPAGE_BPS = 200;
const ONCE = process.argv.includes("--once");

function loadEnvAgentKeypair() {
  const envPath = process.env.AGENT_ENV_PATH ?? DEFAULT_ENV_PATH;
  const env = fs.readFileSync(envPath, "utf8");
  // Optional settings live in the same file; process env wins if set.
  for (const key of [
    "AGENT_LLM_ENDPOINT",
    "AGENT_LLM_API_KEY",
    "AGENT_LLM_MODEL",
    "AGENT_BUYBACK_BPS",
    "AGENT_MARKET_POOL",
    "AGENT_TOKEN_MINT",
    "AGENT_TOKEN_SYMBOL",
    "AGENT_LLM_MAX_TOKENS",
  ]) {
    const setting = env.match(new RegExp(`^${key}\\s*=\\s*["']?([^"'\\r\\n]+)["']?\\s*$`, "m"));
    if (setting && !process.env[key]) process.env[key] = setting[1].trim();
  }
  const match = env.match(/^AGENT_PRIVATE_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
  if (!match) throw new Error(`AGENT_PRIVATE_KEY not found in ${envPath}`);
  const raw = match[1].trim();
  const secret = raw.startsWith("[")
    ? Uint8Array.from(JSON.parse(raw))
    : Uint8Array.from(bs58Decode(raw));
  return Keypair.fromSecretKey(secret);
}

function bs58Decode(input) {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let number = 0n;
  for (const character of input) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error(`invalid base58: ${JSON.stringify(character)}`);
    number = number * 58n + BigInt(index);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  return Buffer.from(hex, "hex");
}

function chunkMemo(text) {
  const chunks = [];
  for (let index = 0; index < text.length; index += MEMO_CHUNK) {
    chunks.push(text.slice(index, index + MEMO_CHUNK));
  }
  return chunks.length > 0 ? chunks : ["(empty)"];
}

/** Which pool side is SOL, which is the agent token, plus real decimals. */
function resolveMarketSides(poolState) {
  const tokenA = poolState.tokenAMint.toBase58();
  const tokenB = poolState.tokenBMint.toBase58();
  const token = process.env.AGENT_TOKEN_MINT;
  const solSide = tokenA === NATIVE_MINT.toBase58() ? "A" : "B";
  const tokenSide = tokenA === token ? "A" : tokenB === token ? "B" : null;
  if (!tokenSide || (solSide === tokenSide)) {
    throw new Error(
      `pool ${tokenA} / ${tokenB} does not contain SOL + ${token}`
    );
  }
  return {
    quoteMint: solSide === "A" ? poolState.tokenAMint : poolState.tokenBMint,
    baseMint: tokenSide === "A" ? poolState.tokenAMint : poolState.tokenBMint,
    quoteVault: solSide === "A" ? poolState.tokenAVault : poolState.tokenBVault,
    baseVault: tokenSide === "A" ? poolState.tokenAVault : poolState.tokenBVault,
    quoteSide: solSide,
    baseSide: tokenSide,
  };
}

async function mintDecimals(connection, mint, fallback) {
  try {
    const info = await connection.getAccountInfo(mint);
    if (!info) return fallback;
    return unpackMint(info.data, info, TOKEN_PROGRAM_ID).decimals;
  } catch {
    return fallback;
  }
}

/**
 * Live on-chain market snapshot injected into every LLM call, so answers
 * about the agent's own market are specific and independently verifiable.
 */
async function marketSnapshot(connection, cp, poolState, agent) {
  const sides = resolveMarketSides(poolState);
  const quoteDecimals = await mintDecimals(connection, sides.quoteMint, 9);
  const baseDecimals = await mintDecimals(connection, sides.baseMint, 6);
  const [solVault, tokenVault, agentTokenAta] = await Promise.all([
    connection.getTokenAccountBalance(sides.quoteVault),
    connection.getTokenAccountBalance(sides.baseVault),
    connection
      .getTokenAccountBalance(
        getAssociatedTokenAddressSync(sides.baseMint, agent.publicKey, false, TOKEN_PROGRAM_ID)
      )
      .catch(() => ({ value: { uiAmount: 0 } })),
  ]);
  const solLiquidity = solVault.value.uiAmount ?? 0;
  const tokenLiquidity = tokenVault.value.uiAmount ?? 0;
  const solPerToken = tokenLiquidity > 0 ? solLiquidity / tokenLiquidity : 0;
  const tokensPerSol = solLiquidity > 0 ? tokenLiquidity / solLiquidity : 0;
  let buyQuote = "n/a";
  try {
    const quote = cp.getQuote({
      inAmount: new BN(Math.round(0.01 * LAMPORTS_PER_SOL)),
      inputTokenMint: sides.quoteMint,
      slippage: SLIPPAGE_BPS,
      poolState,
      currentTime: Math.floor(Date.now() / 1000),
      currentSlot: await connection.getSlot("confirmed"),
      tokenADecimal: sides.quoteSide === "A" ? quoteDecimals : baseDecimals,
      tokenBDecimal: sides.quoteSide === "A" ? baseDecimals : quoteDecimals,
      hasReferral: false,
    });
    const out = Number(quote.swapOutAmount.toString()) / 10 ** baseDecimals;
    buyQuote = `${out.toFixed(2)} tokens for 0.01 SOL`;
  } catch {
    // Quote may fail on a thin pool; the ratios above still hold.
  }
  return {
    text:
      `Live on-chain market snapshot (verify on Solana explorer): ` +
      `pool liquidity ${solLiquidity.toFixed(4)} SOL / ${tokenLiquidity.toFixed(0)} tokens; ` +
      `spot ${tokensPerSol.toFixed(0)} tokens per SOL (${solPerToken.toExponential(3)} SOL per token); ` +
      `quote: ${buyQuote}; agent treasury ${agentTokenAta.value?.uiAmount?.toFixed?.(2) ?? 0} tokens ` +
      `accumulated via revenue buybacks.`,
    sides,
    quoteDecimals,
    baseDecimals,
  };
}

// Rate-limit protection: Groq free tier counts requests (RPM/RPD) and
// tokens (TPM/TPD). Keep every call small and space them out; on failure
// degrade to the local fallback so users always get a reply.
const LLM_MAX_PROMPT_CHARS = 500;
const LLM_MIN_INTERVAL_MS = 5_000;
let lastLlmCallAt = 0;

async function callLlm(prompt, marketContext) {
  const endpoint = process.env.AGENT_LLM_ENDPOINT;
  const apiKey = process.env.AGENT_LLM_API_KEY;
  const model = process.env.AGENT_LLM_MODEL ?? "gpt-4o-mini";
  const symbol = process.env.AGENT_TOKEN_SYMBOL ?? "my token";
  const trimmed = prompt.trim().slice(0, LLM_MAX_PROMPT_CHARS);
  // Reasoning models spend budget on hidden reasoning tokens, so the cap
  // must cover thinking + the answer; reasoning_effort keeps it small.
  const maxTokens = Number(process.env.AGENT_LLM_MAX_TOKENS ?? 1000);
  const system =
    `You are the AgentBond service agent for ${symbol} on Solana devnet. ` +
    "Answer in plain text, under 300 characters, no markdown. " +
    "Reply in the language of the task. When asked about your market or token, use the snapshot data and stay consistent with it.\n" +
    (marketContext ?? "");
  const messages = [
    { role: "system", content: system },
    { role: "user", content: trimmed },
  ];
  const call = () =>
    fetch(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: maxTokens, reasoning_effort: "low", messages }),
    });
  if (!endpoint || !apiKey) {
    return fallbackReply(trimmed, "LLM not configured");
  }
  // Space out calls to stay under the per-minute request limit.
  const waitMs = lastLlmCallAt + LLM_MIN_INTERVAL_MS - Date.now();
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastLlmCallAt = Date.now();
  const response = await call();
  if (!response.ok) {
    // One patient retry on rate limit, then fall back instead of failing.
    if (response.status === 429) {
      await new Promise(resolve => setTimeout(resolve, 8_000));
      lastLlmCallAt = Date.now();
      const retry = await call();
      if (retry.ok) {
        const payload = await retry.json();
        const text = payload.choices?.[0]?.message?.content?.trim();
        if (text) return text;
      }
    }
    return fallbackReply(trimmed, `LLM HTTP ${response.status}`);
  }
  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) return fallbackReply(trimmed, "empty LLM reply");
  return text;
}

function fallbackReply(prompt, reason) {
  const summary = prompt.length > 120 ? `${prompt.slice(0, 120)}…` : prompt;
  return (
    `[agent] Task received on-chain: "${summary}". ` +
    `I am the AgentBond service agent. Revenue from this task funds my own market — ` +
    `part of your payment is being swapped into my token right now. ` +
    `(${reason} — reduced-brain mode.)`
  );
}

async function sendMemoReply(connection, agent, text) {
  const transaction = new Transaction().add(
    // The memo program burns ~60k CUs per instruction (UTF-8 validation).
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })
  );
  for (const chunk of chunkMemo(text)) {
    transaction.add(
      new TransactionInstruction({
        programId: MEMO_PROGRAM_ID,
        keys: [{ pubkey: agent.publicKey, isSigner: true, isWritable: false }],
        data: Buffer.from(chunk, "utf8"),
      })
    );
  }
  const signature = await sendAndConfirmTransaction(connection, transaction, [agent]);
  return signature;
}

async function buyback(connection, agent, paymentLamports, poolState, market) {
  const buybackBps = Number(process.env.AGENT_BUYBACK_BPS ?? 5000);
  const lamports = Math.floor((paymentLamports * buybackBps) / 10_000);
  if (lamports < BUYBACK_MIN_LAMPORTS) {
    return { skipped: true, reason: `payment too small for a buyback (${lamports} lamports)` };
  }
  const cp = new CpAmm(connection);
  const inputMint = market.sides.quoteMint;
  const outputMint = market.sides.baseMint;
  const quote = cp.getQuote({
    inAmount: new BN(lamports),
    inputTokenMint: inputMint,
    slippage: SLIPPAGE_BPS,
    poolState,
    currentTime: Math.floor(Date.now() / 1000),
    currentSlot: await connection.getSlot("confirmed"),
    tokenADecimal: market.sides.quoteSide === "A" ? market.quoteDecimals : market.baseDecimals,
    tokenBDecimal: market.sides.quoteSide === "A" ? market.baseDecimals : market.quoteDecimals,
    hasReferral: false,
  });
  if (!quote || quote.swapOutAmount.lte(new BN(0))) {
    return { skipped: true, reason: "quote returned zero output" };
  }
  const agentAta = getAssociatedTokenAddressSync(outputMint, agent.publicKey, false, TOKEN_PROGRAM_ID);
  const transaction = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(
      agent.publicKey,
      agentAta,
      agent.publicKey,
      outputMint,
      TOKEN_PROGRAM_ID
    ),
    ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })
  );
  transaction.add(
    await cp.swap({
      payer: agent.publicKey,
      pool: market.pool,
      inputTokenMint: inputMint,
      outputTokenMint: outputMint,
      amountIn: new BN(lamports),
      minimumAmountOut: quote.minSwapOutAmount,
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
      referralTokenAccount: null,
      poolState,
    })
  );
  const signature = await sendAndConfirmTransaction(connection, transaction, [agent]);
  return {
    skipped: false,
    signature,
    lamports,
    outRaw: quote.swapOutAmount.toString(),
    outMinimumRaw: quote.minSwapOutAmount.toString(),
  };
}

function extractMemoAndIncoming(tx, agentAddress) {
  let memo = "";
  for (const instruction of tx.transaction.message.instructions) {
    const program = instruction.programId?.toBase58?.() ?? "";
    if (program === MEMO_PROGRAM_ID.toBase58()) {
      if (typeof instruction.data === "string") {
        memo += Buffer.from(instruction.data, "base64").toString("utf8");
      } else if (typeof instruction.parsed === "string") {
        memo += instruction.parsed;
      } else if (instruction.parsed?.info?.memo) {
        memo += instruction.parsed.info.memo;
      }
    } else if (instruction.parsed?.type === "memo" && instruction.parsed?.info?.memo) {
      memo += instruction.parsed.info.memo;
    }
  }
  const keys = tx.transaction.message.accountKeys.map(k => k.pubkey.toBase58());
  const agentIndex = keys.indexOf(agentAddress);
  const incoming =
    agentIndex >= 0 ? tx.meta.postBalances[agentIndex] - tx.meta.preBalances[agentIndex] : 0;
  return { memo, incoming, feePayer: keys[0], keys };
}

async function main() {
  const agent = loadEnvAgentKeypair();
  const connection = new Connection(RPC, "confirmed");
  const cp = new CpAmm(connection);
  const buybackBps = Number(process.env.AGENT_BUYBACK_BPS ?? 5000);
  process.env.AGENT_MARKET_POOL ??= DEFAULT_MARKET_POOL;
  process.env.AGENT_TOKEN_MINT ??= DEFAULT_TOKEN_MINT;
  const marketPool = new PublicKey(process.env.AGENT_MARKET_POOL);
  console.log(`[agent] wallet ${agent.publicKey.toBase58()}`);
  console.log(`[agent] market ${marketPool.toBase58()} · buyback ${buybackBps / 100}% of each payment`);
  console.log(`[agent] llm ${process.env.AGENT_LLM_ENDPOINT ? "remote" : "local-fallback"}`);

  const poolState = await cp.fetchPoolState(marketPool);
  const market = {
    pool: marketPool,
    ...await marketSnapshot(connection, cp, poolState, agent),
  };
  console.log(`[agent] snapshot: ${market.text.slice(0, 180)}…`);
  const startSlot = await connection.getSlot("confirmed");
  const processed = new Set();
  console.log(`[agent] watching from slot ${startSlot} · polling every ${POLL_MS / 1000}s${ONCE ? " · ONE-SHOT MODE" : ""}`);

  const tick = async () => {
    try {
      const signatures = await connection.getSignaturesForAddress(
        agent.publicKey,
        { limit: 15 },
        "confirmed"
      );
      for (const entry of signatures.reverse()) {
        if (processed.has(entry.signature) || (entry.slot ?? 0) <= startSlot) continue;
        processed.add(entry.signature);
        const tx = await connection.getParsedTransaction(entry.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: "confirmed",
        });
        if (!tx || tx.meta?.err) continue;
        const { memo, incoming, feePayer } = extractMemoAndIncoming(
          tx,
          agent.publicKey.toBase58()
        );
        const isTask = feePayer !== agent.publicKey.toBase58() && incoming > 0 && memo;
        if (!isTask) continue;
        const paymentLamports = incoming;
        console.log(`\n[task] ${entry.signature}`);
        console.log(`[task] from ${feePayer} · ${(paymentLamports / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
        console.log(`[task] prompt: ${memo.slice(0, 160)}${memo.length > 160 ? "…" : ""}`);
        // Fresh snapshot per task so replies always reflect the live market.
        try {
          Object.assign(market, await marketSnapshot(connection, cp, poolState, agent));
        } catch (error) {
          console.error(`[snapshot] ${String(error).slice(0, 160)}`);
        }
        try {
          let reply;
          try {
            reply = await callLlm(memo, market.text);
          } catch (error) {
            console.error(`[reply] llm error: ${String(error).slice(0, 200)}`);
            reply = fallbackReply(memo, "LLM unreachable");
          }
          const replySig = await sendMemoReply(connection, agent, reply);
          console.log(`[reply] ${replySig}`);
        } catch (error) {
          console.error(`[reply] failed: ${String(error).slice(0, 200)}`);
        }
        try {
          const result = await buyback(connection, agent, paymentLamports, poolState, { ...market, pool: marketPool });
          if (result.skipped) {
            console.log(`[buyback] skipped: ${result.reason}`);
          } else {
            console.log(
              `[buyback] ${result.lamports} lamports → ${result.outRaw} token raw (min ${result.outMinimumRaw}) · ${result.signature}`
            );
          }
        } catch (error) {
          console.error(`[buyback] failed: ${String(error).slice(0, 200)}`);
        }
      }
    } catch (error) {
      console.error(`[poll] ${String(error).slice(0, 200)}`);
    }
  };

  await tick();
  if (ONCE) {
    console.log("[agent] one-shot done, exiting");
    return;
  }
  setInterval(tick, POLL_MS);
}

main().catch(error => {
  console.error(`[fatal] ${String(error).slice(0, 300)}`);
  process.exit(1);
});
