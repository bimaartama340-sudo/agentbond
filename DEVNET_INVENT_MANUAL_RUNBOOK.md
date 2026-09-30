#  Manual Meteora Invent Devnet RunbookAgentBond 

This runbook follows the official [Meteora Invent DBC launch workflow](https://docs.meteora.ag/invent/launch-pools/dbc-token-launch-pool). It creates public Devnet accounts only. Never commit a private key, seed phrase, wallet JSON, or `PRIVATE_KEY` value to this repository.

## 1. Prepare Invent outside AgentBond

Run these commands in a separate directory on the local computer:

```bash
cd ~/Documents
 git clone https://github.com/MeteoraAg/meteora-invent.git
cd meteora-invent
pnpm install
cp studio/.env.example studio/.env
```

Configure `studio/.env` using a signer-safe local method. The signer must correspond to the approved Devnet wallet:

```text
D92g759nWqyjjjwJxJ32KswzEupBHZKYRdJ8RMuv12Cn
```

Do not put the key in AgentBond, `client/.env`, `VITE_*`, Git, or a public build. Before any write, verify the signer address in Phantom or with the local wallet CLI used by your Invent setup. It must exactly match the deployment record address. Do not proceed if the wallet UI or CLI shows a different address.

## 2. Configure the DBC launch

Copy the example configuration and edit only the public launch parameters:

```bash
cp studio/config/dbc_config.jsonc studio/config/agentbond_dbc_config.jsonc
```

Use these approved product choices:

| Parameter | Value |
|---|---|
| Network | Devnet |
| Name | `AgentBond` |
| Symbol | `AGNT` |
| Quote | SOL |
| Migration | DAMM v2 |
| Initial buy | `0.1 SOL` |
| Token type | SPL unless the workflow explicitly requires Token-2022 |
| Vanity base mint | Leave unset unless a separately generated public mint keypair is required |

Review the config comments for curve, fee, migration threshold, creator/partner LP percentages, token decimals, and token authority. Do not use guessed PoolConfig or DAMM config addresses.

## 3. Create PoolConfig, base mint, and VirtualPool

When no existing DBC config is available, use the official combined action:

```bash
pnpm studio dbc-create-pool
```

If a verified DBC PoolConfig already exists, use:

```bash
pnpm studio dbc-create-pool --config <VERIFIED_DBC_CONFIG_ADDRESS>
```

The command should print the config address, base mint, pool address, and creation signature. Stop immediately if the network is not Devnet or the signer address differs from the deployment record.

## 4. Verify every public result

From the AgentBond project directory:

```bash
cd ~/Documents/AgentBond/agentbond-meteora
pnpm validate:devnet --strict
```

Also verify each result using Solana Explorer on Devnet or the Invent output. Record only public data:

```text
network=devnet
wallet=D92g759nWqyjjjwJxJ32KswzEupBHZKYRdJ8RMuv12Cn
dbc_config=<PUBLIC_POOL_CONFIG>
base_mint=<PUBLIC_BASE_MINT>
dbc_pool=<PUBLIC_VIRTUAL_POOL>
creation_signature=<PUBLIC_SIGNATURE>
```

Fill these values into `DEVNET_DEPLOYMENT_RECORD.md` and `.env` only after the account owner/program and signature are confirmed:

```dotenv
VITE_METEORA_DBC_CONFIG=<PUBLIC_POOL_CONFIG>
VITE_METEORA_BASE_MINT=<PUBLIC_BASE_MINT>
VITE_METEORA_DBC_POOL=<PUBLIC_VIRTUAL_POOL>
```

Keep this safety setting unchanged until the transaction review and smoke-test plan is ready:

```dotenv
VITE_METEORA_ENABLE_TRANSACTIONS=false
```

## 5. Next lifecycle gates

Do not run DAMM v2 migration until the VirtualPool reaches the configured graduation condition. Then build the AgentBond migration preview, compare the payer/pool/config/instruction count with the record, and obtain an explicit wallet approval. DLMM creation and seed liquidity remain separate Invent actions after the DAMM v2 result is verified.

## Sources

- [Meteora DBC Token Launch Pool](https://docs.meteora.ag/invent/launch-pools/dbc-token-launch-pool)
- [Meteora Invent repository](https://github.com/MeteoraAg/meteora-invent)
- [AgentBond deployment record](./DEVNET_DEPLOYMENT_RECORD.md)
