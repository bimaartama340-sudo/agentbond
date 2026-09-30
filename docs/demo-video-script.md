# Demo Video Script (target: 2.5–3 minutes)

Record at https://agentbond-umber.vercel.app with Phantom on devnet. Show real transactions; open the Explorer at least twice.

---

**[0:00–0:20] Hook — the problem**
Screen: AgentBond landing.
> "Launchpads stop at speculation. A token goes live, the curve fills, and then… nothing. AgentBond closes the loop. Signal — people fund an idea by buying a token. Service — an autonomous agent actually works for its holders, and its revenue flows back into the token."

**[0:20–0:50] Launch a token (the Signal)**
Screen: /launch. Fill name/symbol, paste a logo URL, click *Host metadata* (Phantom popup), launch (2 Phantom popups).
> "Anyone launches in two transactions: the mint with Metaplex metadata, then Meteora's DBC createPoolWithFirstBuy — slippage protection derived from a live quote. The pool shows up in the registry as unverified. This is Meteora DBC, fully configurable — we didn't hack around it, we built on it."

**[0:50–1:20] The lifecycle**
Screen: /pools, then the AGNT pool page — venue tabs, lifecycle panel.
> "Every pool rides the DBC curve, shows its progress, and graduates permissionlessly to a DAMM v2 pool. Canonical markets are verified; community launches carry an unverified badge. Registry discovery reads the chain directly — no backend."

**[1:20–2:10] The Service — agent at work (the core demo)**
Screen: AGENT SERVICE panel. Type: "Berapa harga AGNT sekarang?" pay 0.001 SOL, sign. Refresh feed: TASK appears → wait → REPLY + BUYBACK appear. Click BUYBACK → Explorer → point at agent receiving AGNT.
> "Here's the part no other launchpad has. I hire this token's agent by paying it directly on-chain — the prompt travels inside the memo. The agent answers on-chain, market-aware: it just read its own pool's price and liquidity. And watch this — fifty percent of my payment is being swapped into the token, right now, by the agent itself. This buyback is a plain DAMM v2 swap. Anyone can audit it. Usage supports the market — mechanically, not as a promise."

**[2:10–2:40] Trust and safety**
Screen: swap console with min-out preview; explorer link of an earlier tx.
> "Everything is non-custodial: mint keys are born in your browser, you sign every transaction, minimum-out protection comes from live quotes on every swap. Devnet-only by design in this release — the same code is mainnet-ready once a real token wants this."

**[2:40–3:00] Close**
Screen: landing.
> "AgentBond: Signal to Service. Funded by Meteora DBC, executed by an agent, verifiable by anyone. Thanks for watching."

---

## Recording notes
- Pre-fund the demo wallet (~1 devnet SOL) before recording.
- Have the Explorer tab pre-opened for the buyback signature.
- If the agent reply is slow (>60s), cut; show the already-completed earlier loop as backup B-roll.
- Optional captions in English; narration can be recorded separately.
