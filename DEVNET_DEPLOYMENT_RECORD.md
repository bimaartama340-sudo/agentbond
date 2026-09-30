# AgentBond Devnet Deployment Record

> Public-only progress record. Never add private keys, seed phrases, wallet JSON, or signing secrets.

## Run metadata

| Field | Value |
|---|---|
| Network | `devnet` |
| RPC host | `api.devnet.solana.com` |
| Operator wallet public key | `D92g759nWqyjjjwJxJ32KswzEupBHZKYRdJ8RMuv12Cn` |
| Confirmed final wallet balance after remove/close | `2.630909632 SOL` |
| Write flag | `VITE_METEORA_ENABLE_TRANSACTIONS=false` |
| Status | DBC migrated to DAMM v2; DLMM pool lifecycle tested: created, seeded, swapped both directions, and one position removed/closed successfully |

## Current verified public accounts

| Role | Public address | Status |
|---|---|---|
| DBC program | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` | Verified on Devnet; executable |
| DBC PoolConfig | `GjUwEndnV2pWExtyVS8cDgTajeYon8g9MExdu6f9Wkxa` | Created and finalized |
| Base mint | `7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9` | Created and verified as SPL mint |
| DBC VirtualPool | `9UfcuHMVfuWPTvakWKSd8hodwLgJt3cF8ADSDVVHH6Ff` | Created, graduated, then migrated; DBC state `isMigrated=1` |
| DAMM v2 config | `2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq` | Official SDK migration config; verified cp-amm owner |
| DAMM v2 pool | `Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw` | Derived with official cp-amm SDK and verified cp-amm owner |
| DLMM pool | `GxtUfNFw9DgCnHNsajKaJY6FmNKFPwGfzvLF5kXSykPV` | Created, finalized, and owned by official lb_clmm program; two-sided single-bin liquidity seeded |
| DLMM quote-side position | `GdepeBJdABXx93Kyh6vu3dQpZDq1FQooEpHNYRnNS4gW` | Finalized at active bin `2882`; actual deposit `1.333 SOL` quote-side |
| DLMM base-side position | `CZN2Sn4paVuKMjQ25ub6NdddKhbwnUwt4GuuYd4TQ8KP` | Removed 100% and closed; account no longer exists after finalized remove transaction |

## Creation and lifecycle signatures

| Action | Signature | Status |
|---|---|---|
| Create DBC PoolConfig | `3BiB4hq5MJuP3RuWxyx1aYzVvxs4rAaEFaQS8H9vo1phfQPADiEj3zGf8buBaLnGqZ1YJFABbgp9BpPQUDD8AV6d` | Finalized |
| Create DBC VirtualPool | `m97ApbtMREErMVG4pztsJcSddpyuBLYA8h5F8AnDqM9HBADCbEbNUcPS3ZKzS8qZWwZQtRrRQ9HjCn7CDNNAaJz` | Finalized |
| DBC buy, 10 SOL input | `wh2hpCwoXmN7joaehXkHLBjWfeHSXPMuPFn5hB7NgnkY7JqqYE4EyoBUp1WMQWNNuFr94BrbXmr9nDLLrUBNkZm` | Finalized |
| DBC buy, 0.1 SOL input | `6g8FdjMZXdK7jJeitSzSQQrSfHnVCePNXTpXHkWPZcWFfexZMspVYsuh2pvUPLDWRSYrBMt2VCMsP8qVKqxXREG` | Finalized |
| DBC buy, 0.0012 SOL input | `5NG3xTJi5X375XQsGwRYP6as43BkGQLZTq4Z9UFnwSWHb1gvSkBHABujWvvLHjJcnuvoieuDeWCq2djW32ibaNNp` | Finalized |
| DBC buy, 0.000012 SOL input | `3mdkZ3L8LidMUrBUAWBvXtJG16wLMoQhJrv9z7M7XEUb1JuamPw8CDUDJymni5DZsmpVqdob4tVkK7gyKTkDv27U` | Finalized |
| DBC partial-fill completion, 0.00002 SOL input | `5nRtMBPjTr9LckDLAu24y7nPdGn4utTSP43buGew6ffwb6Qvk3t3DXJ9yyhPsZCbFwDGzoDLhurRPYTWWkZBby9b` | Finalized; reserve reached `10.000000001 SOL` |
| DBC → DAMM v2 migration | `SN4RpCcE7ZSwU4x8uVjeyWvbixKazbuTAiiBe5hBaRhE9VML4ppgkNWUGosRP5k1ptHKaUxpQW75B1gv8Qh12tq` | Finalized; no transaction error |
| Create DLMM pool | `BnYTJqQVco9A27n3qCZ7CiBKot5Ji3eC1aJ8XfphTNH1vMtuoxbV5boZBHciEmuEaTKdFpQCqgno2EBdPVZ19km` | Finalized; `err=null`; slot `505064630` |
| Seed DLMM quote-side position | `3ZXzxiLgsFkxGgHR8HzN94Ggksx7A3BKaeMSH1xJSWkSLMt3A4JiKGahKJ1KrmUjkJU2qrNekV8oTNjLoWAGiDU4` | Finalized; `err=null`; active bin `2882` |
| Seed DLMM base-side position | `4U1Kd91D6Q7amTLeaKjEdxsMMsV5o4Dv3s2hymQoFnsEmwi5LuS3Bu6SMpDC6F4JYYLREbRPDSoCtVftj2oYZuWw` | Finalized; `err=null`; active bin `2882` |
| Test swap, 0.001 base → SOL | `2Lc911sXYudpzvdEA7RZJptUuQjfeorbh1mkodKGMPAMzAjk7Z4k15Rka7jvYD1MYhnWHwQNmBzF8h9RiiARWRAr` | Finalized; `err=null`; output `1332761` lamports quoted |
| Test swap, 0.001 SOL → base | `dL8CKqZuhbauguQVSPodmFKgFu4jvY6G9ZMA63Q4eqTxcPnB6qC2eDuLjyqvtxN33U1U4sfxAqVqmgPuus4LbuE` | Finalized; `err=null`; output `749` base lamports quoted |
| Remove liquidity, base-side position | `2YcamEv3QHPr2WnZA2FqLC7L2qDzpWbXFH1UA36YzSdLmC5bs7n2aUKX2RpHRrehU3a1yz9gJvZeowhM3AdoMk21` | Finalized; 10000 bps, bin `2882`, claim-and-close, `err=null`; position closed |

## Verification evidence

- DBC status after completion: quote reserve `10000000001` lamports, threshold `10000000000`, `isMigrated=1`, `migrationProgress=3`.
- DAMM v2 config account exists on Devnet, owned by `cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG`.
- DAMM v2 pool PDA was derived with `derivePoolAddress(config, baseMint, NATIVE_MINT)` from the official cp-amm SDK and equals `Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw`.
- DAMM v2 pool account exists on Devnet, is owned by cp-amm, and has data length `1112`.
- DLMM pool account exists on Devnet, is owned by `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`, and has data length `904`.
- DLMM pool creation used bin step `25`, fee `1 bps`, initial price `1.333`, timestamp activation, permissionless mode, and no alpha vault.
- Single-bin seed position exists on Devnet, is owned by `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`, and has data length `8120`.
- Initial seed request used `1` base token and `1.333 SOL`; the first position accepted quote-side only (`totalXAmount=0`, `totalYAmount=1333000000`).
- Separate base-side position now contains `totalXAmount=1000000` (1 base token) and `totalYAmount=0` at active bin `2882`.
- Wallet verification after the base-side position: `1.922114418 SOL` and approximately `799999966.0738` base tokens.
- Swap simulation succeeded for `0.001` base → SOL: estimated output `1332761` lamports (`0.001332761 SOL`), minimum output at 1% slippage `1319433` lamports, fee `1` lamport, price impact `0`.
- First swap transaction finalized with `err=null`; intermediate wallet balances were `1.923442179 SOL` and `799999966.0728` base tokens.
- Reverse swap simulation succeeded for `0.001 SOL` → base: estimated output `749` base lamports (`0.000749` base), minimum output at 1% slippage `741` base lamports, fee `80` lamports, price impact `0`.
- Reverse swap transaction finalized with `err=null`; final wallet balances are `1.922437179 SOL` and `799999966.073549` base tokens.
- Final position amounts: quote-side position `X=499937`, `Y=666089565`; base-side position `X=500303`, `Y=666577573` lamports/units.
- Migration transaction status: `finalized`, `err=null` at slot `505061964`.
- Remove-liquidity simulation succeeded for base-side position `CZN2Sn4paVuKMjQ25ub6NdddKhbwnUwt4GuuYd4TQ8KP`: `10000` bps from bin `2882` to `2882`, `shouldClaimAndClose=true`, one transaction, `err=null`.
- Real remove-liquidity transaction finalized with `err=null`: position account no longer exists, quote-side position remains active, and wallet received `500303` base units plus `708472453` lamports net balance increase (including rent/claim effects minus transaction cost).
- Final wallet balances after close: `2.630909632 SOL` and `799999966.573852` base tokens.
- `VITE_METEORA_ENABLE_TRANSACTIONS=false` remains unchanged after the write session.

## Funding and signer status

- [x] Wallet public key format validated.
- [x] Wallet matches the approved Devnet signer.
- [x] Wallet balance verified after migration.
- [x] DBC config, base mint, and VirtualPool verified on-chain.
- [x] DBC VirtualPool graduated and migrated to DAMM v2.
- [x] DAMM v2 config and pool verified on-chain.
- [x] Signing secrets kept outside AgentBond source and browser build.
- [x] DLMM pool creation approved and executed.
- [x] DLMM quote-side position created and finalized.
- [x] DLMM base-side position created and finalized.
- [x] DLMM base-side position removed 100% and closed; final state verified.
- [x] Swap transaction simulated successfully.
- [x] Base → SOL swap transaction sent and finalized successfully.
- [x] SOL → base reverse swap simulated, sent, and finalized successfully.
- [x] Full remove-liquidity transaction simulated successfully.
- [x] Full remove-liquidity transaction sent, finalized, and position closure verified.

## Local environment values

The local `agentbond-meteora/.env` contains the verified DBC, DAMM v2, and DLMM pool values. The finalized position is recorded above:

```dotenv
VITE_METEORA_DBC_CONFIG=GjUwEndnV2pWExtyVS8cDgTajeYon8g9MExdu6f9Wkxa
VITE_METEORA_BASE_MINT=7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9
VITE_METEORA_DBC_POOL=9UfcuHMVfuWPTvakWKSd8hodwLgJt3cF8ADSDVVHH6Ff
VITE_METEORA_DAMM_V2_CONFIG=2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq
VITE_METEORA_DAMM_V2_POOL=Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw
VITE_METEORA_DLMM_POOL=GxtUfNFw9DgCnHNsajKaJY6FmNKFPwGfzvLF5kXSykPV
VITE_METEORA_ENABLE_TRANSACTIONS=false
```

## Next write sequence

1. Keep the transaction write flag disabled in AgentBond.
2. For mainnet preparation, replace every Devnet address with addresses produced by the official mainnet workflow and re-run all account/authority checks.
3. Use the recorded pool, remaining quote-side position, removal, and swap signatures for read-only UI verification.

## Public beta swap enablement (2026-09-29)

| Item | Value |
|---|---|
| Production URL | `https://agentbond-umber.vercel.app` (Vercel, project `agentbond`) |
| Write flag | `VITE_METEORA_ENABLE_TRANSACTIONS=true` (Vercel production env; local `.env` remains `false`) |
| Public swap target | DAMM v2 pool `Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw` (DBC pool `isMigrated=1`, no longer tradeable) |
| Flow | Client-side CpAmm quote (`getQuote`) + `CpAmm.swap` transaction, wSOL wrap/unwrap and ATA creation handled by the SDK, signed by the user's Phantom, confirmed via Devnet RPC |
| Slippage | User-adjustable, default 100 bps (1%); `minimumAmountOut` always derived from the quote |
| Guards | `assertDevnetEnvironment()` + `assertMeteoraWritesEnabled()` before every write; non-custodial, no signing secrets in source or build |
| Verified on production | HTTP 200; `/api/health` 200; bundle contains DAMM v2 pool + swap UI with disabled-writes path compiled out; live quote preview working (0.01 SOL → ≈195,807.7 AGNT @ 1% slippage, pool is thin so impact is high) |
| First public swap | Verified 2026-09-29. Operator swap of 0.1 SOL → 1,940,940.663451 AGNT on the DAMM v2 pool via Phantom; on-chain `err: null`, fee 0.00008 SOL, slot `505454880` (blockTime 2026-09-29T07:40:53Z). Note: devnet airdrop is IP-rate-limited (429) and no operator keys are stored by design, so further swaps must be signed in a browser with Phantom. |

