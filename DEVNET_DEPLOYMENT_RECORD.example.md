# AgentBond Devnet Deployment Record

> This file is a blank evidence template. Do not enter private keys, seed phrases, wallet exports, or signing secrets. Record only public addresses, transaction signatures, RPC observations, and Explorer URLs.

## Run metadata

| Field | Value |
|---|---|
| Network | `devnet` |
| RPC host | |
| Deployment date (UTC) | |
| Operator wallet public key | |
| Validator command | `pnpm validate:devnet --strict` |

## Account map

| Role | Public address | RPC account exists | Owner/program verified | Explorer URL |
|---|---|---:|---:|---|
| DBC program | | | | |
| DBC PoolConfig | | | | |
| Base mint | | | | |
| DBC VirtualPool | | | | |
| DAMM v2 config | | | | |
| DAMM v2 pool | | | | |
| DLMM pool | | | | |
| DLMM position | | | | |

## DBC creation and first-buy evidence

| Field | Value |
|---|---|
| Creation signature | |
| First-buy signature | |
| VirtualPool address | |
| Base mint | |
| Quote mint | |
| Graduation condition observed | |
| Explorer URL(s) | |

## DBC to DAMM v2 migration evidence

| Field | Value |
|---|---|
| Migration preview instruction count | |
| Migration signature | |
| Resulting DAMM v2 pool | |
| First position NFT | |
| Second position NFT | |
| Confirmation status | |
| Explorer URL(s) | |

## DLMM creation and seed evidence

| Field | Value |
|---|---|
| Base mint | |
| Quote mint | |
| Bin step | |
| Active bin ID | |
| Strategy | `spot` / `curve` / `bid-ask` |
| Pool creation signature | |
| Seed signature | |
| Position address | |
| Confirmation status | |
| Explorer URL(s) | |

## Smoke-test checklist

- [ ] Fresh browser profile used.
- [ ] Devnet wallet public key matched this record.
- [ ] DBC account read succeeded.
- [ ] DAMM v2 pool read succeeded.
- [ ] DLMM pool read succeeded.
- [ ] Small-amount migration transaction approved and confirmed.
- [ ] Small-amount DLMM liquidity transaction approved and confirmed.
- [ ] Signatures and position addresses recorded above.
- [ ] `VITE_METEORA_ENABLE_TRANSACTIONS=true` was enabled only for the reviewed smoke-test session.
- [ ] Write flag returned to `false` after testing.
