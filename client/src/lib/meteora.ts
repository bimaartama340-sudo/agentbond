import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  CpAmm,
  getCurrentPoint,
  getTokenDecimals as fetchTokenDecimals,
  getTokenProgram,
  type ActivationType,
  type CollectFeeMode,
} from "@meteora-ag/cp-amm-sdk";
import DLMM, { StrategyType } from "@meteora-ag/dlmm";
import BN from "bn.js";
import {
  DynamicBondingCurveClient,
  createDbcProgram,
  getAccountData,
  U64_MAX,
} from "@meteora-ag/dynamic-bonding-curve-sdk";

export const SOLANA_DEVNET_RPC =
  import.meta.env.VITE_SOLANA_DEVNET_RPC?.trim() ||
  "https://api.devnet.solana.com";
export const METEORA_DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
/** Wrapped SOL mint; the DAMM v2 pool's quote side. */
export const NATIVE_MINT = "So11111111111111111111111111111111111111112";
export const METEORA_DLMM_POOL =
  import.meta.env.VITE_METEORA_DLMM_POOL?.trim() ||
  "GxtUfNFw9DgCnHNsajKaJY6FmNKFPwGfzvLF5kXSykPV";
export const METEORA_DAMM_V2_POOL =
  import.meta.env.VITE_METEORA_DAMM_V2_POOL?.trim() ||
  "Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw";
export const DEFAULT_SWAP_SLIPPAGE_BPS = 100;
export const MIN_SWAP_SLIPPAGE_BPS = 10;
export const MAX_SWAP_SLIPPAGE_BPS = 1_000;
export const SOLANA_NETWORK =
  import.meta.env.VITE_SOLANA_NETWORK?.trim().toLowerCase() || "devnet";
/** Prevent accidental use of unsupported mainnet configuration. */
export function assertDevnetEnvironment() {
  if (SOLANA_NETWORK !== "devnet") {
    throw new Error(`Unsupported Solana network: ${SOLANA_NETWORK}. AgentBond currently allows Devnet only.`);
  }
}

export type TestnetState = {
  slot: number;
  blockhash: string;
  balanceSol: number | null;
  poolAddress: string | null;
  poolFound: boolean | null;
  poolStatus: string;
};

export type ReadRetryOptions = {
  retries?: number;
  delayMs?: number;
};

function isRetryableReadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /rpc|network|fetch|timeout|429|502|503|504|econnreset|socket|gateway|temporar|rate limit/i.test(
    message
  );
}

export async function withReadRetry<T>(
  operation: () => Promise<T>,
  options: ReadRetryOptions = {}
): Promise<T> {
  const retries = Math.max(0, options.retries ?? 2);
  const delayMs = Math.max(0, options.delayMs ?? 250);
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryableReadError(error)) throw error;
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Read operation failed");
}

export async function readTestnetState(
  walletAddress?: string
): Promise<TestnetState> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const [slot, latestBlockhash] = await withReadRetry(() =>
    Promise.all([
      connection.getSlot("confirmed"),
      connection.getLatestBlockhash("confirmed"),
    ])
  );
  const balanceSol = walletAddress
    ? (await withReadRetry(() =>
        connection.getBalance(new PublicKey(walletAddress), "confirmed")
      )) /
      1_000_000_000
    : null;
  const poolAddress = import.meta.env.VITE_METEORA_DBC_POOL?.trim() || null;

  if (!poolAddress) {
    return {
      slot,
      blockhash: latestBlockhash.blockhash,
      balanceSol,
      poolAddress: null,
      poolFound: null,
      poolStatus:
        "Testnet RPC online; configure VITE_METEORA_DBC_POOL to inspect a pool",
    };
  }

  try {
    const { program } = createDbcProgram(connection, "confirmed");
    const account = await withReadRetry(() =>
      getAccountData(
        new PublicKey(poolAddress),
        "virtualPool",
        program,
        "confirmed"
      )
    );
    return {
      slot,
      blockhash: latestBlockhash.blockhash,
      balanceSol,
      poolAddress,
      poolFound: Boolean(account),
      poolStatus: account
        ? "Meteora DBC virtual pool found on devnet"
        : "Meteora DBC pool account not found on devnet",
    };
  } catch {
    return {
      slot,
      blockhash: latestBlockhash.blockhash,
      balanceSol,
      poolAddress,
      poolFound: false,
      poolStatus: "Pool address is invalid for the devnet read",
    };
  }
}

export type LiquidityStageStatus = "not-configured" | "ready" | "unavailable";
export type LiquidityLifecycle = {
  dammV2: { status: LiquidityStageStatus; poolAddress: string | null; message: string };
  dlmm: { status: LiquidityStageStatus; poolAddress: string | null; message: string };
};

export type LifecyclePlanStatus = "blocked" | "ready" | "pending";
export type LiquidityLifecyclePlan = {
  nextAction: string;
  stages: Array<{
    id: "dbc" | "damm-v2" | "dlmm";
    label: string;
    status: LifecyclePlanStatus;
    action: string;
  }>;
};

export function createLiquidityLifecyclePlan(input: {
  dbcPoolAddress: string | null;
  dbcPoolFound: boolean | null;
  lifecycle: LiquidityLifecycle | null;
}): LiquidityLifecyclePlan {
  const dbcReady = Boolean(input.dbcPoolAddress && input.dbcPoolFound);
  const dammReady = input.lifecycle?.dammV2.status === "ready";
  const dlmmReady = input.lifecycle?.dlmm.status === "ready";
  const stages: LiquidityLifecyclePlan["stages"] = [
    {
      id: "dbc",
      label: "DBC graduation",
      status: dbcReady ? "ready" : input.dbcPoolAddress ? "pending" : "blocked",
      action: dbcReady
        ? "DBC pool verified; graduation can be reviewed."
        : "Configure and verify a completed DBC pool.",
    },
    {
      id: "damm-v2",
      label: "DAMM v2 handoff",
      status: dammReady ? "ready" : dbcReady ? "pending" : "blocked",
      action: dammReady
        ? "DAMM v2 account is readable; migration preview is available."
        : "Verify a graduated DAMM v2 account before building migration instructions.",
    },
    {
      id: "dlmm",
      label: "DLMM liquidity",
      status: dlmmReady ? "ready" : dammReady ? "pending" : "blocked",
      action: dlmmReady
        ? "DLMM account is readable; bin strategy can be reviewed."
        : "Verify a DLMM pool before building liquidity instructions.",
    },
  ];
  const nextAction = !dbcReady
    ? stages[0].action
    : !dammReady
      ? stages[1].action
      : !dlmmReady
        ? stages[2].action
        : "All read-only stages are ready; transaction builders require explicit Devnet configuration.";
  return { nextAction, stages };
}

