# AgentBond Deployment Readiness

## Current decision (updated 2026-09-29, post swap enablement)

AgentBond is **live as a public Devnet testnet app with real wallet-approved swaps**. The production deployment at `https://agentbond-umber.vercel.app` runs with `VITE_METEORA_ENABLE_TRANSACTIONS=true`; users can swap SOL ⇄ AGNT on the DAMM v2 pool through Phantom. All on-chain account addresses are created, verified on Devnet, and recorded in `DEVNET_DEPLOYMENT_RECORD.md`.

## Live transaction flow

- Target pool: DAMM v2 `Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw` (the DBC pool migrated; `isMigrated=1`).
- UI: direction toggle (SOL → AGNT / AGNT → SOL), adjustable slippage (default 1%, range 0.1–10%), live quote preview (estimated output, minimum out, price impact), Phantom signing, Explorer link on confirmation.
- Guards: `assertDevnetEnvironment()` (mainnet blocked) and `assertMeteoraWritesEnabled()` (runtime flag) run before every write.
- Non-custodial: no private keys in source or build; every transaction requires explicit Phantom approval.

## Verified now

| Check | Result |
|---|---|
| `pnpm validate:devnet --strict` | Passed; all 7 accounts valid via RPC |
| `pnpm test` | 39/39 passed (tests stub `import.meta.env`; independent of local `.env`) |
| `pnpm check` | Passed |
| `pnpm build` | Passed |
| Public URL | `https://agentbond-umber.vercel.app` HTTP 200 |
| `/api/health` | 200 `{"ok":true,"service":"agentbond-api"}` |
| Production bundle | Contains DAMM v2 pool + swap UI; disabled-writes throw path compiled out (flag `true`) |
| Quote preview on production | Live: 0.01 SOL → ≈195,807.7 AGNT @ 1% slippage |
| Transaction safety flag | `VITE_METEORA_ENABLE_TRANSACTIONS=true` (Vercel production env) |

## Verified on-chain accounts (see DEVNET_DEPLOYMENT_RECORD.md)

| Role | Public address |
|---|---|
| DBC program | `dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN` |
| DBC PoolConfig | `GjUwEndnV2pWExtyVS8cDgTajeYon8g9MExdu6f9Wkxa` |
| Base mint | `7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9` |
| DBC VirtualPool | `9UfcuHMVfuWPTvakWKSd8hodwLgJt3cF8ADSDVVHH6Ff` |
| DAMM v2 config | `2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq` |
| DAMM v2 pool | `Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw` |
| DLMM pool | `GxtUfNFw9DgCnHNsajKaJY6FmNKFPwGfzvLF5kXSykPV` |

All creation, migration, swap, and remove-liquidity signatures are recorded in `DEVNET_DEPLOYMENT_RECORD.md`.

## Known non-blocking issues

1. ~~Test env drift~~ Resolved: tests now stub `import.meta.env` and pass regardless of the developer `.env`.
2. `OAUTH_SERVER_URL` is not configured; OAuth sign-in will not work until it is set in the hosting environment. (The earlier `/api/trpc` 500 `FUNCTION_INVOCATION_FAILED` crash is fixed — serverless ESM now uses explicit `.js` import extensions and no `@shared` alias; `auth.me` returns 200 `{"json":null}` in production.)
3. `VITE_ANALYTICS_ENDPOINT` / `VITE_ANALYTICS_WEBSITE_ID` placeholders are unset; the server logs harmless `Malformed URI` noise for `/…/umami` requests.
4. The DAMM v2 pool is thin (single-bin seeded during the lifecycle test), so price impact for even 0.01 SOL is large; the quote preview surfaces this honestly. Seed more liquidity before encouraging larger swaps.

## Remaining gates

1. Never include a private key, seed phrase, or wallet JSON in the frontend or hosting environment; only public `VITE_*` values are deployed.
2. ~~First real swap through Phantom on the public URL~~ Done: signature `3HGMmYGaRaJA7v7swD2HWmCoKdXKcRjAE4swRAXkmZFQ3x7CfhUgWPna9MQF3U7tNgedEzK9ogLFzGQUkH2kzdAu` (0.1 SOL → 1,940,940.66 AGNT, `err: null`, slot 505454880) — recorded in `DEVNET_DEPLOYMENT_RECORD.md`.
3. Follow-up manual tests: reverse swap (AGNT → SOL), slippage-rejection path, mobile Phantom browser.
4. DLMM trading and new DBC pool creation are intentionally not exposed in the public UI.

## Deployment evidence

```text
public_url=https://agentbond-umber.vercel.app
legacy_host=https://agentbond-2hasutcm.manus.space
transactions_enabled=true
dbc_config=GjUwEndnV2pWExtyVS8cDgTajeYon8g9MExdu6f9Wkxa
base_mint=7AZLo4es23WHtseYrhH2ScPJ1LtRb8Qk5pPGCqyRiji9
dbc_pool=9UfcuHMVfuWPTvakWKSd8hodwLgJt3cF8ADSDVVHH6Ff
damm_v2_config=2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq
damm_v2_pool=Aw25voQXKLu5pswW5srxnfxyaLGQjxZRRFZmz7QEkREw
dlmm_pool=GxtUfNFw9DgCnHNsajKaJY6FmNKFPwGfzvLF5kXSykPV
creation_signature=3BiB4hq5MJuP3RuWxyx1aYzVvxs4rAaEFaQS8H9vo1phfQPADiEj3zGf8buBaLnGqZ1YJFABbgp9BpPQUDD8AV6d
migration_signature=SN4RpCcE7ZSwU4x8uVjeyWvbixKazbuTAiiBe5hBaRhE9VML4ppgkNWUGosRP5k1ptHKaUxpQW75B1gv8Qh12tq
dlmm_signature=BnYTJqQVco9A27n3qCZ7CiBKot5Ji3eC1aJ8XfphTNH1vMtuoxbV5boZBHciEmuEaTKdFpQCqgno2EBdPVZ19km
```