```text
first_public_swap_signature=3HGMmYGaRaJA7v7swD2HWmCoKdXKcRjAE4swRAXkmZFQ3x7CfhUgWPna9MQF3U7tNgedEzK9ogLFzGQUkH2kzdAu
first_public_swap_input=0.1 SOL
first_public_swap_output=1940940.663451 AGNT (6 decimals)
first_public_swap_slot=505454880
```

## Full-lifecycle beta (Signal to Service, 2026-09-29)

Deployed `agentbond-btokpd41a…` (production alias `https://agentbond-umber.vercel.app`). `pnpm check` clean, 47/47 tests green, all pages 200. New public capabilities:

| Capability | Entry point | Notes |
|---|---|---|
| Multi-pool registry | `/pools`, pool selector on home | Curated canonical AGNT entry (`verified`, badge `CANONICAL`) + user-launched pools stored in `localStorage` (always `unverified`) |
| Permissionless launch | `/launch` | 2 transactions: Tx1 creates the SPL mint (keypair generated in-browser, never persisted), Tx2 `createPoolWithFirstBuy` with `minimumAmountOut` from a live DBC quote. DBC config `GjUwEndn…` verified permissionless (`poolCreatorAuthority: null`) |
| Graduation (F2) | Lifecycle panel on home | `fetchDbcCurveProgress` (0–100%) + permissionless `migrateToDammV2`; AGNT shows `MIGRATED TO DAMM V2` (its curve completed) |
| DLMM venue (F3) | Venue tabs `DAMM v2 / DLMM` in swap console | Quote verified live on production (pool `GxtUfNFw…`); see the re-seed record below — both venues are now priced off the same market |
| LP management (F4) | Liquidity panel (DAMM v2 pools) | `createPositionAndAddLiquidity` / `removeLiquidity` via cp-amm; positions owned by the user's wallet NFT; withdraw % slider with quote preview |