export async function readLiquidityLifecycle(): Promise<LiquidityLifecycle> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const dammAddress = import.meta.env.VITE_METEORA_DAMM_V2_POOL?.trim() || null;
  const dlmmAddress = import.meta.env.VITE_METEORA_DLMM_POOL?.trim() || null;
  const lifecycle: LiquidityLifecycle = {
    dammV2: {
      status: "not-configured",
      poolAddress: dammAddress,
      message: "Configure a graduated DAMM v2 pool to enable account reads.",
    },
    dlmm: {
      status: "not-configured",
      poolAddress: dlmmAddress,
      message: "Configure a DLMM pool to enable bin and liquidity reads.",
    },
  };

  if (dammAddress) {
    try {
      await withReadRetry(() =>
        new CpAmm(connection).fetchPoolState(new PublicKey(dammAddress))
      );
      lifecycle.dammV2 = {
        status: "ready",
        poolAddress: dammAddress,
        message: "DAMM v2 pool account is readable on Solana devnet.",
      };
    } catch {
      lifecycle.dammV2 = {
        status: "unavailable",
        poolAddress: dammAddress,
        message: "DAMM v2 pool could not be read from the configured RPC.",
      };
    }
  }

  if (dlmmAddress) {
    try {
      await withReadRetry(() =>
        DLMM.create(connection, new PublicKey(dlmmAddress))
      );
      lifecycle.dlmm = {
        status: "ready",
        poolAddress: dlmmAddress,
        message: "DLMM pool account is readable on Solana devnet.",
      };
    } catch {
      lifecycle.dlmm = {
        status: "unavailable",
        poolAddress: dlmmAddress,
        message: "DLMM pool could not be read from the configured RPC.",
      };
    }
  }

  return lifecycle;
}

export async function readDevnetWalletBalance(walletAddress?: string) {
  if (!walletAddress) return null;
  const rpc = import.meta.env.VITE_SOLANA_DEVNET_RPC?.trim() || "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");
  const [lamports, slot] = await withReadRetry(() =>
    Promise.all([
      connection.getBalance(new PublicKey(walletAddress), "confirmed"),
      connection.getSlot("confirmed"),
    ])
  );
  return { balanceSol: lamports / 1_000_000_000, slot };
}

export function createSignInMessage(walletAddress: string, nonce: string) {
  return `AgentBond wallet sign-in\nNetwork: Solana devnet\nWallet: ${walletAddress}\nNonce: ${nonce}`;
}

export function encodeSignInMessage(message: string) {
  return new TextEncoder().encode(message);
}

export function formatSignaturePreview(signature: Uint8Array) {
  const hex = Array.from(signature, byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
  return `${hex.slice(0, 10)}…${hex.slice(-8)}`;
}

export function getSignInNonce() {
  return crypto.randomUUID();
}

export type SolanaProvider = {
  isPhantom?: boolean;
  connect: (options?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString: () => string };
  }>;
  disconnect?: () => Promise<void>;
  signMessage?: (
    message: Uint8Array,
    display?: "utf8"
  ) => Promise<{ signature: Uint8Array }>;
  sendTransaction?: (
    transaction: import("@solana/web3.js").Transaction,
    connection: Connection
  ) => Promise<string>;
  signAndSendTransaction?: (
    transaction: import("@solana/web3.js").Transaction
  ) => Promise<{ signature: string }>;
};

function requirePublicKey(value: string | undefined, label: string) {
  if (!value?.trim()) throw new Error(`${label} is not configured`);
  return new PublicKey(value.trim());
}

// Transaction writes are opt-in; local demos remain read-only by default.
export function assertMeteoraWritesEnabled() {
  if (import.meta.env.VITE_METEORA_ENABLE_TRANSACTIONS !== "true") {
    throw new Error("Meteora transactions are disabled; set VITE_METEORA_ENABLE_TRANSACTIONS=true after Devnet review");
  }
}

