# Panduan Pengujian — AgentBond Public Testnet (Solana Devnet)

Terakhir diperbarui: 30 Sep 2026
App: https://agentbond-umber.vercel.app
Jaringan: **Solana Devnet** — semua aset adalah token uji, tanpa nilai uang nyata.

---

## 1. Persiapan (±10 menit)

| Langkah | Detail |
|---|---|
| 1. Install Phantom | https://phantom.app (ekstensi browser Chrome/Brave/Firefox, atau aplikasi mobile) |
| 2. Buat wallet baru | Gunakan wallet **baru khusus testing**, jangan wallet utama |
| 3. Aktifkan mode Devnet | Phantom → Settings → Developer Settings → **Testnet/Devnet Mode: ON** |
| 4. Isi SOL Devnet | Faucet resmi: https://faucet.solana.com (masukkan alamat wallet, 0.5–1 SOL cukup). Alternatif: tombol deposit di Phantom (kadang rate-limit). |
| 5. Simpan data testing | Catat: alamat wallet, jam pengujian, langkah, dan link transaksi (Explorer) |

> Faucet Devnet dibatasi per IP. Jika gagal, coba lagi beberapa menit kemudian atau ganti jaringan.

---

## 2. Skenario Pengujian

### A. Koneksi Wallet & Tampilan Awal

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| A1 | Buka https://agentbond-umber.vercel.app | Halaman utama terbuka, judul "Live Solana Devnet Lab" |
| A2 | Klik "Connect Phantom" dan setujui popup | Alamat wallet tampil (format singkat `AbC1…xYz`), saldo SOL tampil |
| A3 | Buka menu navigasi → **Pools** | Halaman `/pools` terbuka (bukan 404), ada 1 entri "AgentBond (AGNT)" dengan badge **CANONICAL** |

### B. Swap di Venue DAMM v2 (fitur inti)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| B1 | Di halaman utama, pastikan venue **DAMM v2** aktif, arah `SOL → AGNT` | Quote muncul otomatis saat jumlah diisi |
| B2 | Isi amount `0.01` SOL | Muncul: ESTIMATED OUTPUT ≈ **194.000–196.000 AGNT**, MINIMUM AFTER SLIPPAGE sedikit di bawahnya, PRICE IMPACT tercantum jujur (angka besar karena pool kecil) |
| B3 | Klik **Send swap transaction** | Popup Phantom muncul → setujui |
| B4 | Tunggu konfirmasi | Muncul "Swap confirmed on Devnet" + link **View on Explorer** |
| B5 | Buka link Explorer (pastikan URL mengandung `?cluster=devnet`) | Transaksi sukses (`Success`, tidak ada error), token AGNT masuk ke wallet (cek tab token di Phantom) |
| B6 | Balik arah: `AGNT → SOL`, swap sebagian kecil AGNT | Sama seperti B3–B5, SOL masuk ke wallet |
| B7 | Ubah slippage ke `0.1` lalu swap AGNT→SOL jumlah besar | Transaksi **bisa gagal** dengan pesan slippage — ini perilaku yang benar (proteksi), catat pesan errornya |
| B8 | Isi amount `0` atau negatif | Tombol swap nonaktif / quote tidak muncul — tidak boleh crash |
| B9 | Putuskan wallet (disconnect), lalu klik swap | Muncul pesan "Connect a wallet…" — tidak boleh crash |

### C. Swap di Venue DLMM

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| C1 | Pilih pool **AGNT**, klik venue tab **DLMM** | Label berubah "METEORA DLMM SWAP" |
| C2 | Isi `0.01` SOL | Quote ≈ 190.000–200.000 AGNT (sebanding dengan DAMM v2, price impact ±16% — pool sengaja dibuat kecil) |
| C3 | Swap dan konfirmasi di Phantom | Sukses + link Explorer valid |
| C4 | Coba swap AGNT → SOL di DLMM | Berfungsi dua arah |
| C5 | Pilih pool lain (non-AGNT, jika ada) | Tab DLMM **hilang** — venue DLMM hanya untuk pool AGNT |