Non-custodial and guard conventions unchanged: every write path calls `assertDevnetEnvironment()` + `assertMeteoraWritesEnabled()`; slippage-protected minimums always derived from quotes; mainnet remains permanently blocked.

Known limitations: DLMM venue is swap-only for the canonical AGNT pool (graduated user pools trade on DAMM v2); registry is per-browser (`localStorage`) until on-chain discovery replaces it.

## Public-credibility pass: LP DLMM, on-chain discovery, creator fees, token metadata (2026-09-30)

Additions on top of the F0–F4 scope, all live on production:

| Feature | Where | Notes |
|---|---|---|
| DLMM liquidity management | Liquidity panel on home (DLMM pools) | `initializePositionAndAddLiquidityByStrategy` — SOL deposited as a one-sided bid ladder just below the active bin; per-position 50%/100% removal (`removeLiquidity`, 100% also closes). Positions fetched via `getPositionsByUserAndLbPair` |
| On-chain registry discovery | `/pools` "Refresh on-chain" + silent scan on app mount | `getPoolsByConfig` on the open launch configs; metadata decoded; DAMM v2 address derived for graduated pools; merged into the registry (canonical > user > discovered, deduped) so pools launched in one browser appear everywhere |
| Creator fee claims | Lifecycle panel (pool creator only) + DAMM v2 panel per position | Pool-level `claimCreatorTradingFee` on DBC virtual pools (`U64_MAX` claims); position-level `claimPositionFee` on DAMM v2. AGNT's DBC pool still held ≈0.0405 SOL unclaimed when verified live |
| Token metadata (Metaplex) | `/launch` | Tx1 now also creates `createMetadataAccountV3` (creator-verified, update authority = creator) whenever a URI is supplied — wallets/explorers show name, symbol, logo instead of "Unknown Token". "Host metadata" button uploads `{name, symbol, image, description}` JSON to **Irys devnet** paid from the launcher's own wallet (non-custodial, no API keys; SDK lazy-loaded in a separate chunk, `@irys/query` stubbed for the browser build) |