export async function executeDbcSwap(params: {
  walletAddress: string;
  poolAddress?: string;
  amountSol: number;
  buyBaseToken: boolean;
  provider: SolanaProvider;
}) {
  assertDevnetEnvironment();
  if (!params.provider.sendTransaction)
    throw new Error("Connected wallet cannot send transactions");
  if (!Number.isFinite(params.amountSol) || params.amountSol <= 0)
    throw new Error("Swap amount must be greater than zero");
  assertMeteoraWritesEnabled();

  const owner = new PublicKey(params.walletAddress);
  const pool = requirePublicKey(
    params.poolAddress || import.meta.env.VITE_METEORA_DBC_POOL,
    "VITE_METEORA_DBC_POOL"
  );
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const transaction = await client.pool.swap({
    owner,
    pool,
    amountIn: new BN(Math.round(params.amountSol * 1_000_000_000)),
    minimumAmountOut: new BN(0),
    swapBaseForQuote: !params.buyBaseToken,
    referralTokenAccount: null,
    payer: owner,
  });
  const signature = await params.provider.sendTransaction(
    transaction,
    connection
  );
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export type DlmmLiquiditySimulation = {
  strategy: "spot" | "curve" | "bid-ask";
  activeBinId: number;
  minBinId: number;
  maxBinId: number;
  totalXAmount: number;
  totalYAmount: number;
  estimatedInstructions: number;
  requiresWalletApproval: true;
  submitted: false;
  summary: string;
};

export function simulateDlmmLiquidityTransaction(params: {
  activeBinId: number;
  binRange?: number;
  totalXAmount: number;
  totalYAmount: number;
  strategy?: DlmmLiquiditySimulation["strategy"];
}): DlmmLiquiditySimulation {
  if (!Number.isInteger(params.activeBinId)) throw new Error("DLMM active bin ID must be an integer");
  const binRange = params.binRange ?? 10;
  if (!Number.isInteger(binRange) || binRange < 1 || binRange > 500) throw new Error("DLMM bin range must be between 1 and 500");
  if (!Number.isFinite(params.totalXAmount) || params.totalXAmount <= 0) throw new Error("DLMM token X amount must be greater than zero");
  if (!Number.isFinite(params.totalYAmount) || params.totalYAmount <= 0) throw new Error("DLMM token Y amount must be greater than zero");
  const strategy = params.strategy ?? "spot";
  const minBinId = params.activeBinId - binRange;
  const maxBinId = params.activeBinId + binRange;
  return {
    strategy,
    activeBinId: params.activeBinId,
    minBinId,
    maxBinId,
    totalXAmount: params.totalXAmount,
    totalYAmount: params.totalYAmount,
    estimatedInstructions: 3,
    requiresWalletApproval: true,
    submitted: false,
    summary: `DLMM ${strategy} strategy preview across bins ${minBinId} to ${maxBinId}; no transaction submitted.`,
  };
}

export async function buildDammV2MigrationPreview(params: {
  walletAddress: string;
  poolAddress?: string;
  dammConfigAddress?: string;
}) {
  const payer = requirePublicKey(params.walletAddress, "walletAddress");
  const pool = requirePublicKey(
    params.poolAddress || import.meta.env.VITE_METEORA_DBC_POOL,
    "VITE_METEORA_DBC_POOL"
  );
  const dammConfig = requirePublicKey(
    params.dammConfigAddress || import.meta.env.VITE_METEORA_DAMM_V2_CONFIG,
    "VITE_METEORA_DAMM_V2_CONFIG"
  );
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const preview = await client.migration.migrateToDammV2({
    payer,
    pool,
    dammConfig,
  });
  return {
    ...preview,
    poolAddress: pool.toBase58(),
    dammConfigAddress: dammConfig.toBase58(),
  };
}

/** On-chain graduation progress (0-100) for a DBC pool. */
export async function fetchDbcCurveProgress(poolAddress: string) {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const [quoteProgress, poolState] = await Promise.all([
    withReadRetry(() => client.state.getPoolQuoteTokenCurveProgress(new PublicKey(poolAddress))),
    withReadRetry(() => client.state.getPool(new PublicKey(poolAddress))),
  ]);
  return {
    quoteProgress,
    isMigrated: Boolean(poolState?.poolState.isMigrated),
  };
}

/** Permissionless graduation: migrates a completed DBC curve to DAMM v2. */
export async function executeDammV2Migration(params: {
  walletAddress: string;
  poolAddress: string;
  dammConfigAddress?: string;
  provider: SolanaProvider;
}): Promise<{ signature: string; dammPool: string | null }> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  const payer = new PublicKey(params.walletAddress);
  const pool = new PublicKey(params.poolAddress);
  const dammConfig = requirePublicKey(
    params.dammConfigAddress || import.meta.env.VITE_METEORA_DAMM_V2_CONFIG,
    "VITE_METEORA_DAMM_V2_CONFIG"
  );

  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const poolState = await withReadRetry(() => client.state.getPool(pool));
  if (!poolState) throw new Error("DBC pool not found on Devnet");
  if (poolState.poolState.isMigrated) throw new Error("Pool already migrated to DAMM v2");

  const { transaction } = await client.migration.migrateToDammV2({
    payer,
    pool,
    dammConfig,
  });
  transaction.feePayer = payer;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  let signature: string;
  if (params.provider.signAndSendTransaction) {
    signature = (await params.provider.signAndSendTransaction(transaction)).signature;
  } else {
    signature = await params.provider.sendTransaction!(transaction, connection);
  }
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

  // Resolve the freshly created DAMM v2 pool address (config + base + quote mint).
  let dammPool: string | null = null;
  try {
    const { deriveDammV2PoolAddress } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const configState = await withReadRetry(() =>
      client.state.getPoolConfig(poolState.poolState.config)
    );
    if (!configState) throw new Error("DBC pool config not found on Devnet");
    const base = poolState.poolState.baseMint;
    const quote = configState.quoteMint;
    const asTokenA = deriveDammV2PoolAddress(dammConfig, base, quote).toBase58();
    const asTokenB = deriveDammV2PoolAddress(dammConfig, quote, base).toBase58();
    const [accountA, accountB] = await Promise.all([
      connection.getAccountInfo(new PublicKey(asTokenA)),
      connection.getAccountInfo(new PublicKey(asTokenB)),
    ]);
    dammPool = accountA ? asTokenA : accountB ? asTokenB : null;
  } catch {
    dammPool = null;
  }
  return { signature, dammPool };
}

export async function createVirtualPool(params: {
  walletAddress: string;
  amountSol: number;
  provider: SolanaProvider;
}) {
  assertDevnetEnvironment();
  if (!params.provider.sendTransaction)
    throw new Error("Connected wallet cannot send transactions");
  if (!Number.isFinite(params.amountSol) || params.amountSol <= 0)
    throw new Error("Initial liquidity amount must be greater than zero");
  assertMeteoraWritesEnabled();

  const owner = new PublicKey(params.walletAddress);
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const transaction = await client.creator.createPoolWithFirstBuy({
    createPoolParam: {
      name: import.meta.env.VITE_METEORA_POOL_NAME?.trim() || "AgentBond",
      symbol: import.meta.env.VITE_METEORA_POOL_SYMBOL?.trim() || "AGNT",
      uri:
        import.meta.env.VITE_METEORA_POOL_URI?.trim() ||
        "https://agentbond.local/metadata.json",
      payer: owner,
      poolCreator: owner,
      config: requirePublicKey(
        import.meta.env.VITE_METEORA_DBC_CONFIG,
        "VITE_METEORA_DBC_CONFIG"
      ),
      baseMint: requirePublicKey(
        import.meta.env.VITE_METEORA_BASE_MINT,
        "VITE_METEORA_BASE_MINT"
      ),
    },
    firstBuyParam: {
      buyer: owner,
      receiver: owner,
      buyAmount: new BN(Math.round(params.amountSol * 1_000_000_000)),
      minimumAmountOut: new BN(0),
      referralTokenAccount: null,
    },
  });
  const signature = await params.provider.sendTransaction(
    transaction,
    connection
  );
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

/** Backward-compatible alias for callers that describe the first-buy step. */
export const initializeDbcLiquidity = createVirtualPool;

// ---------------------------------------------------------------------------
// DAMM v2 swap (live public testnet trading)
// ---------------------------------------------------------------------------

export type DammV2SwapDirection = "sol-to-agnt" | "agnt-to-sol";

export type DammV2SwapQuote = {
  poolAddress: string;
  direction: DammV2SwapDirection;
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  rawInAmount: string;
  rawOutAmount: string;
  rawMinimumOut: string;
  feeAmount: string;
  priceImpactPct: number;
  slippageBps: number;
};

export function validateSwapSlippage(slippageBps: number) {
  if (!Number.isFinite(slippageBps) || slippageBps < MIN_SWAP_SLIPPAGE_BPS || slippageBps > MAX_SWAP_SLIPPAGE_BPS) {
    throw new Error(
      `Slippage must be between ${MIN_SWAP_SLIPPAGE_BPS / 100}% and ${MAX_SWAP_SLIPPAGE_BPS / 100}%`
    );
  }
}

export function validateSwapAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Swap amount must be greater than zero");
  }
}

/** Converts a human-readable token amount into raw units as BN. */
export function toRawAmount(amount: number, decimals: number) {
  validateSwapAmount(amount);
  const [whole, fraction = ""] = amount.toString().split(".");
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
  return new BN(`${whole}${paddedFraction}` || "0", 10);
}

