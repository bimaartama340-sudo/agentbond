# AgentBond Public Deployment Evidence

- Provider: Vercel
- Project: `agentbond`
- Latest deployment status: Ready
- Latest deployment URL: https://agentbond-8fnev3j5c-idcuq-santosos-projects.vercel.app
- Verified shareable alias: https://agentbond-umber.vercel.app
- Deployment inspector: https://vercel.com/idcuq-santosos-projects/agentbond/2iiwfEzUwQcnU7Lea31UqQCpzySR
- Frontend status: publicly reachable; AgentBond title returns HTTP 200
- Health status: `/api/health` returns HTTP 200 with `{"ok":true,"service":"agentbond-api"}`
- tRPC status: currently failing with Vercel `FUNCTION_INVOCATION_FAILED`; backend is not marked healthy
- Mode: public Devnet read-only demo
- Write transactions: disabled (`VITE_METEORA_ENABLE_TRANSACTIONS=false`)
- Local pre-deploy checks: 32 tests passed, TypeScript check passed, production build passed
- On-chain lifecycle evidence: pending real DBC PoolConfig, base mint, VirtualPool, DAMM v2, and DLMM addresses/signatures

## Local save checkpoint 2026-09-28

The explicit Vercel tRPC handler change is saved locally in `api/trpc/[...path].ts`. Redeployment was paused because the desktop terminal sidecar disconnected. No transaction or deployment action was performed after this checkpoint.
