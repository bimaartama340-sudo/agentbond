# AgentBond Devnet Deployment and Real-Pool Configuration Guide

## Kesimpulan penting

AgentBond tidak perlu men-deploy ulang program DBC, DAMM v2, atau DLMM milik Meteora. Program tersebut adalah infrastruktur Meteora yang sudah deployed. Yang perlu dibuat dan diverifikasi adalah wallet Devnet, `PoolConfig`, base mint, DBC `VirtualPool`, konfigurasi migrasi DAMM v2, pool DAMM v2 hasil migrasi, DLMM pool, dan DLMM position.

Implementasi AgentBond saat ini sudah mendukung pembacaan state, retry RPC/SDK, DBC-to-DAMM v2 transaction preview, dan simulasi DLMM. Implementasi ini **belum mengirim transaction migration atau liquidity**. Karena itu, gunakan workflow resmi Meteora atau script terpisah yang sudah direview untuk write pertama.

> **Aturan keamanan:** private key, seed phrase, wallet JSON, dan signing secret tidak boleh masuk ke `.env`, `VITE_*`, Git, browser bundle, atau hosting publik.

## 1. Siapkan toolchain

Gunakan Node.js 22.12 atau lebih baru dan pnpm 10 atau lebih baru untuk workflow Meteora Invent. Verifikasi juga Solana CLI:

```bash
node --version
pnpm --version
solana --version
solana-keygen --version
```

Jika kelak AgentBond memiliki custom Solana program, build dan deploy dilakukan dengan `cargo build-sbf` lalu `solana program deploy`. Saat ini AgentBond tidak memiliki custom on-chain program yang diperlukan untuk DBC/DAMM/DLMM.

## 2. Buat wallet Devnet khusus

```bash
mkdir -p "$HOME/.config/solana-agentbond-devnet"
solana-keygen new \
  --outfile "$HOME/.config/solana-agentbond-devnet/id.json" \
  --no-bip39-passphrase
solana config set \
  --keypair "$HOME/.config/solana-agentbond-devnet/id.json" \
  --url https://api.devnet.solana.com
solana address
solana config get
solana airdrop 2
solana balance
```

Gunakan wallet ini hanya untuk Devnet. Simpan file keypair di luar repository dan jangan pernah membagikan isinya.

## 3. Tetapkan RPC dan verifikasi program

```bash
export SOLANA_DEVNET_RPC="https://api.devnet.solana.com"
solana config set --url "$SOLANA_DEVNET_RPC"
solana cluster-version
solana balance
```

Ambil program ID dari versi SDK yang terpasang dan dokumentasi Meteora terkini. Jangan menebak alamat atau menyalin alamat mainnet ke Devnet. Untuk setiap program, pastikan account executable:

```bash
solana account <DBC_PROGRAM_ID> --output json
solana account <DAMM_V2_PROGRAM_ID> --output json
solana account <DLMM_PROGRAM_ID> --output json
```

Jika alamat tidak executable atau tidak cocok dengan cluster Devnet, hentikan proses.

## 4. Pahami akun yang harus dibuat

| Akun | Dibuat oleh | Disimpan di AgentBond |
|---|---|---|
| Wallet | Anda | Public key saja |
| DBC program | Meteora | Program ID |
| DBC `PoolConfig` | Workflow DBC | Config public key |
| Base mint | Workflow DBC atau mint existing | Mint public key |
| DBC `VirtualPool` | Transaksi create pool | Pool public key |
| DAMM v2 program | Meteora | Program ID |
| DAMM v2 config | Migration target | Config public key |
| DAMM v2 pool | Transaksi migration | Pool public key |
| DLMM program | Meteora | Program ID |
| DLMM pool | Workflow DLMM | Pool public key |
| DLMM position | Transaksi seeding | Position public key |

DBC `PoolConfig` bukan DAMM v2 config. DBC `VirtualPool` juga bukan DAMM v2 pool.

## 5. Buat DBC config, base mint, dan VirtualPool

Untuk pool pertama, gunakan workflow resmi Meteora Invent DBC launch pool. Workflow tersebut mengatur curve, token behavior, fee, migration option, dan graduated-pool settings. Pool creation dapat membuat base mint otomatis. Jika membutuhkan mint tertentu, gunakan base-mint keypair sesuai workflow resmi.

Sebelum create pool, tentukan:

- Nama, symbol, URI, decimals, dan supply token.
- Quote mint yang didukung workflow.
- Bonding curve dan fee schedule.
- Migration option `DAMM v2`.
- Migration quote/base threshold.
- Creator/partner liquidity percentage.
- Migrated fee settings.
- Token authority dan supply behavior.

Simpan hasil command:

```text
network=devnet
wallet=<wallet public key>
dbc_config=<PoolConfig public key>
base_mint=<base mint public key>
dbc_pool=<VirtualPool public key>
creation_signature=<signature>
```

Verifikasi account dan signature:

```bash
solana account <DBC_CONFIG_ADDRESS> --output json
solana account <BASE_MINT_ADDRESS> --output json
solana account <DBC_POOL_ADDRESS> --output json
solana confirm <CREATION_SIGNATURE>
```

`VITE_METEORA_DBC_POOL` harus menunjuk ke account VirtualPool yang dimiliki program DBC, bukan system account atau token account biasa.

## 6. Isi konfigurasi AgentBond

```bash
cd /Users/idcuq/Documents/AgentBond/agentbond-meteora
cp .env.example .env
```

Isi public Devnet values berikut:

```dotenv
VITE_SOLANA_DEVNET_RPC=https://api.devnet.solana.com
VITE_METEORA_DBC_PROGRAM=<verified DBC program ID>
VITE_METEORA_DBC_CONFIG=<real PoolConfig address>
VITE_METEORA_BASE_MINT=<real base mint address>
VITE_METEORA_DBC_POOL=<real VirtualPool address>
VITE_METEORA_DAMM_V2_CONFIG=<migration target DAMM v2 config address>
VITE_METEORA_DAMM_V2_POOL=
VITE_METEORA_DLMM_POOL=

VITE_METEORA_DLMM_ACTIVE_BIN_ID=0
VITE_METEORA_DLMM_BIN_RANGE=10
VITE_METEORA_DLMM_TOKEN_X_AMOUNT=0.1
VITE_METEORA_DLMM_TOKEN_Y_AMOUNT=0.1
```

Jangan isi `VITE_METEORA_DAMM_V2_POOL` sebelum migration berhasil. Jangan isi `VITE_METEORA_DLMM_POOL` sebelum DLMM pool benar-benar dibuat.

Jalankan:

```bash
pnpm test
pnpm check
pnpm build
pnpm dev
```

Buka `http://localhost:3000/`, jalankan read-only lifecycle check, dan pastikan DBC account ditemukan. DAMM v2 dan DLMM tidak boleh dilaporkan ready sebelum account-nya terbukti readable.

## 7. Verifikasi DBC graduation

Migration hanya boleh dilakukan jika VirtualPool sudah memenuhi kondisi graduation dari config. Baca account menggunakan DBC SDK atau workflow resmi dan pastikan:

- Account adalah VirtualPool milik program DBC.
- Migration condition sudah tercapai.
- Config memakai DAMM v2.
- Migration fee dan graduated-pool settings dipahami.
- Payer memiliki SOL untuk fee dan rent.
- Reserve base/quote sesuai ekspektasi.

Jangan menyimpulkan graduation hanya dari label UI atau keberadaan alamat pool. Account data adalah sumber kebenaran.

## 8. Build dan review migration DBC ke DAMM v2

AgentBond membungkus method SDK resmi berikut dalam mode preview-only:

```ts
client.migration.migrateToDammV2({
  payer,
  pool,
  dammConfig,
});
```

Gunakan **Build DAMM v2 migration preview** di Home. Preview mengembalikan transaction dan dua NFT position keypairs dari SDK, tetapi tidak memanggil `sendTransaction`.

Review:

- Payer adalah wallet Devnet yang benar.
- Pool sama dengan VirtualPool yang diverifikasi.
- DAMM config adalah target migration yang benar.
- Instruction count tidak nol.
- Transaction belum dikirim.
- Dua NFT position public key dicatat.

Setelah workflow write yang direview berhasil, catat:

```text
migration_signature=<signature>
damm_v2_pool=<resulting pool address>
first_position_nft=<address>
second_position_nft=<address>
```

Verifikasi:

```bash
solana confirm <MIGRATION_SIGNATURE>
solana account <DAMM_V2_POOL_ADDRESS> --output json
```

Baru setelah itu isi `VITE_METEORA_DAMM_V2_POOL`.

## 9. Buat dan seed DLMM pool