/** Converts raw units into a human-readable number. */
export function fromRawAmount(raw: string | bigint | BN, decimals: number) {
  const divisor = new BN(10).pow(new BN(decimals));
  const value = new BN(raw.toString());
  const whole = value.div(divisor).toString();
  const remainder = value.mod(divisor).toString().padStart(decimals, "0");
  return Number(`${whole}.${remainder}`);
}

export type DammV2PoolMints = {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
};

/** Maps a user-facing direction onto the pool's A/B mints. */
export function resolveSwapMints(poolMints: DammV2PoolMints, direction: DammV2SwapDirection) {
  const baseIsA = poolMints.tokenAMint.toBase58() !== NATIVE_MINT;
  const baseMint = baseIsA ? poolMints.tokenAMint : poolMints.tokenBMint;
  const quoteMint = baseIsA ? poolMints.tokenBMint : poolMints.tokenAMint;
  return direction === "sol-to-agnt"
    ? { inputTokenMint: quoteMint, outputTokenMint: baseMint }
    : { inputTokenMint: baseMint, outputTokenMint: quoteMint };
}

async function fetchDammV2PoolContext(connection: Connection, poolAddress: string) {
  const client = new CpAmm(connection);
  const pool = new PublicKey(poolAddress);
  const poolState = await withReadRetry(() => client.fetchPoolState(pool));
  const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
  const tokenBProgram = getTokenProgram(poolState.tokenBFlag);
  const [tokenADecimals, tokenBDecimals, currentSlot] = await Promise.all([
    fetchTokenDecimals(connection, poolState.tokenAMint, tokenAProgram),
    fetchTokenDecimals(connection, poolState.tokenBMint, tokenBProgram),
    withReadRetry(() => connection.getSlot("confirmed")),
  ]);
  return {
    client,
    pool,
    poolState,
    tokenAProgram,
    tokenBProgram,
    decimals: { a: tokenADecimals, b: tokenBDecimals },
    currentSlot,
    currentTime: Math.floor(Date.now() / 1_000),
  };
}

export async function getDammV2SwapQuote(params: {
  direction: DammV2SwapDirection;
  amount: number;
  slippageBps?: number;
  poolAddress?: string;
}): Promise<DammV2SwapQuote> {
  assertDevnetEnvironment();
  validateSwapAmount(params.amount);
  const slippageBps = params.slippageBps ?? DEFAULT_SWAP_SLIPPAGE_BPS;
  validateSwapSlippage(slippageBps);

  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const context = await fetchDammV2PoolContext(
    connection,
    params.poolAddress?.trim() || METEORA_DAMM_V2_POOL
  );
  const { inputTokenMint, outputTokenMint } = resolveSwapMints(
    { tokenAMint: context.poolState.tokenAMint, tokenBMint: context.poolState.tokenBMint },
    params.direction
  );
  const inputDecimals =
    inputTokenMint.toBase58() === context.poolState.tokenAMint.toBase58()
      ? context.decimals.a
      : context.decimals.b;
  const outputDecimals =
    outputTokenMint.toBase58() === context.poolState.tokenAMint.toBase58()
      ? context.decimals.a
      : context.decimals.b;
  const inAmount = toRawAmount(params.amount, inputDecimals);

  const quote = context.client.getQuote({
    inAmount,
    inputTokenMint,
    slippage: slippageBps,
    poolState: context.poolState,
    currentTime: context.currentTime,
    currentSlot: context.currentSlot,
    tokenADecimal: context.decimals.a,
    tokenBDecimal: context.decimals.b,
    hasReferral: false,
  });

  return {
    poolAddress: context.pool.toBase58(),
    direction: params.direction,
    inputMint: inputTokenMint.toBase58(),
    outputMint: outputTokenMint.toBase58(),
    inputDecimals,
    outputDecimals,
    rawInAmount: inAmount.toString(),
    rawOutAmount: quote.swapOutAmount.toString(),
    rawMinimumOut: quote.minSwapOutAmount.toString(),
    feeAmount: quote.totalFee.toString(),
    priceImpactPct: Number(quote.priceImpact.toString()) * 100,
    slippageBps,
  };
}

export type DammV2SwapResult = {
  signature: string;
  explorerUrl: string;
  rawOutAmount: string;
  rawMinimumOut: string;
  outputDecimals: number;
};

// ---------------------------------------------------------------------------
// DLMM swap (bin-based venue, AGNT canonical pool)
// ---------------------------------------------------------------------------

export type DlmmSwapQuote = {
  poolAddress: string;
  direction: DammV2SwapDirection;
  rawOutAmount: string;
  rawMinimumOut: string;
  outputDecimals: number;
  priceImpactPct: number;
  slippageBps: number;
};

function dlmmMintOrdering(direction: DammV2SwapDirection, tokenXMint: PublicKey, tokenYMint: PublicKey) {
  const baseIsX = tokenXMint.toBase58() !== NATIVE_MINT;
  const baseMint = baseIsX ? tokenXMint : tokenYMint;
  const quoteMint = baseIsX ? tokenYMint : tokenXMint;
  return direction === "sol-to-agnt"
    ? { inToken: quoteMint, outToken: baseMint, swapForY: !baseIsX }
    : { inToken: baseMint, outToken: quoteMint, swapForY: baseIsX };
}

export async function getDlmmSwapQuote(params: {
  direction: DammV2SwapDirection;
  amount: number;
  slippageBps?: number;
  poolAddress?: string;
}): Promise<DlmmSwapQuote> {
  assertDevnetEnvironment();
  validateSwapAmount(params.amount);
  const slippageBps = params.slippageBps ?? DEFAULT_SWAP_SLIPPAGE_BPS;
  validateSwapSlippage(slippageBps);

  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const pool = new PublicKey(params.poolAddress?.trim() || METEORA_DLMM_POOL);
  const dlmm = await withReadRetry(() => DLMM.create(connection, pool));
  const binArrays = await withReadRetry(() => dlmm.getBinArrays());
  const pairState = dlmm.lbPair;
  const { inToken, swapForY } = dlmmMintOrdering(params.direction, pairState.tokenXMint, pairState.tokenYMint);

  const inDecimals = await fetchTokenDecimals(connection, inToken, TOKEN_PROGRAM_ID);
  const { outToken } = dlmmMintOrdering(params.direction, pairState.tokenXMint, pairState.tokenYMint);
  const outDecimals = await fetchTokenDecimals(connection, outToken, TOKEN_PROGRAM_ID);
  const quote = dlmm.swapQuote(
    toRawAmount(params.amount, inDecimals),
    swapForY,
    new BN(slippageBps),
    binArrays
  );

  return {
    poolAddress: pool.toBase58(),
    direction: params.direction,
    rawOutAmount: quote.outAmount.toString(),
    rawMinimumOut: quote.minOutAmount.toString(),
    outputDecimals: outDecimals,
    priceImpactPct: Number(quote.priceImpact) * 100,
    slippageBps,
  };
}

