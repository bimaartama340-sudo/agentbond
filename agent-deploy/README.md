# AgentBond Agent Service — Railway Deploy

Run the pay-per-task agent (on-chain tasks -> LLM reply -> revenue buyback) 24/7 on Railway. Setup ~10 minutes.

## 0. What runs where

| Piece | Location |
|---|---|
| `agent-service.cjs` | copied from `scripts/` in this repo (step 2) |
| Keypair + LLM key | Railway environment variables (never in git) |
| Tasks & replies | on-chain memos to/from the service wallet |
| Buyback | real swaps on the token's DAMM v2 pool |

## 1. Install Railway CLI

```bash
npm i -g @railway/cli
railway login
```

## 2. Prepare this folder

```bash
cd agent-deploy
cp ../scripts/agent-service.cjs .
npm install          # optional local smoke test
node agent-service.cjs --once --help 2>/dev/null || true
```

`--once` mode: process pending tasks once and exit (used by CI/cron setups; Railway runs the normal daemon).

## 3. Create the project and deploy

```bash
railway init -n agentbond-agent
railway up
```

No public domain is needed — the agent only makes outbound RPC calls. Railway may warn about no exposed port; ignore it. If the build asks for a start command, use `npm start`.

## 4. Set environment variables

Dashboard → your service → **Variables** (or `railway variables --set`). Copy every key from `.env.example` with real values:

- `AGENT_PRIVATE_KEY` — generate a **fresh** keypair for the hosted agent:
  ```bash
  node -e "console.log(JSON.stringify(Array.from(require('@solana/web3.js').Keypair.generate().secretKey)))"
  ```
  Fund it with ~0.5-1 devnet SOL (rents + fees; buybacks only spend the payments it receives).
- `AGENT_MARKET_POOL`, `AGENT_TOKEN_MINT`, `AGENT_TOKEN_SYMBOL` — the pool the agent earns on. Defaults are the canonical AGNT market; for a community pool set the pool created by its launch.
- `AGENT_LLM_ENDPOINT` / `AGENT_LLM_API_KEY` / `AGENT_LLM_MODEL` — Groq free tier: `https://api.groq.com/openai/v1`, model `openai/gpt-oss-20b`.

After setting variables, Railway redeploys automatically. **Then update the pool's `agentWallet`** (client/src/data/canonicalPools.ts for canonical pools, or the launch registry for community pools) so the UI panel points at the hosted wallet.

## 5. Verify

```bash
railway logs
```

Expect:

```
[agent] wallet <new wallet>
[agent] market <pool> · buyback 50% of each payment
[agent] llm remote
[agent] snapshot: Live on-chain market snapshot ... pool liquidity X SOL / Y tokens ...
[agent] watching from slot N · polling every 15s
```

Then send a task from the app (AGENT SERVICE panel) and watch `task → reply → buyback` appear in the logs and in the on-chain feed.

## Notes

- **Pricing**: Railway trial = $5 one-time credit; afterwards Hobby $5/mo, of which our agent uses ~$1-3/mo.
- **Migrating to Oracle Cloud Always Free later**: same folder on the VM + systemd unit
  (`ExecStart=/usr/bin/node agent-service.cjs`, `Environment=AGENT_ENV_PATH=/home/ubuntu/agentbond/.env`,
  `Restart=always`) — the script itself is unchanged.
- **Security**: the hosted keypair is a hot wallet holding devnet dust by design. Keep the main operator keypair on your machine; the agent never needs it.