### D. Meluncurkan Token Baru (Launch)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| D1 | Menu → **Launch** | Form `/launch`: nama, simbol, IMAGE URL, METADATA URI, first buy |
| D2 | Isi nama/simbol bebas (contoh: `Test Coin` / `TST`), tempel URL gambar publik apa pun (contoh logo `https://…/logo.png`), first buy `0.01` SOL | Muncul quote live first-buy + estimasi biaya (total ± 0.02–0.03 SOL) |
| D3 | Klik **Host metadata** | Popup Phantom (upload storage Irys devnet, biaya pecahan kecil SOL) → METADATA URI terisi otomatis berawalan `https://devnet.irys.xyz/` |
| D4 | Kirim launch | **Popup Phantom 2x berturut-turut**: Tx1 membuat mint + metadata Metaplex, Tx2 membuat pool + first buy |
| D5 | Setelah sukses | Diarahkan ke pool baru; pool muncul di `/pools` dengan badge **UNVERIFIED** + disclaimer |
| D6 | Cek Explorer Tx1 & Tx2 | 2 transaksi sukses; mint baru terlihat di wallet |
| D7 | Cek mint di Phantom / explorer | Token menampilkan **nama, simbol, dan logo** (bukan "Unknown Token") — karena metadata Metaplex ikut dibuat di Tx1 |
| D8 | Swap di pool baru (venue DAMM v2) | Berfungsi — pool baru punya pasar DAMM v2 setelah dibuat |
| D9 | Tutup browser, buka ulang `/pools` | Pool buatan sendiri masih ada (localStorage). Di browser lain: klik **Refresh on-chain** → pool ikut terdeteksi dari data on-chain |
| D10 | Klik **Refresh on-chain** di `/pools` | Muncul catatan jumlah pool yang ditemukan dari on-chain scan; tidak ada duplikat dengan pool yang sudah tampil |

### E. Siklus Hidup & Graduasi (opsional, mahal)

> Membutuhkan kurva bonding terisi ~100% (banyak pembelian). Uji hanya jika ada budget SOL Devnet.

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| E1 | Buka pool launch baru di halaman utama | Panel **LIFECYCLE** menampilkan progres kurva (0–100%) |
| E2 | Beli token berulang sampai progres ≥ 100% | Tombol **Trigger graduation** aktif |
| E3 | Klik Trigger graduation | Popup Phantom (transaksi migrasi) → konfirmasi |
| E4 | Setelah sukses | Status berubah "MIGRATED TO DAMM V2", pool terdaftar di registry dengan alamat DAMM v2 |
| E5 | Pool AGNT kanonik | Lifecycle menampilkan **MIGRATED TO DAMM V2** — tombol graduasi tidak boleh tampil |

### F. Likuiditas / LP (DAMM v2)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| F1 | Di pool AGNT (atau pool hasil graduasi), cari panel **Liquidity** | Panel deposit + daftar posisi tampil |
| F2 | Deposit `0.05` SOL | Popup Phantom → konfirmasi → posisi baru muncul di daftar (NFT posisi milik wallet sendiri) |
| F3 | Withdraw posisi (pilih persen, lihat preview) | Popup Phantom → konfirmasi → saldo token kembali, posisi berkurang/hilang |
| F4 | Cek Explorer | Amount keluar/masuk konsisten dengan preview |
| F5 | Withdraw 100% pada posisi kecil | Berhasil; perhatikan notice bahwa remove dieksekusi pada harga pool saat ini |

### G. Kasus Tepi & Ketahanan

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| G1 | Reject (tolak) popup Phantom kapan pun | Pesan error ramah di UI, tidak crash, bisa dicoba ulang |
| G2 | Isi slippage `0` atau `50` | Ditolak dengan pesan (rentang valid 0.1–10%) |
| G3 | Ganti jaringan Phantom ke Mainnet lalu coba swap | Transaksi **gagal/ditolak** (mismatch jaringan: app memakai Devnet RPC) — catat pesan yang muncul |
| G4 | Klik semua tab/halaman cepat-cepat | Tidak ada crash atau blank |
| G5 | Refresh halaman saat quote loading | Recover normal setelah reload |

