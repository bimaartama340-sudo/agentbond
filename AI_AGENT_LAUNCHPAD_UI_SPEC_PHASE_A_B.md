# AgentBond AI-Agent Launchpad
## UI Specification — Phase A and Phase B

**Product direction:** AgentBond is an AI-agent launchpad where every launched asset represents access to a useful agent service. Meteora DBC, DAMM v2, and DLMM form the economic lifecycle underneath the product.

**Scope:** This document defines the first two product phases. They prepare and review a launch plan; they must never submit blockchain transactions by themselves.

---

# Phase A — Agent Setup

## Objective

Collect the identity, utility, and service definition of an AI agent before any token-economic decision.

### Output model

```ts
type AgentLaunchDraft = {
  agentName: string;
  shortDescription: string;
  category: "research" | "automation" | "developer" | "creative" | "data" | "other";
  utilityUnit: string;
  utilityDescription: string;
  consumptionModel: "per-task" | "per-minute" | "per-request" | "subscription";
  deliveryMode: "api" | "dashboard" | "agent-to-agent" | "workflow";
  targetUser: string;
  serviceEndpoint?: string;
  documentationUrl?: string;
  metadataUri?: string;
  tokenName: string;
  tokenSymbol: string;
  decimals: number;
  status: "draft" | "ready-for-review";
};
```

## Page structure

### 1. Header

**Title:** `Define your agent`  
**Subtitle:** `Start with the service. Token economics come next.`

Components:

- `PhaseStepper`: `01 Agent setup` → `02 Economics` → `03 Launch review`.
- `Save draft` and `Exit` actions.
- `EnvironmentBadge`: `LOCAL DRAFT` or `DEVNET`.
- No wallet connection required.

### 2. Agent identity card

| Field | Type | Required | Validation |
|---|---|---:|---|
| Agent name | Text | Yes | 3–40 characters |
| Short description | Textarea | Yes | 20–180 characters |
| Category | Select | Yes | Supported category |
| Target user | Text | Yes | 3–100 characters |

Helper copy:

> Describe the job this agent performs, not only the model or technology behind it.

Example:

```text
Name: Research Copilot
Description: Produces source-linked market briefs for autonomous teams.
Category: Research
Target user: AI-native startups and independent analysts
```

### 3. Utility definition card

This is the central Phase A component because it connects the asset to a real service.

| Field | Type | Required | Example |
|---|---|---:|---|
| Utility unit | Text | Yes | research task |
| Token-to-utility rule | Textarea | Yes | 1 AGNT = 1 completed research task |
| Service description | Textarea | Yes | What the user receives |
| Consumption model | Select | Yes | per task / per minute / per request / subscription |
| Delivery mode | Select | Yes | API / dashboard / agent-to-agent / workflow |

Live preview:

```text
1 AGNT gives the holder access to 1 research task from Research Copilot.
```

Validation:

- Utility must be measurable, not purely speculative.
- The token-to-utility rule must include a unit.
- Reject investment promises such as guaranteed returns, profit, or price targets.
- The delivery method must be explainable.

### 4. Capability card

Optional fields:

- Supported input types.
- Expected response time.
- Maximum task size.
- Human review requirement.
- Data source or model dependency.
- Availability target.

Render as capability chips, for example:

```text
Web research     Source citations     Async delivery     Human escalation
```

### 5. Service access card

Fields:

- Public documentation URL.
- Public service landing page.
- API or adapter URL, if available.
- Operator/contact handle.
- Example task or test prompt.

Security rules:

- Never request API secrets in this form.
- Never store private service credentials in `VITE_*` variables.
- Only public metadata and URLs belong in the launch draft.

### 6. Asset identity card

| Field | Type | Required | Validation |
|---|---|---:|---|
| Token name | Text | Yes | 3–32 characters |
| Token symbol | Text | Yes | 2–10 uppercase characters |
| Decimals | Select | Yes | Default 6; documented range |
| Metadata URI | URL | Optional | HTTPS or IPFS |
| Logo | File/URL | Optional | Preview only |

Preview:

```text
Research Copilot
AGNT
1 AGNT = 1 research task
```

