import { existsSync, readFileSync, copyFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { PublicKey } from "@solana/web3.js";

const envPath = ".env";
const backupPath = ".env.backup-before-devnet-config";
const fields = [
  ["VITE_METEORA_DBC_CONFIG", "DBC PoolConfig public key"],
  ["VITE_METEORA_BASE_MINT", "Base mint public key"],
  ["VITE_METEORA_DBC_POOL", "DBC VirtualPool public key"],
  ["VITE_METEORA_DAMM_V2_CONFIG", "DAMM v2 config public key"],
  ["VITE_METEORA_DAMM_V2_POOL", "DAMM v2 pool public key"],
  ["VITE_METEORA_DLMM_POOL", "DLMM pool public key"],
] as const;

function currentValue(content: string, key: string) {
  return content.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim() ?? "";
}

function setValue(content: string, key: string, value: string) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  return pattern.test(content) ? content.replace(pattern, line) : `${content.trimEnd()}\n${line}\n`;
}

async function main() {
  if (!existsSync(envPath)) throw new Error(".env tidak ditemukan. Jalankan dari root agentbond-meteora.");
  let content = readFileSync(envPath, "utf8");
  copyFileSync(envPath, backupPath);
  console.log(`Backup dibuat: ${backupPath}`);
  console.log("Masukkan public key Solana Devnet saja. Jangan masukkan private key atau seed phrase.");
  console.log("Tekan Enter untuk mempertahankan nilai yang sudah ada.\n");

  const rl = createInterface({ input, output });
  try {
    for (const [key, label] of fields) {
      const existing = currentValue(content, key);
      while (true) {
        const suffix = existing ? ` [sudah ada: ${existing}]` : "";
        const answer = (await rl.question(`${label} (${key})${suffix}: `)).trim();
        const value = answer || existing;
        if (!value) {
          console.log("Nilai wajib diisi untuk validasi strict. Coba lagi.");
          continue;
        }
        try {
          new PublicKey(value);
        } catch {
          console.log("Public key tidak valid. Masukkan alamat Solana base58 yang benar.");
          continue;
        }
        content = setValue(content, key, value);
        break;
      }
    }
  } finally {
    rl.close();
  }

  writeFileSync(envPath, content, { mode: 0o600 });
  console.log(`\n.env diperbarui dengan public key saja: ${envPath}`);
  console.log("Transaksi tetap disabled; VITE_METEORA_ENABLE_TRANSACTIONS tidak diubah.");
}

main().catch(error => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