### H. LP DLMM (pool AGNT)

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| H1 | Di pool AGNT, cari panel **LIQUIDITY · AGNT/SOL BINS** | Panel DLMM tampil (label DLMM) di bawah panel DAMM v2 |
| H2 | Isi `0.02` SOL → **Add bid ladder** | Popup Phantom → konfirmasi → posisi baru muncul dengan rentang bin di bawah harga aktif |
| H3 | Daftar posisi | Setiap posisi menampilkan alamat singkat, rentang bin, dan saldo SOL + AGNT di dalamnya |
| H4 | **50%** pada satu posisi | Popup Phantom → konfirmasi → separuh likuiditas ditarik |
| H5 | **100%** pada posisi yang sama | Posisi ditarik penuh **dan ditutup**; hilang dari daftar setelah refresh |

### I. Agent Service (pay-per-task) — pool AGNT

> Agent service adalah proses operator yang berjalan lokal. Jika feed kosong, agent mungkin sedang offline — laporkan sebagai "agent offline", bukan bug app.

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| I1 | Di pool AGNT, cari panel **AGENT SERVICE** | Panel dengan kotak TASK, jumlah bayar, dan feed on-chain |
| I2 | Tulis pertanyaan singkat (≤500 karakter), PAY `0.001` SOL → **Send task** | Popup Phantom: transfer SOL ke wallet agent + memo (prompt) |
| I3 | Setelah konfirmasi, klik **Refresh** pada feed | Muncul **TASK** milikmu (alamat + prompt) |
| I4 | Tunggu ±30–60 detik, klik **Refresh** lagi | Muncul **REPLY** (jawaban agent sebagai memo on-chain) dan **BUYBACK** (agent menukar 50% pembayaran menjadi token sendiri di pasar DAMM v2) |
| I5 | Klik link Explorer pada BUYBACK | Transaksi sukses, agent bertambah X AGNT, berkurang SOL — sink token terverifikasi |
| I6 | Kirim task tanpa mengisi prompt | Ditolak dengan pesan — tidak boleh crash |
| I7 | Tanya data pasar: "Berapa harga AGNT sekarang?" | Jawaban berisi angka nyata yang bisa dicek di Explorer (harga spot, likuiditas pool, treasury agent) — bukan jawaban generik |

---

## 3. Yang Memang Belum Didukung (bukan bug)

- Venue **DLMM hanya untuk pool AGNT**; pool baru hasil launch diperdagangkan di DAMM v2 setelah dibuat (dlmm pool tidak otomatis dibuat).
- Registry pool tersimpan **per browser** (localStorage), tetapi tombol **Refresh on-chain** dapat mendeteksi pool launch dari data on-chain di browser mana pun.
- Token yang diluncurkan berbadge **UNVERIFIED** — hanya AGNT yang berbadge CANONICAL. Waspadai token palsu yang meniru nama.
- Klaim fee creator hanya muncul untuk wallet yang **adalah creator pool tersebut** (cek Lifecycle panel).
- Tidak ada mainnet; UI di kunci ke Devnet.
- Ukuran likuiditas kecil: price impact bisa besar pada swap besar — ini memang kondisi pool Devnet.

## 4. Cara Melaporkan Bug

Sertakan dalam laporan:

1. **Langkah reproduksi** (berurutan, singkat)
2. **Alamat wallet** dan **jam kejadian**
3. **Link transaksi Explorer** (jika ada): `https://explorer.solana.com/tx/<SIGNATURE>?cluster=devnet`
4. **Screenshot** popup Phantom / pesan error di UI
5. Browser + OS yang dipakai
6. Perilaku yang diharapkan vs yang terjadi

Template cepat:

```
Judul: [Fitur] - deskripsi singkat
Langkah: 1) ... 2) ... 3) ...
Ekspektasi: ...
Aktual: ...
Wallet: ...
Tx: https://explorer.solana.com/tx/...?cluster=devnet
Browser: ...
```

## 5. Referensi Cepat

| Item | Nilai |
|---|---|
| App | https://agentbond-umber.vercel.app |
| Halaman | `/` (swap+lab), `/pools` (registry), `/launch` (buat token) |
| Pool kanonik AGNT | DBC `9UfcuHMV…` · DAMM v2 `Aw25vo…` · DLMM `GxtUfNFw…` |
| Explorer Devnet | https://explorer.solana.com/?cluster=devnet |
| Faucet SOL Devnet | https://faucet.solana.com |
| Slippage default | 1% (rentang valid 0.1–10%) |
| Quote acuan | 0.01 SOL ≈ 194.000–196.000 AGNT (kedua venue, per 30 Sep 2026) |