Label this as **draft asset identity**, not a minted token.

### 7. Phase A review summary

Show four read-only sections:

1. **Agent** — name, category, target user.
2. **Utility** — unit, rule, consumption model, delivery mode.
3. **Service** — endpoint, documentation, example task.
4. **Asset identity** — name, symbol, decimals, metadata.

Actions:

- `Edit details`
- `Save draft`
- `Continue to economics`

Continue remains disabled until required validation passes.

## Phase A states and persistence

Empty state:

```text
Start with the job your agent performs.
Your launch draft will appear here as you complete the setup.
```

Inline validation example:

```text
Utility unit is required.
Tell users what one unit of access represents.
```

Ready state:

```text
Agent setup ready
Your service definition is complete. Next, configure how demand and liquidity should form around it.
```

Persist only public fields in local storage:

- Draft version.
- Local draft ID.
- Last modified timestamp.
- Phase completion state.
- Agent and utility fields.

Never persist private keys, seed phrases, wallet JSON, OAuth secrets, or service API keys.

---

# Phase B — Economic Configuration

## Objective

Translate the agent utility into a launch plan using Meteora DBC for initial price discovery and DAMM v2 as the planned graduation destination.

### Output model

```ts
type EconomicLaunchPlan = {
  preset: "bootstrap" | "scarce-compute" | "community-utility";
  quoteMint: string;
  curveProfile: string;
  launchFeeBps: number;
  graduationThreshold: number;
  initialLiquidity: number;
  supplyBehavior: "fixed" | "programmable" | "service-capped";
  migrationTarget: "damm-v2";
  creatorLiquidityBps: number;
  dlmmStrategy: "spot" | "curve" | "bid-ask";
  riskAcknowledged: boolean;
  status: "draft" | "ready-for-review" | "wallet-approval-required";
};
```

## Page structure

### 1. Header

**Title:** `Configure the agent economy`  
**Subtitle:** `Choose how access demand becomes a market.`

Components:

- Agent summary chip from Phase A.
- Phase A completion indicator.
- `EnvironmentBadge`: `Solana Devnet`.
- Public wallet status only; wallet is not required to edit the draft.
- No transaction submission control in this phase.

### 2. Preset selector

#### Bootstrap

For new agents and low-friction discovery:

- Softer curve.
- Lower initial barrier.
- Wider early distribution.
- Lower graduation target.

#### Scarce Compute

For agents with limited inference or execution capacity:

- Stronger progressive pricing.
- More friction during demand spikes.
- Higher graduation target.
- Explicit capacity warning.

#### Community Utility

For agents whose value grows through repeated community use:

- Moderate curve.
- Balanced launch fee.
- Community-oriented access.
- Recurring-utility emphasis.

Each preset card includes a recommendation, curve preview, three key stats, `Use preset`, and `Compare`. Use `Recommended starting point`, not language implying a guaranteed best choice.

### 3. Quote asset and supply card

| Field | Type | Required | Notes |
|---|---|---:|---|
| Quote mint | Select/address | Yes | Supported Devnet quote mint |
| Initial liquidity | Number | Yes | SOL or quote asset amount |
| Supply behavior | Select | Yes | Fixed, programmable, service-capped |
| Service capacity | Number | Optional | Tasks or requests supported |
| Creator liquidity share | Percentage | Yes | Explain retained liquidity effect |

Guardrails:

- Reject zero or negative liquidity.
- Show fee and rent estimate when available.
- Warn above the small-test threshold.
- Never imply liquidity equals profit.

### 4. DBC curve card

Expose preset-level controls first:

- Curve profile.
- Launch fee.
- Graduation threshold.
- Early price slope.
- Maximum movement per segment.
- Buy/sell behavior.

Put raw SDK fields behind an advanced disclosure:

- Raw DBC config fields.
- SDK parameter names.
- Expected account ownership.
- Migration compatibility.

Every control needs a short explanation and a `Why this matters` tooltip.

### 5. Graduation and migration card

Display the intended lifecycle:

```text
DBC virtual pool
    ↓ graduation threshold
DAMM v2 durable market
    ↓ liquidity activation
DLMM concentrated bands
```

