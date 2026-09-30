import type { PoolRecord } from "@/lib/poolRegistry";

/**
 * Curated canonical pools. These are the operator-created accounts recorded in
 * DEVNET_DEPLOYMENT_RECORD.md and are the only entries with verified: true.
 */
export const CANONICAL_POOLS: PoolRecord[] = [
  {
    id: "agnt-canonical",
    name: "AgentBond",
    symbol: "AGNT",
    verified: true,
    stage: "graduated",
    creator: "agentbond-operator",
    dbcConfig: "GjUwEndnV2pWExtyVS8cDgTajeYon8g9MExdu6f9Wkxa",
    dbcPool: "9UfcuHMVfuWPTvakWKSd8hodwLgJt3cF8ADSDVVHH6Ff",
    baseMint: "7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9",
    dammV2Pool: "Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw",
    dlmmPool: "GxtUfNFw9DgCnHNsajKaJY6FmNKFPwGfzvLF5kXSykPV",
    agentWallet: "sgscgDAj9RUbxpi1db3dfisbk9PFE3Yh4UKr5j3TpCA",
  },
];
