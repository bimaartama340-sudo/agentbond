import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  createInitializeMint2Instruction,
  getMinimumBalanceForRentExemptMint,
} from "@solana/spl-token";
import {
  createCreateMetadataAccountV3Instruction,
} from "@metaplex-foundation/mpl-token-metadata";
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import {
  assertDevnetEnvironment,
  assertMeteoraWritesEnabled,
  SOLANA_DEVNET_RPC,
  withReadRetry,
} from "./meteora";
import { upsertUserPool } from "./poolRegistry";
import type { SolanaProvider } from "./meteora";

export const OPEN_DBC_CONFIG =
  import.meta.env.VITE_METEORA_OPEN_CONFIG?.trim() ||
  "GjUwEndnV2pWExtyVS8cDgTajeYon8g9MExdu6f9Wkxa";
export const DEFAULT_TOKEN_DECIMALS = 6;
export const METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

/** Standard Metaplex metadata PDA for a mint. */
export function deriveMetadataPda(mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  )[0];
}

export function validateLaunchInput(input: { name: string; symbol: string; firstBuySol: number }) {
  const name = input.name.trim();
  const symbol = input.symbol.trim().toUpperCase();
  if (name.length < 2 || name.length > 32) throw new Error("Name must be 2-32 characters");
  if (symbol.length < 2 || symbol.length > 10) throw new Error("Symbol must be 2-10 characters");
  if (!Number.isFinite(input.firstBuySol) || input.firstBuySol <= 0) {
    throw new Error("First buy amount must be greater than zero");
  }
  return { name, symbol };
}

/**
 * Tx1: creates the token mint, plus the Metaplex metadata account when
 * token metadata is provided. The mint keypair is generated in-browser,
 * co-signs this transaction, and never leaves the creator's machine.
 */
export async function buildCreateMintTx(params: {
  creator: PublicKey;
  mintKeypair: Keypair;
  decimals?: number;
  metadata?: { name: string; symbol: string; uri: string };
}) {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const decimals = params.decimals ?? DEFAULT_TOKEN_DECIMALS;
  const lamports = await getMinimumBalanceForRentExemptMint(connection);
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: params.creator,
      newAccountPubkey: params.mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMint2Instruction(
      params.mintKeypair.publicKey,
      decimals,
      params.creator,
      params.creator,
      TOKEN_PROGRAM_ID
    )
  );
  if (params.metadata) {
    transaction.add(
      createCreateMetadataAccountV3Instruction(
        {
          metadata: deriveMetadataPda(params.mintKeypair.publicKey),
          mint: params.mintKeypair.publicKey,
          mintAuthority: params.creator,
          payer: params.creator,
          updateAuthority: params.creator,
        },
        {
          createMetadataAccountArgsV3: {
            data: {
              name: params.metadata.name,
              symbol: params.metadata.symbol,
              uri: params.metadata.uri,
              sellerFeeBasisPoints: 0,
              creators: [
                { address: params.creator, verified: true, share: 100 },
              ],
              collection: null,
              uses: null,
            },
            isMutable: true,
            collectionDetails: null,
          },
        }
      )
    );
  }
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = params.creator;
  transaction.recentBlockhash = blockhash;
  transaction.partialSign(params.mintKeypair);
  return { transaction, connection, blockhash, lastValidBlockHeight, decimals };
}

async function sendAndConfirm(
  transaction: Transaction,
  connection: Connection,
  provider: SolanaProvider
) {
  let signature: string;
  if (provider.signAndSendTransaction) {
    signature = (await provider.signAndSendTransaction(transaction)).signature;
  } else if (provider.sendTransaction) {
    signature = await provider.sendTransaction(transaction, connection);
  } else {
    throw new Error("Connected wallet cannot send transactions");
  }
  await connection.confirmTransaction(signature, "confirmed");
  return signature;
}

export async function estimateLaunchQuote(params: {
  firstBuySol: number;
  slippageBps: number;
  configAddress?: string;
}) {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const configState = await withReadRetry(() =>
    client.state.getPoolConfig(new PublicKey(params.configAddress?.trim() || OPEN_DBC_CONFIG))
  );
  if (!configState) throw new Error("Open DBC config not found on Devnet");
  const quote = client.pool.getQuoteFromInputAmount({
    config: configState,
    swapBaseForQuote: false,
    amountIn: new BN(Math.round(params.firstBuySol * 1_000_000_000)),
    slippageBps: params.slippageBps,
  });
  return quote;
}

