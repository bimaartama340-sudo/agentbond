# Meteora Agent Skill — Adoption Notes

AgentBond follows [Meteora's official Agent Skill](https://github.com/MeteoraAg/meteora-invent/tree/main/skills/meteora) and the [Meteora llms.txt / agent resources](https://docs.meteora.ag/agents/llms-txt).

## Where the skill shows up in this codebase

| Skill rule | AgentBond implementation |
|---|---|
| Devnet first; mainnet needs explicit intent | `assertDevnetEnvironment()` + `assertMeteoraWritesEnabled()` guard every write path; mainnet is blocked by design in this release |
| Simulate / quote every state-changing flow | Launch: `getSwapQuote`-derived `minOut` for the first buy. Swaps: `minimumAmountOut` from live quotes (DAMM v2 `getQuote`, DLMM `swapQuote`). Agent buyback: `minSwapOutAmount` with 200 bps slippage |
| Amounts in base units, explicit units | All SDK calls use `BN` base units; human-unit conversion happens at the UI boundary (`fromRawAmount`/`toRawAmount`) |
| Refresh pool state before quoting | Agent service refetches `poolState` at startup and re-reads the market snapshot before each task reply |
| Multi-transaction results need every keypair to sign | `signAndSendBundle` detects required signers per transaction and partial-signs extra keypairs (e.g. DLMM position keypairs) |
| Private keys stay out of chat/repo | Operator + agent keypairs live in an env file outside the repository; only public addresses appear in code and docs |
| Verify a transaction and re-read state before reporting success | Every write confirms via `connection.confirmTransaction`, and the UI reads post-state from the chain (positions, fees, activity feed) |

## Runtime knowledge

The production agent (scripts/agent-service.cjs) carries a compact protocol
knowledge block (DBC / DAMM v2 / DLMM / the Signal-to-Service model) distilled
from Meteora's official documentation and agent resources, alongside a live
on-chain market snapshot of its own pool.

## SDK versions in use

| Product | Package | Notes |
|---|---|---|
| DBC | `@meteora-ag/dynamic-bonding-curve-sdk` | Launch, curve reads, graduation, migration preview |
| DAMM v2 | `@meteora-ag/cp-amm-sdk` | Swaps, liquidity, positions, fee claims, agent buyback |
| DLMM | `@meteora-ag/dlmm` | Venue swaps, bid-ladder liquidity, positions |
