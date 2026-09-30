import { Connection, PublicKey } from "@solana/web3.js";
import {
  DynamicBondingCurveClient,
  deriveDammV2PoolAddress,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import { OPEN_DBC_CONFIG } from "./creator";
import { CANONICAL_POOLS } from "@/data/canonicalPools";
import { NATIVE_MINT, SOLANA_DEVNET_RPC, withReadRetry } from "./meteora";
import type { PoolRecord } from "./poolRegistry";

type RawVirtualPoolState = {
  config?: PublicKey | string;
  creator?: PublicKey | string;
  baseMint?: PublicKey | string;
  isMigrated?: boolean | number;
};

type PoolProgramAccount = {
  publicKey: PublicKey;
  account: { poolState?: RawVirtualPoolState } | RawVirtualPoolState;
};

/** Configs scanned for pools: the open launch config plus any canonical one. */
export function discoveryConfigs(): string[] {
  const configs = new Set<string>([OPEN_DBC_CONFIG]);
  for (const pool of CANONICAL_POOLS) {
    if (pool.dbcConfig) configs.add(pool.dbcConfig);
  }
  return Array.from(configs);
}

function pubKeyString(value: unknown): string | undefined {
  const asString =
    typeof value === "string"
      ? value
      : typeof (value as PublicKey | undefined)?.toBase58 === "function"
        ? (value as PublicKey).toBase58()
        : undefined;
  return asString && asString.length > 0 ? asString : undefined;
}

async function resolveDammV2Pool(
  connection: Connection,
  baseMint: string
): Promise<string | undefined> {
  const dammConfigAddress = import.meta.env.VITE_METEORA_DAMM_V2_CONFIG?.trim();
  if (!dammConfigAddress) return undefined;
  try {
    const dammConfig = new PublicKey(dammConfigAddress);
    const base = new PublicKey(baseMint);
    const quote = new PublicKey(NATIVE_MINT);
    const asTokenA = deriveDammV2PoolAddress(dammConfig, base, quote).toBase58();
    const asTokenB = deriveDammV2PoolAddress(dammConfig, quote, base).toBase58();
    const [infoA, infoB] = await Promise.all([
      connection.getAccountInfo(new PublicKey(asTokenA)),
      connection.getAccountInfo(new PublicKey(asTokenB)),
    ]);
    return infoA ? asTokenA : infoB ? asTokenB : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reads every DBC virtual pool on the launch configs directly from Devnet.
 * Canonical/user-registered entries win in the registry merge; discovered
 * records only fill pools this browser has never seen.
 */
export async function discoverPools(): Promise<PoolRecord[]> {
  const connection = new Connection(SOLANA_DEVNET_RPC, "confirmed");
  const client = DynamicBondingCurveClient.create(connection, "confirmed");

  const accounts: PoolProgramAccount[] = [];
  for (const config of discoveryConfigs()) {
    try {
      const found = await withReadRetry(() => client.state.getPoolsByConfig(new PublicKey(config)));
      accounts.push(...(found as unknown as PoolProgramAccount[]));
    } catch {
      // A single config failing to scan must not block discovery of the rest.
    }
  }

  const seenPools = new Set<string>();
  const records: PoolRecord[] = [];

  await Promise.all(
    accounts.map(async entry => {
      const dbcPool = entry.publicKey.toBase58();
      if (seenPools.has(dbcPool)) return;
      seenPools.add(dbcPool);

      const raw = (entry.account as { poolState?: RawVirtualPoolState })?.poolState ??
        (entry.account as RawVirtualPoolState);
      const baseMint = pubKeyString(raw?.baseMint);
      if (!baseMint) return;

      const isMigrated = Boolean(raw?.isMigrated);
      let name = "";
      let symbol = "";
      try {
        const metas = await client.state.getPoolMetadata(entry.publicKey);
        const meta = Array.isArray(metas) ? metas[0] : metas;
        name = typeof meta?.name === "string" ? meta.name : "";
      } catch {
        // Metadata is optional; fall back to a mint-derived label below.
      }
      symbol =
        name
          .trim()
          .split(/\s+/)[0]
          ?.replace(/[^A-Za-z0-9]/g, "")
          .slice(0, 10)
          .toUpperCase() || baseMint.slice(0, 4).toUpperCase();
      if (!name) name = `Pool ${baseMint.slice(0, 4)}…${baseMint.slice(-4)}`;

      const dammV2Pool = isMigrated
        ? await resolveDammV2Pool(connection, baseMint)
        : undefined;

      records.push({
        id: `discovered-${dbcPool}`,
        name,
        symbol,
        verified: false,
        stage: isMigrated ? "graduated" : "curve",
        creator: pubKeyString(raw?.creator),
        dbcConfig: pubKeyString(raw?.config),
        dbcPool,
        baseMint,
        dammV2Pool,
      });
    })
  );

  return records;
}
