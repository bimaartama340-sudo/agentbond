import { readFileSync } from "node:fs";
import { Connection, PublicKey } from "@solana/web3.js";

type Env = Record<string, string>;

const REQUIRED = [
  "VITE_METEORA_DBC_PROGRAM",
  "VITE_METEORA_DBC_CONFIG",
  "VITE_METEORA_BASE_MINT",
];
const OPTIONAL_ACCOUNTS = [
  "VITE_METEORA_DBC_POOL",
  "VITE_METEORA_DAMM_V2_CONFIG",
  "VITE_METEORA_DAMM_V2_POOL",
  "VITE_METEORA_DLMM_POOL",
];

function loadEnv(path = ".env"): Env {
  let source = "";
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#") && line.includes("="))
      .map(line => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).trim()];
      })
  );
}

function isPlaceholder(value: string | undefined) {
  return !value || /^(<.*>|YOUR_|REPLACE|TODO|CHANGE_ME)$/i.test(value);
}

function parseAddress(name: string, value: string | undefined) {
  if (isPlaceholder(value)) return { name, status: "missing" as const };
  try {
    return { name, status: "valid" as const, address: new PublicKey(value).toBase58() };
  } catch {
    return { name, status: "invalid" as const };
  }
}

async function main() {
  const env = loadEnv();
  const strict = process.argv.includes("--strict");
  const network = (env.VITE_SOLANA_NETWORK || "devnet").toLowerCase();
  const rpc = env.VITE_SOLANA_DEVNET_RPC || "https://api.devnet.solana.com";
  const results = [...REQUIRED, ...OPTIONAL_ACCOUNTS].map(name =>
    parseAddress(name, env[name])
  );

  console.log(`network=${network}`);
  console.log(`rpc=${rpc.replace(/https?:\/\//, "").split("/")[0]}`);
  for (const result of results) {
    if (result.status === "valid") console.log(`[valid] ${result.name}=${result.address}`);
    else console.log(`[${result.status}] ${result.name}`);
  }

  if (network !== "devnet") {
    console.error("[error] AgentBond currently permits Devnet only.");
    process.exitCode = 1;
    return;
  }

  const invalid = results.filter(result => result.status === "invalid");
  if (invalid.length > 0) {
    console.error(`[error] ${invalid.length} address value(s) are invalid.`);
    process.exitCode = 1;
    return;
  }

  const connection = new Connection(rpc, "confirmed");
  try {
    const slot = await connection.getSlot("confirmed");
    console.log(`[rpc-ok] confirmed slot=${slot}`);
    for (const result of results.filter(
      (item): item is typeof item & { status: "valid"; address: string } =>
        item.status === "valid"
    )) {
      const account = await connection.getAccountInfo(new PublicKey(result.address), "confirmed");
      console.log(
        account ? `[account-ok] ${result.name} owner=${account.owner.toBase58()}` : `[account-missing] ${result.name}`
      );
    }
  } catch (error) {
    console.error(`[rpc-error] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const missing = results.filter(result => result.status === "missing");
  if (missing.length > 0) {
    console.log(`[pending] ${missing.length} account value(s) still require real Devnet deployment evidence.`);
    if (strict) process.exitCode = 2;
  } else {
    console.log("[ready] All configured account addresses passed syntax and RPC checks.");
  }
}

void main();
