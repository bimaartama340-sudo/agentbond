import { describe, expect, it, vi } from "vitest";

vi.mock("@meteora-ag/dynamic-bonding-curve-sdk", () => ({
  DynamicBondingCurveClient: { create: vi.fn() },
  deriveDbcPoolAddress: vi.fn(),
}));
vi.mock("@meteora-ag/cp-amm-sdk", () => ({ CpAmm: class {} }));
vi.mock("@meteora-ag/dlmm", () => ({ default: { create: vi.fn() } }));
vi.mock("./meteora", () => ({
  SOLANA_DEVNET_RPC: "https://api.devnet.solana.com",
  withReadRetry: vi.fn(async (task: () => Promise<unknown>) => task()),
  assertDevnetEnvironment: vi.fn(),
  assertMeteoraWritesEnabled: vi.fn(),
}));
vi.mock("@solana/web3.js", async importOriginal => {
  const actual = await importOriginal<typeof import("@solana/web3.js")>();
  vi.spyOn(actual.Connection.prototype, "getLatestBlockhash").mockResolvedValue({
    blockhash: "11111111111111111111111111111111",
    lastValidBlockHeight: 1234,
  });
  return actual;
});
vi.mock("@solana/spl-token", async () => {
  const web3 = await import("@solana/web3.js");
  return {
    MINT_SIZE: 82,
    TOKEN_PROGRAM_ID: new web3.PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    createInitializeMint2Instruction: vi.fn(() =>
      web3.SystemProgram.transfer({ fromPubkey: web3.Keypair.generate().publicKey, toPubkey: web3.Keypair.generate().publicKey, lamports: 1 })
    ),
    getMinimumBalanceForRentExemptMint: vi.fn(async () => 1_460_160),
  };
});
import { buildCreateMintTx, deriveMetadataPda, METADATA_PROGRAM_ID, validateLaunchInput } from "./creator";

import { Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";

describe("creator launch input", () => {
  it("accepts valid names and symbols and normalizes the symbol", () => {
    const result = validateLaunchInput({ name: "My Agent", symbol: "mas", firstBuySol: 0.01 });
    expect(result.name).toBe("My Agent");
    expect(result.symbol).toBe("MAS");
  });

  it("rejects names and symbols outside the allowed lengths", () => {
    expect(() => validateLaunchInput({ name: "a", symbol: "MAS", firstBuySol: 0.01 })).toThrow("Name must be 2-32");
    expect(() => validateLaunchInput({ name: "x".repeat(33), symbol: "MAS", firstBuySol: 0.01 })).toThrow("Name must be 2-32");
    expect(() => validateLaunchInput({ name: "Valid name", symbol: "T", firstBuySol: 0.01 })).toThrow("Symbol must be 2-10");
    expect(() => validateLaunchInput({ name: "Valid name", symbol: "TOOLONGSYMBO", firstBuySol: 0.01 })).toThrow("Symbol must be 2-10");
  });

  it("requires a positive first buy", () => {
    expect(() => validateLaunchInput({ name: "Valid name", symbol: "MAS", firstBuySol: 0 })).toThrow("First buy amount");
    expect(() => validateLaunchInput({ name: "Valid name", symbol: "MAS", firstBuySol: Number.NaN })).toThrow("First buy amount");
  });
});

describe("mint creation transaction", () => {
  const creator = Keypair.generate();
  const mintKeypair = Keypair.generate();

  it("derives the standard Metaplex metadata PDA deterministically", () => {
    const pda = deriveMetadataPda(mintKeypair.publicKey);
    const again = deriveMetadataPda(mintKeypair.publicKey);
    expect(pda.toBase58()).toBe(again.toBase58());
    expect(pda.equals(mintKeypair.publicKey)).toBe(false);
  });

  it("builds a 2-instruction transaction when no metadata is supplied", async () => {
    const { transaction } = await buildCreateMintTx({ creator: creator.publicKey, mintKeypair });
    expect(transaction.instructions).toHaveLength(2);
    expect(transaction.feePayer).toEqual(creator.publicKey);
    // The mint keypair co-signs locally; the fee payer's signature stays
    // null until the wallet signs.
    const mintSignature = transaction.signatures.find(entry => entry.publicKey.equals(mintKeypair.publicKey));
    expect(mintSignature?.signature).not.toBeNull();
    const creatorSignature = transaction.signatures.find(entry => entry.publicKey.equals(creator.publicKey));
    expect(creatorSignature?.signature).toBeNull();
  });

  it("appends the Metaplex createMetadataAccountV3 instruction with creator-verified metadata", async () => {
    const { transaction } = await buildCreateMintTx({
      creator: creator.publicKey,
      mintKeypair,
      metadata: { name: "My Agent", symbol: "MAS", uri: "https://devnet.irys.xyz/abc" },
    });
    expect(transaction.instructions).toHaveLength(3);
    const metadataIx = transaction.instructions[2];
    expect(metadataIx.programId.toBase58()).toBe(METADATA_PROGRAM_ID.toBase58());
    expect(METADATA_PROGRAM_ID.toBase58()).toBe("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
    const metadataPda = deriveMetadataPda(mintKeypair.publicKey);
    const pdaKey = metadataIx.keys.find(key => key.pubkey.equals(metadataPda));
    expect(pdaKey?.isSigner).toBe(false);
    const authorityKey = metadataIx.keys.find(key => key.pubkey.equals(creator.publicKey));
    expect(authorityKey?.isSigner).toBe(true);
    // The mint keypair must co-sign the transaction it funds.
    const mintSigner = metadataIx.keys.find(key => key.pubkey.equals(mintKeypair.publicKey));
    expect(mintSigner).toBeDefined();
  });
});
