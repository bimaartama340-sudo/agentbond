import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";
import BN from "bn.js";
import * as Meteora from "@meteora-ag/dlmm";
import {
  ActivationType,
  StrategyType,
  deriveCustomizablePermissionlessLbPair,
} from "@meteora-ag/dlmm";

const DLMM = Meteora.default;

/**
 * Mainnet deployment orchestrator derived from DEVNET_DEPLOYMENT_RECORD.md.
 *
 * Safety properties:
 * - dry-run is the default; no transaction is broadcast unless --execute is passed;
 * - mainnet RPC and a new mainnet base mint are mandatory;
 * - the Devnet base mint/pool addresses are never reused;
 * - private keys are read only from a local keypair path and are never printed;
 * - swap tests and position closure are opt-in flags.
 */

const DEVNET_BASE_MINT = "7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9";
const LB_CLMM_PROGRAM = new PublicKey("LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo");
const NATIVE_SOL = new PublicKey("So11111111111111111111111111111111111111112");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const BIN_STEP = 25;
const FEE_BPS = 1;
const DEFAULT_BASE_AMOUNT_RAW = 1_000_000;
const DEFAULT_QUOTE_AMOUNT_LAMPORTS = 1_333_000_000;
const DEFAULT_SWAP_BASE_AMOUNT_RAW = 1_000;
const DEFAULT_SWAP_QUOTE_AMOUNT_LAMPORTS = 1_000_000;