export type LaunchResult = {
  mint: string;
  dbcPool: string;
  createMintSignature: string;
  createPoolSignature: string;
  firstBuyOut: string;
};

export async function launchTokenWithFirstBuy(params: {
  creator: string;
  name: string;
  symbol: string;
  uri?: string;
  firstBuySol: number;
  slippageBps: number;
  provider: SolanaProvider;
  decimals?: number;
}): Promise<LaunchResult> {
  assertDevnetEnvironment();
  assertMeteoraWritesEnabled();
  const { name, symbol } = validateLaunchInput(params);
  if (!params.provider.signAndSendTransaction && !params.provider.sendTransaction) {
    throw new Error("Connected wallet cannot send transactions");
  }

  const creator = new PublicKey(params.creator);
  const config = new PublicKey(OPEN_DBC_CONFIG);
  const mintKeypair = Keypair.generate();

  // Tx1: create + initialize the SPL mint, with the Metaplex metadata
  // account when a URI is supplied (mint keypair co-signs locally).
  const uri = params.uri?.trim();
  const mintTx = await buildCreateMintTx({
    creator,
    mintKeypair,
    decimals: params.decimals,
    metadata: uri ? { name, symbol, uri } : undefined,
  });
  const createMintSignature = await sendAndConfirm(
    mintTx.transaction,
    mintTx.connection,
    params.provider
  );

  // Tx2: create the DBC pool and append the creator's first buy.
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");
  const configState = await withReadRetry(() => client.state.getPoolConfig(config));
  if (!configState) throw new Error("Open DBC config not found on Devnet");
  const buyQuote = client.pool.getQuoteFromInputAmount({
    config: configState,
    swapBaseForQuote: false,
    amountIn: new BN(Math.round(params.firstBuySol * 1_000_000_000)),
    slippageBps: params.slippageBps,
  });
  const slippageFloor = buyQuote.outputAmount
    .mul(new BN(10_000 - params.slippageBps))
    .div(new BN(10_000));
  const minimumAmountOut =
    buyQuote.minimumAmountOut && buyQuote.minimumAmountOut.gt(new BN(0))
      ? buyQuote.minimumAmountOut
      : slippageFloor;
  if (minimumAmountOut.lte(new BN(0))) {
    throw new Error("First-buy quote produced a zero minimum out; refusing to launch");
  }

  const transaction = await client.creator.createPoolWithFirstBuy({
    createPoolParam: {
      name,
      symbol,
      uri:
        uri ||
        `https://agentbond.dev/pool/${mintKeypair.publicKey.toBase58()}.json`,
      payer: creator,
      poolCreator: creator,
      config,
      baseMint: mintKeypair.publicKey,
    },
    firstBuyParam: {
      buyer: creator,
      receiver: creator,
      buyAmount: new BN(Math.round(params.firstBuySol * 1_000_000_000)),
      minimumAmountOut,
      referralTokenAccount: null,
    },
  });
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = creator;
  transaction.recentBlockhash = blockhash;

  let createPoolSignature: string;
  try {
    createPoolSignature = await sendAndConfirm(transaction, connection, params.provider);
  } catch (error) {
    // Mint already exists on-chain; a retry must reuse it, never regenerate.
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Mint ${mintKeypair.publicKey.toBase58()} was created but the pool transaction failed: ${message}. Retry with this mint address.`
    );
  }

  const dbcPool = deriveDbcPoolAddress(
    configState.quoteMint,
    mintKeypair.publicKey,
    config
  ).toBase58();

  upsertUserPool({
    id: `user-${dbcPool}`,
    name,
    symbol,
    stage: "curve",
    creator: params.creator,
    dbcConfig: config.toBase58(),
    dbcPool,
    baseMint: mintKeypair.publicKey.toBase58(),
  });

  return {
    mint: mintKeypair.publicKey.toBase58(),
    dbcPool,
    createMintSignature,
    createPoolSignature,
    firstBuyOut: minimumAmountOut.toString(),
  };
}