## Agent service: pay-per-task with on-chain buyback (2026-09-30)

The "Service" half of Signal to Service is now a working loop, verified end-to-end on Devnet:

1. **Task** — a user sends SOL to the agent's service wallet with the prompt as an SPL-memo instruction (`client/src/lib/meteora.ts: buildAgentTaskPaymentTx`). No backend: the payment IS the task submission.
2. **Reply** — `scripts/agent-service.cjs` (operator-run daemon, agent keypair kept outside the repo) polls the wallet, reads the memo, answers via memo transaction (the memo program burns ~60k CUs per instruction — the reply tx sets a 300k CU limit).
3. **Buyback** — the agent immediately swaps 50% of each payment (configurable `AGENT_BUYBACK_BPS`) into its own token on the DAMM v2 pool, minimum-out protected, signed by the agent keypair. This is the token's first real sink: value ≈ claim on agent revenue.
4. **Feed** — the pool page shows an `AGENT SERVICE` panel (task composer + on-chain feed) that classifies recent agent-wallet activity into TASK / REPLY / BUYBACK.

Agent wallet (canonical AGNT, in `canonicalPools.ts`): `sgscgDAj9RUbxpi1db3dfisbk9PFE3Yh4UKr5j3TpCA`. Verified production loop: task `3SZJAjzm…` → reply `3FLBKVuPfF…` → buyback `61FJ1MNP…` (1,000,000 lamports → 19,469.6 AGNT raw). Note: in `getParsedTransaction` (jsonParsed) mode the memo instruction arrives as `parsed: "<text>"` (a plain string), not `{type, info}` — both script and client handle that shape. Optional LLM upgrade via `AGENT_LLM_ENDPOINT` / `AGENT_LLM_API_KEY` / `AGENT_LLM_MODEL` env vars; without them the agent replies with a deterministic fallback so the loop always works.