function flag(name: string) {
  return process.argv.includes(name);
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function publicKeyEnv(name: string) {
  try {
    return new PublicKey(requiredEnv(name));
  } catch {
    throw new Error(`${name} is not a valid Solana public key.`);
  }
}

function numericEnv(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

function loadKeypair(pathValue: string) {
  const path = resolve(pathValue);
  if (!existsSync(path)) throw new Error(`Keypair file not found: ${path}`);
  const secret = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(secret) || secret.length !== 64) {
    throw new Error("MAINNET_PAYER_KEYPAIR must be a Solana 64-byte JSON keypair.");
  }
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

function sol(lamports: number | bigint) {
  return Number(lamports) / 1e9;
}

function associatedTokenAddress(mint: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM,
  )[0];
}

async function simulateOrSend(
  connection: Connection,
  transaction: Transaction,
  signer: Keypair,
  execute: boolean,
  label: string,
) {
  const latest = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = signer.publicKey;
  transaction.recentBlockhash = latest.blockhash;
  transaction.lastValidBlockHeight = latest.lastValidBlockHeight;
  transaction.partialSign(signer);

  const raw = transaction.serialize().toString("base64");
  const simulation = await (connection as Connection & {
    _rpcRequest(method: string, params: unknown[]): Promise<{ error?: unknown; result?: { value?: { err?: unknown } } }>;
  })._rpcRequest("simulateTransaction", [
    raw,
    { encoding: "base64", sigVerify: true, replaceRecentBlockhash: false },
  ]);
  const simulationError = simulation.error ?? simulation.result?.value?.err;
  if (simulationError) {
    throw new Error(`${label} simulation failed: ${JSON.stringify(simulationError)}`);
  }
  console.log(`[simulation-ok] ${label}`);

  if (!execute) return null;
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "finalized",
  );
  if (confirmation.value.err) {
    throw new Error(`${label} confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
  }
  console.log(`[finalized] ${label}: ${signature}`);
  return signature;
}

async function main() {
  const execute = flag("--execute");
  const testSwaps = flag("--test-swaps");
  const closeBasePosition = flag("--close-base-position");
  if (closeBasePosition && !execute) {
    throw new Error("--close-base-position requires --execute.");
  }

  const rpc = requiredEnv("MAINNET_RPC");
  if (/devnet|testnet|localhost|127\.0\.0\.1/i.test(rpc)) {
    throw new Error("MAINNET_RPC must point to Solana mainnet-beta, not Devnet/testnet/local RPC.");
  }
  const baseMint = publicKeyEnv("MAINNET_BASE_MINT");
  if (baseMint.equals(new PublicKey(DEVNET_BASE_MINT))) {
    throw new Error("MAINNET_BASE_MINT must be a newly created mainnet mint, not the Devnet mint from the record.");
  }
  const payer = loadKeypair(requiredEnv("MAINNET_PAYER_KEYPAIR"));
  const activeId = numericEnv("MAINNET_ACTIVE_ID", -1);
  const activationTimestamp = numericEnv("MAINNET_ACTIVATION_TIMESTAMP", -1);
  const baseAmount = numericEnv("MAINNET_BASE_AMOUNT_RAW", DEFAULT_BASE_AMOUNT_RAW);
  const quoteAmount = numericEnv("MAINNET_QUOTE_AMOUNT_LAMPORTS", DEFAULT_QUOTE_AMOUNT_LAMPORTS);
  const swapBaseAmount = numericEnv("MAINNET_SWAP_BASE_AMOUNT_RAW", DEFAULT_SWAP_BASE_AMOUNT_RAW);
  const swapQuoteAmount = numericEnv("MAINNET_SWAP_QUOTE_AMOUNT_LAMPORTS", DEFAULT_SWAP_QUOTE_AMOUNT_LAMPORTS);

  const connection = new Connection(rpc, "confirmed");
  const version = await connection.getVersion();
  const slot = await connection.getSlot("confirmed");
  const payerBalance = await connection.getBalance(payer.publicKey, "confirmed");
  const baseAta = associatedTokenAddress(baseMint, payer.publicKey);
  const baseBalance = await connection.getTokenAccountBalance(baseAta).catch(() => null);

  if (activeId < 0) throw new Error("MAINNET_ACTIVE_ID is required; do not infer mainnet bin IDs from the Devnet record.");
  if (activationTimestamp < 0) throw new Error("MAINNET_ACTIVATION_TIMESTAMP is required for an explicit mainnet activation time.");

  const [poolAddress] = deriveCustomizablePermissionlessLbPair(
    baseMint,
    NATIVE_SOL,
    LB_CLMM_PROGRAM,
  );

  console.log("=== AgentBond Meteora mainnet DLMM migration ===");
  console.log(`mode=${execute ? "execute" : "dry-run"}`);
  console.log(`rpc=${rpc.replace(/https?:\/\//, "").split("/")[0]}`);
  console.log(`solana_core=${version['solana-core']}`);
  console.log(`confirmed_slot=${slot}`);
  console.log(`payer=${payer.publicKey.toBase58()}`);
  console.log(`payer_sol=${sol(payerBalance)}`);
  console.log(`mainnet_base_mint=${baseMint.toBase58()}`);
  console.log(`derived_dlmm_pool=${poolAddress.toBase58()}`);
  console.log(`parameters=binStep:${BIN_STEP},feeBps:${FEE_BPS},activeId:${activeId},activationTimestamp:${activationTimestamp}`);
  console.log(`seed=base:${baseAmount},quoteLamports:${quoteAmount}`);
  if (baseBalance) console.log(`payer_base=${baseBalance.value.uiAmountString}`);
  else console.log("payer_base=<ATA missing or zero; preflight will fail before execute>");

  if (!execute) {
    console.log("[dry-run] No transaction will be broadcast. Pass --execute only after reviewing the payload.");
    return;
  }

  if (payerBalance < quoteAmount + 100_000_000) {
    throw new Error("Insufficient mainnet SOL for quote seed plus rent/fees.");
  }
  if (!baseBalance || BigInt(baseBalance.value.amount) < BigInt(baseAmount)) {
    throw new Error("Insufficient MAINNET_BASE_MINT balance for the requested base-side seed.");
  }

  const createPair = await DLMM.createCustomizablePermissionlessLbPair(
    connection,
    new BN(BIN_STEP),
    baseMint,
    NATIVE_SOL,
    new BN(activeId),
    new BN(FEE_BPS),
    ActivationType.Timestamp,
    false,
    payer.publicKey,
    new BN(activationTimestamp),
    false,
  );
  await simulateOrSend(connection, createPair, payer, true, "create mainnet DLMM pool");

  const dlmm = await DLMM.create(connection, poolAddress);
  const quotePosition = Keypair.generate();
  const quoteSeed = await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: quotePosition.publicKey,
    totalXAmount: new BN(0),
    totalYAmount: new BN(quoteAmount),
    strategy: {
      minBinId: activeId,
      maxBinId: activeId,
      strategyType: StrategyType.Spot,
      singleSidedX: false,
    },
    user: payer.publicKey,
    slippage: 100,
  });
  await simulateOrSend(connection, quoteSeed, payer, true, "seed mainnet quote-side position");

  const basePosition = Keypair.generate();
  const baseSeed = await dlmm.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: basePosition.publicKey,
    totalXAmount: new BN(baseAmount),
    totalYAmount: new BN(0),
    strategy: {
      minBinId: activeId,
      maxBinId: activeId,
      strategyType: StrategyType.Spot,
      singleSidedX: true,
    },
    user: payer.publicKey,
    slippage: 100,
  });
  await simulateOrSend(connection, baseSeed, payer, true, "seed mainnet base-side position");

  if (testSwaps) {
    const xArrays = await dlmm.getBinArrayForSwap(true, 4);
    const xQuote = dlmm.swapQuote(new BN(swapBaseAmount), true, new BN(100), xArrays);
    const xToY = await dlmm.swap({
      inToken: baseMint,
      outToken: NATIVE_SOL,
      inAmount: new BN(swapBaseAmount),
      minOutAmount: xQuote.minOutAmount,
      lbPair: poolAddress,
      user: payer.publicKey,
      binArraysPubkey: xQuote.binArraysPubkey,
    });
    await simulateOrSend(connection, xToY, payer, true, "test mainnet base-to-SOL swap");

    const yArrays = await dlmm.getBinArrayForSwap(false, 4);
    const yQuote = dlmm.swapQuote(new BN(swapQuoteAmount), false, new BN(100), yArrays);
    const yToX = await dlmm.swap({
      inToken: NATIVE_SOL,
      outToken: baseMint,
      inAmount: new BN(swapQuoteAmount),
      minOutAmount: yQuote.minOutAmount,
      lbPair: poolAddress,
      user: payer.publicKey,
      binArraysPubkey: yQuote.binArraysPubkey,
    });
    await simulateOrSend(connection, yToX, payer, true, "test mainnet SOL-to-base swap");
  }

  if (closeBasePosition) {
    const baseState = await dlmm.getPosition(basePosition.publicKey);
    const pd = baseState.positionData;
    const remove = await dlmm.removeLiquidity({
      user: payer.publicKey,
      position: basePosition.publicKey,
      fromBinId: pd.lowerBinId,
      toBinId: pd.upperBinId,
      bps: new BN(10_000),
      shouldClaimAndClose: true,
    });
    const transactions = Array.isArray(remove) ? remove : [remove];
    for (const [index, tx] of transactions.entries()) {
      await simulateOrSend(connection, tx, payer, true, `close mainnet base-side position ${index + 1}/${transactions.length}`);
    }
  }

  console.log("[complete] Mainnet DLMM deployment lifecycle finished.");
  console.log(`mainnet_pool=${poolAddress.toBase58()}`);
  console.log(`quote_position=${quotePosition.publicKey.toBase58()}`);
  console.log(`base_position=${basePosition.publicKey.toBase58()}`);
}

void main().catch(error => {
  console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