Indicators:

- Migration target: `DAMM v2`.
- Graduation eligibility: `Not checked`, `Not eligible`, or `Eligible`.
- DAMM v2 config: `Not configured` until a real Devnet address exists.
- DLMM strategy: `Planned`, not executable.

Required copy:

> Selecting DAMM v2 defines the intended destination. It does not create a DAMM v2 pool or submit a migration transaction.

### 6. Economics preview

Show behavior, not promises:

- Example entry amount.
- Example utility cost.
- Simulated curve progress.
- Simulated graduation progress.
- Estimated quote reserve.
- Service-capacity coverage.
- Planned DLMM active-bin range.

All non-chain values carry this label:

```text
Local simulation — not an on-chain quote
```

### 7. Risk and assumptions panel

Required checkbox:

```text
I understand that this is a Devnet launch plan. It does not guarantee demand, price, liquidity, service availability, or returns.
```

Warnings:

- DBC account addresses are not yet created.
- DAMM v2 and DLMM addresses remain unconfigured.
- Presets are product assumptions, not Meteora guarantees.
- Transaction approval is a separate step.

Phase B cannot reach `Ready for review` until this acknowledgment is checked.

### 8. Review summary

Show:

1. Agent utility inherited from Phase A.
2. Selected economic preset.
3. DBC curve, fee, quote mint, and threshold.
4. Planned DAMM v2 migration.
5. Planned DLMM strategy and range.
6. Wallet and network.
7. Transaction state: `No transaction created`.

Actions:

- `Back to agent setup`
- `Save economic draft`
- `Build launch review`

The final action opens a separate Phase C review page; it does not open Phantom directly.

## Phase B state model

```text
Draft
  ↓ local validation
Ready for review
  ↓ user opens launch review
Wallet approval required
  ↓ future explicit transaction action
Submitted
  ↓ confirmed read-back
Confirmed on-chain
```

For the current product, Phase B stops at `Ready for review` because DBC PoolConfig, base mint, and real pool accounts do not yet exist.

---

## Component inventory

### Shared

- `PhaseStepper`
- `EnvironmentBadge`
- `DraftSaveIndicator`
- `PublicWalletStatus`
- `InlineValidationMessage`
- `ReviewSummary`
- `ReadOnlyTransactionState`
- `RiskAcknowledgement`

### Phase A

- `AgentIdentityForm`
- `UtilityDefinitionForm`
- `CapabilityChips`
- `ServiceAccessForm`
- `AssetIdentityForm`
- `AgentUtilityPreview`
- `AgentSetupReview`

### Phase B

- `EconomicPresetSelector`
- `QuoteAssetForm`
- `CurveProfileCard`
- `GraduationConfigCard`
- `MigrationPathCard`
- `LiquidityStrategyPreview`
- `EconomicRiskPanel`
- `EconomicLaunchReview`

## Recommended implementation order

1. Extract a shared `PhaseStepper` from the existing Workspace/Build navigation.
2. Implement Phase A as a local draft flow without wallet requirements.
3. Add Phase A validation and secret-safe local persistence.
4. Implement Phase B preset selection.
5. Connect preset values to the existing DBC simulator and telemetry preview.
6. Add the Phase B review summary and risk acknowledgment.
7. Keep transaction controls outside these phases until Phase C is designed.
8. Add real account validation after PoolConfig, base mint, and VirtualPool exist.

## Acceptance criteria

### Phase A

- User defines an AI-agent service without connecting a wallet.
- Utility unit and token-to-utility rule are mandatory.
- Draft survives refresh without secrets.
- User sees a clear utility preview.
- Invalid or vague utility fields block continuation.

### Phase B

- User selects and compares three economic presets.
- Each preset shows curve, fee, threshold, and liquidity consequences.
- User reviews quote mint, initial liquidity, supply behavior, and migration target.
- Preview values are explicitly labeled simulation.
- DAMM v2 is shown as a planned destination, not an existing pool.
- DLMM is shown as a planned strategy, not a submitted position.
- No transaction is submitted from Phase A or Phase B.
- Final state is `Ready for review`, pending a separate Phase C transaction review.