Run the agent: `AGENT_ENV_PATH=<env outside repo> node scripts/agent-service.cjs`.

### Agent brain: Groq LLM + market awareness + per-pool support (2026-09-30)

- **LLM**: Groq free tier (`https://api.groq.com/openai/v1`, `openai/gpt-oss-20b`) via the OpenAI-compatible endpoint — env-only, no code change. Rate-limit protections: prompt capped at 500 chars, `max_tokens` 1000 + `reasoning_effort: low` (gpt-oss reasoning tokens count against the cap — with 200 the answer was cut mid-sentence), 5s min interval between calls, one 8s retry on 429, deterministic fallback reply so a task is never left unanswered. Buyback always runs regardless of LLM health.
- **Market awareness**: before every reply the agent reads its own market on-chain (vault balances → spot price, a real 0.01 SOL swap quote, its own token treasury) and injects the snapshot into the system prompt. Verified: a task asking price/liquidity/treasury was answered in the task's language with numbers matching the snapshot exactly.
- **Per-pool agents**: the script is parameterized — `AGENT_MARKET_POOL`, `AGENT_TOKEN_MINT`, `AGENT_TOKEN_SYMBOL` (read from the same env file). Pool sides and decimals are auto-detected from `poolState` (no more hardcoded 9/6), so any DAMM v2 pool containing SOL + the token can run its own agent. Invalid pool/mint pairs fail fast at startup.
- **`--once` mode**: one poll-and-process pass, then exit — for cron/CI hosting.
- **Deploy kit**: `agent-deploy/` (package.json + README + `.env.example`) for Railway (~10 min setup; trial $5 then ~$1-3/mo; the agent only makes outbound calls). Smoke-tested locally with its own `npm install` + `--once` run. Oracle Cloud Always Free migration path documented in the same README (same folder + systemd unit).

## DLMM pool re-seeded at market price (2026-09-30, operator)

The DLMM pool `GxtUfNFw…` had been left at a stale price (~1.33 SOL/AGNT) with only dust liquidity, making the app's DLMM venue quote look broken next to DAMM v2. Re-seeded on-chain via `scripts/walk-dlmm-price.cjs` (operator keypair loaded from outside the repo, never logged):

1. Removed the stale operator position (bin 2882 region).
2. Seeded small X-side "anchor" positions every 380 bins up to the market range — a pool's `activeId` only moves via swaps and an on-chain swap can only cross a limited number of empty bins per transaction (compute budget), so the price is *walked* upward by consuming the anchors one chunk at a time.
3. Walked `activeId` from −6713 to −3958 (~5.11e-8 SOL/AGNT, within 0.5% of the DAMM v2 spot 5.13e-8), spending ~0.07 SOL that became part of the pool's Y-side depth.
4. Seeded the main two-sided position [−3966..−3897] (9.65M AGNT + 0.37 SOL across main + top-up) and closed all spent anchor positions.

Post-condition verified live on production: the DLMM venue quote for 0.01 SOL returns **195,527 AGNT** (DAMM v2 returns ~194,935 — the two venues are now consistent; price impact ~16% because the pool is deliberately small for Devnet). `activeId` −3958. The walk script is idempotent per phase (`--phase N`) and can be reused after future graduation events.
