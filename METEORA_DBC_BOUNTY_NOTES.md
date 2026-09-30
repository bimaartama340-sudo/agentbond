# Meteora DBC  Project GuidanceBounty 

Source: [Superteam  Best use of Meteora's Dynamic Bonding Curve (DBC)](https://superteam.fun/earn/listing/meteora-dbc)Earn 

## Opportunity

Meteora is sponsoring the Crypto World's Fair track for builders creating an innovative use of its Dynamic Bonding Curve. The listing shows a total prize pool of **20,000 USDC**: 10,000 USDC for first place, 5,000 USDC for second, 3,000 USDC for third, 1,500 USDC for fourth, and 500 USDC for fifth. The listing is global, blockchain-focused, and the winner announcement is scheduled for **October 31, 2026**. The structured listing indicates submissions close on **October 13, 2026 at 06:59 UTC**.

## Product thesis

Meteora describes DBC as a configurable token-launch primitive. Builders can control the curve shape, fee schedule, quote token, graduation threshold, and migration into Meteora DAMM v2. The strongest projects should use DBC as a central product primitive rather than adding it as a superficial swap widget.

## Use-case directions encouraged by the sponsor

The listing explicitly encourages launch mechanics for equity or stock-paired launches, novel curve or fee configurations such as flat, exponential, or long curves, creative end-to-end flows using DBC, DAMM v2, and DLMM, data streams or developer tooling for trading terminals and launchpads, and a marketplace of reusable DBC configuration presets.

The listing calls out experimentation around RWAs, tokenized stocks, AI, memes, stock pairs, ICM pairs, RWA pairs, and custom pair setups. It also gives examples such as conviction pools using DLMM and compounding-liquidity DAMM v2 pools.

## Judging criteria

1. **Depth of Meteora integration:** how central and meaningful the Meteora stack is to the product.
2. **Technical execution:** code quality, architecture, robustness, and implementation decisions.
3. **Originality and taste:** whether the project explores a new DBC use case with durability beyond the current meme-stock trend.
4. **Impact potential:** whether the idea can scale and create a new class of assets.
5. **Traction and volume:** preference for projects live on mainnet with active users.

## Submission and review notes

The project should provide a polished, demonstrable product and clearly explain the DBC-to-DAMM-v2 lifecycle. If the project is closed source, the listing asks teams to add GitHub user `dannxbt` with read permissions for judging. Meteora links the DBC, DAMM v2, Invent actions, Meteora Invent, launchpad scaffold, both TypeScript SDKs, agent skill, MCP docs, Discord developer support, and Telegram developer support from the listing.

## AgentBond implications

The The The The The d implementation should be treated as a technical prototype, not yet as a competitive bounty submission. To align with this brief, future work should prioritize one differentiated use case, for example an AI-agent launchpad with configurable DBC presets, an RWA/stock-pair launch workflow, or agent-controlled liquidity routing across DBC, DAMM v2, and DLMM. The app should expose a credible end-to-end lifecycle, use real supported Devnet or Mainnet environments, include reproducible configuration, and collect evidence of user activity or transaction volume.

Do not claim a DBC config or base mint is valid without verifying it on-chain. Meteora's official SDK documentation states that `createPool` and `createPoolWithFirstBuy` use an existing config and base mint, while config creation is a separate partner workflow. Credentials, private keys, and seed phrases must never be placed in the repository or deployment environment.

## Submission  judging checklistgate 

Every future feature should strengthen at least one judging dimension and ideally several at once:

- **Depth of Meteora integration:** DBC must be the core economic primitive, with a meaningful DBC-to-DAMM v2-to-DLMM lifecycle rather than a decorative integration.
- **Technical execution:** keep SDK adapters isolated, use explicit network/config validation, separate read-only inspection from transaction builders, handle RPC and wallet failures, and keep the app reproducible locally.
- **Originality and taste:** AgentBond needs a durable asset-creation use case beyond a generic meme launch, such as agent-created RWA/AI assets, configurable launch policies, or a novel liquidity lifecycle.
- **Impact potential:** design for repeatable launches, reusable DBC presets, multiple asset classes, and a path to scale beyond one demonstration pool.
- **Traction/volume:** eventually deploy on mainnet, onboard real users, and collect credible usage and transaction-volume evidence; local or Devnet dry-runs alone are not sufficient for a top submission.

Submission preparation must also include a working public demo, a concise architecture and product narrative, reproducible setup instructions, and access for judging. If the repository is private, grant GitHub user `dannxbt` read permission before submission. Never expose private keys, seed phrases, or wallet secrets.