Gunakan workflow resmi Meteora Invent DLMM launch pool. Konfigurasikan:

- Base mint dan quote mint.
- Bin step.
- Initial active bin atau initial price.
- Activation behavior.
- Fee settings.
- Liquidity strategy: spot, curve, atau bid-ask.
- Seeding method: LFG atau single-bin.

Workflow resmi mendukung base mint existing maupun base mint baru. Jika token DBC akan diteruskan ke DLMM, gunakan mint yang sama dan jangan membuat token kedua tanpa alasan produk yang jelas.

Simpan hasil:

```text
network=devnet
wallet=<wallet public key>
base_mint=<base mint>
quote_mint=<quote mint>
dlmm_pool=<DLMM pool>
active_bin_id=<active bin>
bin_step=<bin step>
creation_signature=<signature>
seed_signature=<signature>
position_address=<position address>
```

Verifikasi:

```bash
solana account <DLMM_POOL_ADDRESS> --output json
solana confirm <DLMM_CREATION_SIGNATURE>
solana confirm <DLMM_SEED_SIGNATURE>
```

## 10. Isi alamat DLMM ke AgentBond

```dotenv
VITE_METEORA_DLMM_POOL=<real DLMM pool address>
VITE_METEORA_DLMM_ACTIVE_BIN_ID=<actual active bin ID>
VITE_METEORA_DLMM_BIN_RANGE=<reviewed range>
VITE_METEORA_DLMM_TOKEN_X_AMOUNT=<small test amount>
VITE_METEORA_DLMM_TOKEN_Y_AMOUNT=<small test amount>
```

Restart Vite setelah mengubah variable. Jalankan read-only check dan pastikan:

1. DBC ditemukan.
2. DAMM v2 readable.
3. DLMM readable.
4. Active bin dan range sesuai deployment record.
5. DLMM simulator tetap menunjukkan `submitted: false`.

Simulator bukan bukti bahwa transaksi on-chain akan berhasil. Ia hanya memvalidasi parameter dan preview distribusi bin.

## 11. Urutan smoke test write pertama

1. Buka browser profile baru.
2. Hubungkan hanya wallet Devnet khusus.
3. Baca semua state.
4. Cocokkan public key dengan deployment record.
5. Build DBC-to-DAMM v2 preview.
6. Review payer, pool, config, instruction, dan account.
7. Submit hanya dari wallet adapter atau script lokal yang sudah direview.
8. Tunggu commitment `confirmed`.
9. Simpan signature dan Explorer URL.
10. Baca ulang pool dan position account.
11. Ulangi untuk DLMM dengan nominal kecil.
12. Hentikan jika cluster, wallet, mint, config, atau pool berbeda.

Explorer Devnet:

```text
https://explorer.solana.com/address/<ADDRESS>?cluster=devnet
https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet
```

## 12. Go/no-go gate

Deployment **GO** hanya jika wallet, program ID, config, mint, DBC pool, migration target, DAMM pool, DLMM pool, active bin, position, dan signatures sudah diverifikasi. AgentBond juga harus membaca account hasil transaksi dari Devnet.

Deployment **NO-GO** jika ada placeholder, fixture lokal, signature yang belum confirmed, atau workflow belum bisa menjelaskan wallet mana yang menandatangani setiap instruction.

## 13. Perintah validasi lokal

```bash
cd /Users/idcuq/Documents/AgentBond/agentbond-meteora
pnpm test
pnpm check
pnpm build
```

## References

[1]: https://docs.meteora.ag/developer-guides/dbc/program/accounts "Meteora DBC program accounts and migration state"
[2]: https://solana.com/docs/programs/deploying "Solana program deployment"
[3]: https://docs.meteora.ag/developer-guides/dbc/typescript-sdk "Meteora DBC TypeScript SDK"
[4]: https://docs.meteora.ag/developer-guides/dlmm/typescript-sdk/getting-started "Meteora DLMM TypeScript SDK getting started"
[5]: https://docs.meteora.ag/invent/launch-pools/dbc-token-launch-pool "Meteora DBC token launch pool"
[6]: https://docs.meteora.ag/invent/launch-pools/dlmm-launch-pool "Meteora DLMM launch pool"
[7]: https://docs.meteora.ag/developer-guides/damm-v2 "Meteora DAMM v2 developer guide"

**Status:** runbook lokal. Dokumen ini bukan bukti bahwa migration atau DLMM transaction sudah berhasil live di Devnet.