export type DlmmSwapResult = {
  signature: string;
  explorerUrl: string;
  rawOutAmount: string;
  outputDecimals: number;
};

export async function executeDlmmSwap(params: {
  walletAddress: string;
  direction: DammV2SwapDirection;
  amount: number;
  slippageBps?: number;
  provider: SolanaProvider;
  poolAddress?: string;
}): Promise<DlmmSwapResult> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  validateSwapAmount(params.amount);
  const slippageBps = params.slippageBps ?? DEFAULT_SWAP_SLIPPAGE_BPS;
  validateSwapSlippage(slippageBps);

  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const pool = new PublicKey(params.poolAddress?.trim() || METEORA_DLMM_POOL);
  const dlmm = await withReadRetry(() => DLMM.create(connection, pool));
  const binArrays = await withReadRetry(() => dlmm.getBinArrays());
  const pairState = dlmm.lbPair;
  const { inToken, outToken, swapForY } = dlmmMintOrdering(
    params.direction,
    pairState.tokenXMint,
    pairState.tokenYMint
  );

  const inDecimals = await fetchTokenDecimals(connection, inToken, TOKEN_PROGRAM_ID);
  const outDecimals = await fetchTokenDecimals(connection, outToken, TOKEN_PROGRAM_ID);
  const quote = dlmm.swapQuote(
    toRawAmount(params.amount, inDecimals),
    swapForY,
    new BN(slippageBps),
    binArrays
  );
  if (quote.minOutAmount.lte(new BN(0))) {
    throw new Error("Quote produced a zero minimum out; refusing to swap");
  }

  const transaction = await dlmm.swap({
    inToken,
    outToken,
    inAmount: toRawAmount(params.amount, inDecimals),
    minOutAmount: quote.minOutAmount,
    lbPair: pool,
    user: new PublicKey(params.walletAddress),
    binArraysPubkey: quote.binArraysPubkey,
  });
  const user = new PublicKey(params.walletAddress);
  transaction.feePayer = user;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  let signature: string;
  if (params.provider.signAndSendTransaction) {
    signature = (await params.provider.signAndSendTransaction(transaction)).signature;
  } else {
    signature = await params.provider.sendTransaction!(transaction, connection);
  }
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return {
    signature,
    explorerUrl: getTestnetExplorerUrl(signature),
    rawOutAmount: quote.outAmount.toString(),
    outputDecimals: outDecimals,
  };
}

// ---------------------------------------------------------------------------
// DLMM liquidity (SOL-side bid ladder + remove)
// ---------------------------------------------------------------------------

/** Signs every transaction with the wallet, partial-signing extra keypairs
 * only on transactions that actually require them (multi-tx SDK bundles). */
async function signAndSendBundle(params: {
  connection: Connection;
  walletAddress: string;
  provider: SolanaProvider;
  transactions: Transaction[];
  extraSigners?: Keypair[];
}): Promise<string> {
  const wallet = new PublicKey(params.walletAddress);
  let lastSignature = "";
  for (const transaction of params.transactions) {
    transaction.feePayer = wallet;
    const { blockhash, lastValidBlockHeight } = await params.connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    const required = new Set(
      transaction.instructions.flatMap(ix => ix.keys.filter(k => k.isSigner).map(k => k.pubkey.toBase58()))
    );
    for (const keypair of params.extraSigners ?? []) {
      if (required.has(keypair.publicKey.toBase58())) transaction.partialSign(keypair);
    }
    if (params.provider.signAndSendTransaction) {
      lastSignature = (await params.provider.signAndSendTransaction(transaction)).signature;
    } else {
      lastSignature = await params.provider.sendTransaction!(transaction, params.connection);
    }
    await params.connection.confirmTransaction({ signature: lastSignature, blockhash, lastValidBlockHeight }, "confirmed");
  }
  return lastSignature;
}

export type DlmmPositionSummary = {
  position: string;
  lowerBinId: number;
  upperBinId: number;
  xRaw: string;
  yRaw: string;
};

export async function fetchDlmmPositions(params: {
  walletAddress: string;
  poolAddress: string;
}): Promise<DlmmPositionSummary[]> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const dlmm = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const result = await withReadRetry(() =>
    dlmm.getPositionsByUserAndLbPair(new PublicKey(params.walletAddress))
  );
  return (result.userPositions ?? []).map(entry => {
    const bins = entry.positionData.positionBinData ?? [];
    let x = new BN(0);
    let y = new BN(0);
    for (const bin of bins) {
      x = x.add(new BN(bin.positionXAmount?.toString?.() ?? "0"));
      y = y.add(new BN(bin.positionYAmount?.toString?.() ?? "0"));
    }
    return {
      position: entry.publicKey.toBase58(),
      lowerBinId: bins[0]?.binId ?? 0,
      upperBinId: bins[bins.length - 1]?.binId ?? 0,
      xRaw: x.toString(),
      yRaw: y.toString(),
    };
  });
}

/** Deposits SOL as a one-sided bid ladder just below the active price. */
export async function addDlmmLiquidity(params: {
  walletAddress: string;
  poolAddress: string;
  amountSol: number;
  binWidth?: number;
  provider: SolanaProvider;
}): Promise<{ signature: string; explorerUrl: string; position: string }> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  validateSwapAmount(params.amountSol);
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const dlmm = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const activeId = dlmm.lbPair.activeId;
  const width = Math.max(2, Math.min(params.binWidth ?? 10, 40));
  const minBinId = activeId - width;
  const maxBinId = activeId - 1;
  if (maxBinId <= minBinId) {
    throw new Error("No valid bin range below the active price for a SOL-side deposit");
  }
  const positionKeypair = Keypair.generate();
  const transaction = await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: positionKeypair.publicKey,
    totalXAmount: new BN(0),
    totalYAmount: toRawAmount(params.amountSol, 9),
    strategy: { minBinId, maxBinId, strategyType: StrategyType.Spot, singleSidedX: false },
    user: new PublicKey(params.walletAddress),
    slippage: 100,
  });
  const signature = await signAndSendBundle({
    connection,
    walletAddress: params.walletAddress,
    provider: params.provider,
    transactions: [transaction],
    extraSigners: [positionKeypair],
  });
  return {
    signature,
    explorerUrl: getTestnetExplorerUrl(signature),
    position: positionKeypair.publicKey.toBase58(),
  };
}

