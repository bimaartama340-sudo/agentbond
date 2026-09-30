# AgentBond Meteora DLMM Mainnet Migration

This runbook creates a **new mainnet DLMM deployment** based on the parameters proven in `DEVNET_DEPLOYMENT_RECORD.md`. Solana accounts are network-specific: the Devnet mint, pool, positions, and signatures must not be reused on mainnet.

## What the script does

`scripts/migrate-dlmm-mainnet.ts` uses the official `@meteora-ag/dlmm` SDK and supports:

1. Mainnet RPC, signer, mint, balance, and account preflight checks.
2. Customizable permissionless DLMM pool creation.
3. Quote-side and base-side single-bin position seeding.
4. Optional two-way swap tests with `--test-swaps`.
5. Optional 100% base-side remove-and-close with `--close-base-position`.
6. Finalized signature output for every broadcast transaction.

The Devnet-proven parameters carried forward are:

| Parameter | Value |
|---|---:|
| Bin step | `25` |
| Fee | `1 bps` |
| Activation type | Timestamp |
| Alpha vault | Disabled |
| Default quote seed | `1.333 SOL` |
| Default base seed | `1` token, assuming 6 decimals |
| Devnet active bin reference | `2882` — **must be revalidated for the mainnet mint** |

## Required environment

Do not put a private key in `.env`, source code, or the browser build. Use a local keypair file outside the repository.

```bash
export MAINNET_RPC="https://api.mainnet-beta.solana.com"
export MAINNET_BASE_MINT="<new-mainnet-base-mint-public-key>"
export MAINNET_PAYER_KEYPAIR="$HOME/.config/solana/mainnet-agentbond.json"
export MAINNET_ACTIVE_ID="<mainnet-active-bin-id>"
export MAINNET_ACTIVATION_TIMESTAMP="<unix-seconds>"
```

Optional overrides:

```bash
export MAINNET_BASE_AMOUNT_RAW=1000000
export MAINNET_QUOTE_AMOUNT_LAMPORTS=1333000000
export MAINNET_SWAP_BASE_AMOUNT_RAW=1000
export MAINNET_SWAP_QUOTE_AMOUNT_LAMPORTS=1000000
```

Before execution, confirm that the payer has enough mainnet SOL for pool rent, two positions, token accounts, and fees, and owns at least `MAINNET_BASE_AMOUNT_RAW` units of `MAINNET_BASE_MINT`.

## Safe dry-run / preflight

Dry-run is the default and does not broadcast transactions:

```bash
pnpm migrate:dlmm:mainnet
```

The dry-run rejects Devnet/testnet/local RPCs and rejects the Devnet base mint from the deployment record. It prints the derived mainnet pool address and the intended parameters.

## Mainnet execution

Only run this after independently checking the exact mint, active bin, activation timestamp, signer, and funding amount:

```bash
pnpm migrate:dlmm:mainnet -- --execute
```

Add the optional lifecycle tests only when their exact amounts are acceptable:

```bash
pnpm migrate:dlmm:mainnet -- --execute --test-swaps
```

To remove 100% of the newly created base-side position and close it after the deployment/tests:

```bash
pnpm migrate:dlmm:mainnet -- --execute --test-swaps --close-base-position
```

`--close-base-position` is intentionally impossible without `--execute`.

## Important mainnet differences

- The script does not migrate a Devnet account. It creates a fresh mainnet pool.
- The mainnet base mint must be created and funded separately; the Devnet base mint is rejected.
- `MAINNET_ACTIVE_ID` is required instead of blindly copying the Devnet `2882` value.
- The script does not modify AgentBond's `VITE_METEORA_ENABLE_TRANSACTIONS` flag.
- Store the resulting mainnet public keys and signatures in a separate `MAINNET_DEPLOYMENT_RECORD.md`; never overwrite the public Devnet evidence record.
- Test with minimal amounts first, then perform any larger liquidity operation as a separately reviewed command.