/** Removes a percentage of a DLMM position across its bin range. */
export async function removeDlmmLiquidity(params: {
  walletAddress: string;
  poolAddress: string;
  positionAddress: string;
  lowerBinId: number;
  upperBinId: number;
  percent: number;
  provider: SolanaProvider;
}): Promise<{ signature: string; explorerUrl: string }> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  if (!Number.isFinite(params.percent) || params.percent <= 0 || params.percent > 100) {
    throw new Error("Percent must be between 0 and 100");
  }
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const dlmm = await DLMM.create(connection, new PublicKey(params.poolAddress));
  const bps = new BN(Math.min(Math.round(params.percent * 100), 10_000));
  const transactions = await dlmm.removeLiquidity({
    user: new PublicKey(params.walletAddress),
    position: new PublicKey(params.positionAddress),
    fromBinId: params.lowerBinId,
    toBinId: params.upperBinId,
    bps,
    shouldClaimAndClose: params.percent >= 100,
  });
  const signature = await signAndSendBundle({
    connection,
    walletAddress: params.walletAddress,
    provider: params.provider,
    transactions: Array.isArray(transactions) ? transactions : [transactions],
  });
  return { signature, explorerUrl: getTestnetExplorerUrl(signature) };
}

// ---------------------------------------------------------------------------
// DAMM v2 liquidity (LP management)
// ---------------------------------------------------------------------------

export type DammV2PositionSummary = {
  position: string;
  positionNftAccount: string;
  nftMint: string;
  pool: string;
  unlockedLiquidity: string;
};

export async function fetchDammV2Positions(params: {
  walletAddress: string;
  baseMint?: string;
}): Promise<DammV2PositionSummary[]> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = new CpAmm(connection);
  const baseMint = params.baseMint?.trim();
  const positions = baseMint
    ? await withReadRetry(() =>
        client.getPositionsByUserAndTokenMint(
          new PublicKey(params.walletAddress),
          new PublicKey(baseMint)
        )
      )
    : await withReadRetry(() => client.getPositionsByUser(new PublicKey(params.walletAddress)));
  return positions.map(entry => ({
    position: entry.position.toBase58(),
    positionNftAccount: entry.positionNftAccount.toBase58(),
    nftMint: entry.positionState.nftMint.toBase58(),
    pool: ("pool" in entry ? (entry.pool as PublicKey) : entry.positionState.pool).toBase58(),
    unlockedLiquidity: entry.positionState.unlockedLiquidity.toString(),
  }));
}

export type DammV2DepositPreview = {
  quoteAmountRaw: string;
  baseAmountRaw: string;
  baseDecimals: number;
};

export async function previewDammV2Deposit(params: {
  poolAddress: string;
  quoteAmountSol: number;
}): Promise<DammV2DepositPreview> {
  validateSwapAmount(params.quoteAmountSol);
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = new CpAmm(connection);
  const poolState = await withReadRetry(() => client.fetchPoolState(new PublicKey(params.poolAddress)));
  const baseIsA = poolState.tokenAMint.toBase58() !== NATIVE_MINT;
  const depositQuoteParams = {
    inAmount: toRawAmount(params.quoteAmountSol, 9),
    isTokenA: !baseIsA,
    sqrtPrice: poolState.sqrtPrice,
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
    collectFeeMode: poolState.collectFeeMode as CollectFeeMode,
    tokenAAmount: poolState.tokenAAmount,
    tokenBAmount: poolState.tokenBAmount,
    liquidity: poolState.liquidity,
  };
  const quote = client.getDepositQuote(depositQuoteParams);
  const baseDecimals = await fetchTokenDecimals(
    connection,
    baseIsA ? poolState.tokenAMint : poolState.tokenBMint,
    baseIsA ? getTokenProgram(poolState.tokenAFlag) : getTokenProgram(poolState.tokenBFlag)
  );
  return {
    quoteAmountRaw: quote.actualInputAmount.toString(),
    baseAmountRaw: quote.outputAmount.toString(),
    baseDecimals,
  };
}

export type DammV2LiquidityResult = {
  signature: string;
  explorerUrl: string;
  positionNft?: string;
};

/** Deposits SOL-side liquidity, creating a fresh position owned by the user. */
export async function addDammV2Liquidity(params: {
  walletAddress: string;
  poolAddress: string;
  quoteAmountSol: number;
  provider: SolanaProvider;
}): Promise<DammV2LiquidityResult> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  validateSwapAmount(params.quoteAmountSol);
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = new CpAmm(connection);
  const pool = new PublicKey(params.poolAddress);
  const poolState = await withReadRetry(() => client.fetchPoolState(pool));
  const baseIsA = poolState.tokenAMint.toBase58() !== NATIVE_MINT;
  const deposit = await previewDammV2Deposit({
    poolAddress: params.poolAddress,
    quoteAmountSol: params.quoteAmountSol,
  });
  if (new BN(deposit.baseAmountRaw).lte(new BN(0))) {
    throw new Error("Deposit quote produced a zero base amount; refusing to add liquidity");
  }

  const depositQuote = client.getDepositQuote({
    inAmount: toRawAmount(params.quoteAmountSol, 9),
    isTokenA: !baseIsA,
    sqrtPrice: poolState.sqrtPrice,
    minSqrtPrice: poolState.sqrtMinPrice,
    maxSqrtPrice: poolState.sqrtMaxPrice,
    collectFeeMode: poolState.collectFeeMode as CollectFeeMode,
    tokenAAmount: poolState.tokenAAmount,
    tokenBAmount: poolState.tokenBAmount,
    liquidity: poolState.liquidity,
  });
  const owner = new PublicKey(params.walletAddress);
  const positionNft = Keypair.generate();
  const transaction = await client.createPositionAndAddLiquidity({
    owner,
    pool,
    positionNft: positionNft.publicKey,
    liquidityDelta: depositQuote.liquidityDelta,
    maxAmountTokenA: baseIsA ? new BN(deposit.baseAmountRaw) : depositQuote.actualInputAmount,
    maxAmountTokenB: baseIsA ? depositQuote.actualInputAmount : new BN(deposit.baseAmountRaw),
    tokenAAmountThreshold: baseIsA ? new BN(deposit.baseAmountRaw) : depositQuote.actualInputAmount,
    tokenBAmountThreshold: baseIsA ? depositQuote.actualInputAmount : new BN(deposit.baseAmountRaw),
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAProgram: getTokenProgram(poolState.tokenAFlag),
    tokenBProgram: getTokenProgram(poolState.tokenBFlag),
  });
  transaction.feePayer = owner;
  transaction.partialSign(positionNft);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  let signature: string;
  if (params.provider.signAndSendTransaction) {
    signature = (await params.provider.signAndSendTransaction(transaction)).signature;
  } else {
    signature = await params.provider.sendTransaction!(transaction, connection);
  }
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return {
    signature,
    explorerUrl: getTestnetExplorerUrl(signature),
    positionNft: positionNft.publicKey.toBase58(),
  };
}

/** Removes a percentage of a position's unlocked liquidity. */
export async function removeDammV2Liquidity(params: {
  walletAddress: string;
  poolAddress: string;
  positionAddress: string;
  positionNftAccount: string;
  unlockedLiquidity: string;
  percent: number;
  provider: SolanaProvider;
}): Promise<DammV2LiquidityResult> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  if (!Number.isFinite(params.percent) || params.percent <= 0 || params.percent > 100) {
    throw new Error("Percent must be between 0 and 100");
  }
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = new CpAmm(connection);
  const pool = new PublicKey(params.poolAddress);
  const poolState = await withReadRetry(() => client.fetchPoolState(pool));
  const unlocked = new BN(params.unlockedLiquidity);
  if (unlocked.lte(new BN(0))) throw new Error("Position has no unlocked liquidity");
  const percentBps = new BN(Math.min(Math.round(params.percent * 100), 10_000));
  const liquidityDelta = unlocked.mul(percentBps).div(new BN(10_000));
  if (liquidityDelta.lte(new BN(0))) throw new Error("Removal amount rounds to zero liquidity");

  const owner = new PublicKey(params.walletAddress);
  const transaction = await client.removeLiquidity({
    owner,
    position: new PublicKey(params.positionAddress),
    pool,
    positionNftAccount: new PublicKey(params.positionNftAccount),
    liquidityDelta,
    tokenAAmountThreshold: new BN(0),
    tokenBAmountThreshold: new BN(0),
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: getTokenProgram(poolState.tokenAFlag),
    tokenBProgram: getTokenProgram(poolState.tokenBFlag),
    vestings: [],
    currentPoint: await getCurrentPoint(connection, poolState.activationType as ActivationType),
  });
  transaction.feePayer = owner;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  let signature: string;
  if (params.provider.signAndSendTransaction) {
    signature = (await params.provider.signAndSendTransaction(transaction)).signature;
  } else {
    signature = await params.provider.sendTransaction!(transaction, connection);
  }
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { signature, explorerUrl: getTestnetExplorerUrl(signature) };
}

// ---------------------------------------------------------------------------
// Creator fee claims (DBC pool-level fees + DAMM v2 position fees)
// ---------------------------------------------------------------------------

export type DbcCreatorFeeSummary = {
  unclaimedBaseRaw: string;
  unclaimedQuoteRaw: string;
  totalBaseRaw: string;
  totalQuoteRaw: string;
};

/** Unclaimed creator trading fees still held by a DBC virtual pool. */
export async function fetchDbcCreatorFees(poolAddress: string): Promise<DbcCreatorFeeSummary> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const breakdown = await withReadRetry(() =>
    client.state.getPoolFeeBreakdown(new PublicKey(poolAddress))
  );
  return {
    unclaimedBaseRaw: breakdown.creator.unclaimedBaseFee.toString(),
    unclaimedQuoteRaw: breakdown.creator.unclaimedQuoteFee.toString(),
    totalBaseRaw: breakdown.creator.totalBaseFee.toString(),
    totalQuoteRaw: breakdown.creator.totalQuoteFee.toString(),
  };
}

/** Pool-level creator fee claim on a DBC virtual pool (creator must sign). */
export async function executeDbcCreatorFeeClaim(params: {
  walletAddress: string;
  poolAddress: string;
  provider: SolanaProvider;
}): Promise<{ signature: string; explorerUrl: string }> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const creator = new PublicKey(params.walletAddress);
  const transaction = await client.creator.claimCreatorTradingFee({
    creator,
    payer: creator,
    pool: new PublicKey(params.poolAddress),
    maxBaseAmount: U64_MAX,
    maxQuoteAmount: U64_MAX,
  });
  transaction.feePayer = creator;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  let signature: string;
  if (params.provider.signAndSendTransaction) {
    signature = (await params.provider.signAndSendTransaction(transaction)).signature;
  } else {
    signature = await params.provider.sendTransaction!(transaction, connection);
  }
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { signature, explorerUrl: getTestnetExplorerUrl(signature) };
}

/** Claims the trading fees accumulated by a DAMM v2 position (owner must sign). */
export async function executeDammV2PositionFeeClaim(params: {
  walletAddress: string;
  poolAddress: string;
  positionAddress: string;
  positionNftAccount: string;
  provider: SolanaProvider;
}): Promise<DammV2LiquidityResult> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = new CpAmm(connection);
  const pool = new PublicKey(params.poolAddress);
  const poolState = await withReadRetry(() => client.fetchPoolState(pool));
  const owner = new PublicKey(params.walletAddress);
  const transaction = await client.claimPositionFee({
    owner,
    position: new PublicKey(params.positionAddress),
    pool,
    positionNftAccount: new PublicKey(params.positionNftAccount),
    tokenAMint: poolState.tokenAMint,
    tokenBMint: poolState.tokenBMint,
    tokenAVault: poolState.tokenAVault,
    tokenBVault: poolState.tokenBVault,
    tokenAProgram: getTokenProgram(poolState.tokenAFlag),
    tokenBProgram: getTokenProgram(poolState.tokenBFlag),
  });
  transaction.feePayer = owner;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  let signature: string;
  if (params.provider.signAndSendTransaction) {
    signature = (await params.provider.signAndSendTransaction(transaction)).signature;
  } else {
    signature = await params.provider.sendTransaction!(transaction, connection);
  }
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { signature, explorerUrl: getTestnetExplorerUrl(signature) };
}

export async function executeDammV2Swap(params: {
  walletAddress: string;
  direction: DammV2SwapDirection;
  amount: number;
  slippageBps?: number;
  provider: SolanaProvider;
  poolAddress?: string;
}): Promise<DammV2SwapResult> {
  assertDevnetEnvironment();
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }
  validateSwapAmount(params.amount);
  const slippageBps = params.slippageBps ?? DEFAULT_SWAP_SLIPPAGE_BPS;
  validateSwapSlippage(slippageBps);
  assertMeteoraWritesEnabled();

  const quote = await getDammV2SwapQuote({
    direction: params.direction,
    amount: params.amount,
    slippageBps,
    poolAddress: params.poolAddress,
  });
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const context = await fetchDammV2PoolContext(connection, quote.poolAddress);
  const owner = new PublicKey(params.walletAddress);
  const transaction = await context.client.swap({
    payer: owner,
    pool: context.pool,
    inputTokenMint: new PublicKey(quote.inputMint),
    outputTokenMint: new PublicKey(quote.outputMint),
    amountIn: new BN(quote.rawInAmount, 10),
    minimumAmountOut: new BN(quote.rawMinimumOut, 10),
    tokenAMint: context.poolState.tokenAMint,
    tokenBMint: context.poolState.tokenBMint,
    tokenAVault: context.poolState.tokenAVault,
    tokenBVault: context.poolState.tokenBVault,
    tokenAProgram: context.tokenAProgram,
    tokenBProgram: context.tokenBProgram,
    referralTokenAccount: null,
    poolState: context.poolState,
  });

  // Phantom requires a populated recent blockhash before signing.
  transaction.feePayer = owner;
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;

  let signature: string;
  if (params.provider.signAndSendTransaction) {
    signature = (await params.provider.signAndSendTransaction(transaction)).signature;
  } else if (params.provider.sendTransaction) {
    signature = await params.provider.sendTransaction!(transaction, connection);
  } else {
    throw new Error("Connected wallet cannot send transactions");
  }
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return {
    signature,
    explorerUrl: getTestnetExplorerUrl(signature),
    rawOutAmount: quote.rawOutAmount,
    rawMinimumOut: quote.rawMinimumOut,
    outputDecimals: quote.outputDecimals,
  };
}

export function getTestnetExplorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

// ---------------------------------------------------------------------------
// Agent service (pay-per-task with on-chain memos)
// ---------------------------------------------------------------------------

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const AGENT_MIN_PAYMENT_SOL = 0.0005;
export const AGENT_MEMO_MAX_CHARS = 500;

export function splitMemo(text: string, maxChars = AGENT_MEMO_MAX_CHARS): string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const chunks: string[] = [];
  for (let index = 0; index < clean.length; index += maxChars) {
    chunks.push(clean.slice(index, index + maxChars));
  }
  return chunks;
}

/** Payment tx: SOL to the agent's service wallet + the prompt as a memo. */
export async function buildAgentTaskPaymentTx(params: {
  payer: string;
  agentWallet: string;
  amountSol: number;
  prompt: string;
}) {
  assertDevnetEnvironment();
  if (!Number.isFinite(params.amountSol) || params.amountSol < AGENT_MIN_PAYMENT_SOL) {
    throw new Error(`Payment must be at least ${AGENT_MIN_PAYMENT_SOL} SOL`);
  }
  const prompt = params.prompt.trim();
  if (prompt.length === 0) throw new Error("Task prompt is empty");
  if (prompt.length > AGENT_MEMO_MAX_CHARS) {
    throw new Error(`Task prompt must be at most ${AGENT_MEMO_MAX_CHARS} characters`);
  }
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const payer = new PublicKey(params.payer);
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer,
      toPubkey: new PublicKey(params.agentWallet),
      lamports: Math.round(params.amountSol * 1_000_000_000),
    }),
    new TransactionInstruction({
      programId: MEMO_PROGRAM_ID,
      keys: [{ pubkey: payer, isSigner: true, isWritable: false }],
      data: Buffer.from(prompt, "utf8"),
    })
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = payer;
  transaction.recentBlockhash = blockhash;
  return { transaction, connection, blockhash, lastValidBlockHeight };
}

export type AgentActivityItem = {
  signature: string;
  explorerUrl: string;
  kind: "task" | "reply" | "buyback" | "other";
  memo?: string;
  counterparty?: string;
  amountSol?: number;
  slot: number;
};

/**
 * Recent on-chain activity around an agent wallet: tasks (SOL + memo in),
 * agent replies (memo out), and buybacks (agent trades on its own market).
 */
export async function fetchAgentActivity(params: {
  agentWallet: string;
  dammV2Pool?: string;
  limit?: number;
}): Promise<AgentActivityItem[]> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const agent = new PublicKey(params.agentWallet);
  const signatures = await withReadRetry(() =>
    connection.getSignaturesForAddress(agent, { limit: params.limit ?? 25 }, "confirmed")
  );
  const items: AgentActivityItem[] = [];
  await Promise.all(
    signatures.slice(0, 20).map(async entry => {
      try {
        const tx = await withReadRetry(() =>
          connection.getParsedTransaction(entry.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          })
        );
        if (!tx) return;
        const message = tx.transaction.message;
        const accountKeys = message.accountKeys.map(k => k.pubkey.toBase58());
        const feePayer = accountKeys[0];
        const isAgentSigned = feePayer === params.agentWallet;
        const memoText = collectParsedMemos(message.instructions);
        // Incoming SOL to the agent?
        const agentIndex = accountKeys.indexOf(params.agentWallet);
        let incoming = 0;
        if (agentIndex >= 0 && tx.meta) {
          incoming = tx.meta.postBalances[agentIndex] - tx.meta.preBalances[agentIndex];
        }
        let kind: AgentActivityItem["kind"] = "other";
        if (!isAgentSigned && incoming > 0 && memoText) {
          kind = "task";
        } else if (isAgentSigned && memoText) {
          kind = "reply";
        } else if (
          isAgentSigned &&
          params.dammV2Pool &&
          accountKeys.includes(params.dammV2Pool)
        ) {
          kind = "buyback";
        }
        items.push({
          signature: entry.signature,
          explorerUrl: getTestnetExplorerUrl(entry.signature),
          kind,
          memo: memoText || undefined,
          counterparty: kind === "task" ? feePayer : undefined,
          amountSol: incoming > 0 ? incoming / 1_000_000_000 : undefined,
          slot: entry.slot,
        });
      } catch {
        // Skip unreadable entries; the feed is best-effort.
      }
    })
  );
  return items.sort((a, b) => b.slot - a.slot);
}

function collectParsedMemos(instructions: unknown): string | undefined {
  const parts: string[] = [];
  for (const ix of instructions as Array<{
    programId?: { toBase58?: () => string };
    parsed?: string | { type?: string; info?: { memo?: string } };
    data?: unknown;
  }>) {
    const program = ix.programId?.toBase58?.() ?? "";
    if (program === MEMO_PROGRAM_ID.toBase58()) {
      if (typeof ix.data === "string") {
        parts.push(Buffer.from(ix.data, "base64").toString("utf8"));
      } else if (typeof ix.parsed === "string") {
        parts.push(ix.parsed);
      } else if (typeof ix.parsed === "object" && ix.parsed?.info?.memo) {
        parts.push(ix.parsed.info.memo);
      }
    } else if (
      typeof ix.parsed === "object" &&
      ix.parsed?.type === "memo" &&
      ix.parsed?.info?.memo
    ) {
      parts.push(ix.parsed.info.memo);
    }
  }
  const joined = parts.join(" ").trim();
  return joined.length > 0 ? joined : undefined;
}

export function getTestnetAddressUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function getMeteoraProgramUrl() {
  return `https://explorer.solana.com/address/${METEORA_DBC_PROGRAM}?cluster=devnet`;
}
