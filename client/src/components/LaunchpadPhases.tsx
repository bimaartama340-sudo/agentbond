import { useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, CircleAlert, Save, Sparkles } from "lucide-react";

type Phase = "agent" | "economics" | "review";
type Preset = "bootstrap" | "scarce-compute" | "community-utility";
type Draft = {
  agentName: string; description: string; category: string; targetUser: string;
  utilityUnit: string; utilityRule: string; serviceDescription: string;
  consumptionModel: string; deliveryMode: string; docsUrl: string;
  tokenName: string; tokenSymbol: string; preset: Preset; initialLiquidity: number;
  graduationThreshold: number; launchFeeBps: number; dlmmStrategy: string; riskAcknowledged: boolean;
};
const STORAGE_KEY = "agentbond.launchpad-draft.v1";
const initialDraft: Draft = {
  agentName: "Research Copilot", description: "Produces source-linked market briefs for autonomous teams.", category: "research", targetUser: "AI-native startups and independent analysts", utilityUnit: "research task", utilityRule: "1 AGNT = 1 completed research task", serviceDescription: "Source-linked research briefs delivered to an agent workflow.", consumptionModel: "per-task", deliveryMode: "workflow", docsUrl: "", tokenName: "AgentBond", tokenSymbol: "AGNT", preset: "bootstrap", initialLiquidity: 0.5, graduationThreshold: 10, launchFeeBps: 250, dlmmStrategy: "spot", riskAcknowledged: false,
};
const presets: Record<Preset, { label: string; description: string; curve: string; fee: number; threshold: number }> = {
  bootstrap: { label: "Bootstrap", description: "Low-friction discovery for a new agent.", curve: "Soft → Land → Lift", fee: 250, threshold: 10 },
  "scarce-compute": { label: "Scarce Compute", description: "Progressive pricing for limited capacity.", curve: "Flat → Step → Rise", fee: 400, threshold: 25 },
  "community-utility": { label: "Community Utility", description: "Balanced access for recurring use.", curve: "Soft → Soft → Rise", fee: 200, threshold: 15 },
};
function loadDraft(): Draft { try { const raw = window.localStorage.getItem(STORAGE_KEY); return raw ? { ...initialDraft, ...JSON.parse(raw) } : initialDraft; } catch { return initialDraft; } }

export function LaunchpadPhases() {
  const [phase, setPhase] = useState<Phase>("agent");
  const [draft, setDraft] = useState<Draft>(loadDraft);
  const [saved, setSaved] = useState(true);
  useEffect(() => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); setSaved(false); }, [draft]);
  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const errors = useMemo(() => [
    draft.agentName.trim().length < 3 ? "Agent name needs at least 3 characters." : "",
    draft.description.trim().length < 20 ? "Add a service description of at least 20 characters." : "",
    draft.targetUser.trim().length < 3 ? "Define who the agent serves." : "",
    draft.utilityUnit.trim().length < 2 ? "Utility unit is required." : "",
    draft.utilityRule.trim().length < 8 ? "Describe the token-to-utility rule." : "",
    draft.serviceDescription.trim().length < 20 ? "Explain what the user receives." : "",
  ].filter(Boolean), [draft]);
  const economicsReady = draft.initialLiquidity > 0 && draft.graduationThreshold > 0 && draft.riskAcknowledged;
  const selected = presets[draft.preset];
  const saveDraft = () => { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); setSaved(true); };
  const choosePreset = (preset: Preset) => setDraft(current => ({ ...current, preset, launchFeeBps: presets[preset].fee, graduationThreshold: presets[preset].threshold }));
  const step = (name: Phase, number: string, label: string, complete = false) => <button className={phase === name ? "active" : complete ? "complete" : ""} onClick={() => (name !== "review" || economicsReady) && setPhase(name)}><span>{complete ? <Check size={13} /> : number}</span>{label}<ChevronRight size={14} /></button>;

  return <section className="launchpad-flow" aria-labelledby="launchpad-title">
    <div className="launchpad-flow-head"><div><span className="tiny-label">AI-AGENT LAUNCHPAD / DEVNET DRAFT</span><h2 id="launchpad-title">Build an agent economy.</h2><p>Define the utility first. Then choose how demand should become a Meteora market.</p></div><button className="launchpad-save" onClick={saveDraft}><Save size={14} /> {saved ? "Draft saved" : "Save draft"}</button></div>
    <div className="launchpad-stepper" aria-label="Launch phases">{step("agent", "01", "Agent setup", phase !== "agent")}{step("economics", "02", "Economics", phase === "review")}{step("review", "03", "Launch review")}</div>

    {phase === "agent" && <div className="launchpad-grid"><div className="launchpad-main"><div className="launchpad-card-head"><div><span className="tiny-label">PHASE A / IDENTITY</span><h3>Define your agent</h3></div><span className="launchpad-status">LOCAL DRAFT</span></div>
      <div className="launchpad-form-grid">
        <label>Agent name<input value={draft.agentName} onChange={e => update("agentName", e.target.value)} /></label>
        <label>Category<select value={draft.category} onChange={e => update("category", e.target.value)}><option>research</option><option>automation</option><option>developer</option><option>creative</option><option>data</option><option>other</option></select></label>
        <label className="full">Short description<textarea rows={3} value={draft.description} onChange={e => update("description", e.target.value)} /></label>
        <label>Target user<input value={draft.targetUser} onChange={e => update("targetUser", e.target.value)} /></label>
        <label>Utility unit<input value={draft.utilityUnit} onChange={e => update("utilityUnit", e.target.value)} placeholder="research task" /></label>
        <label className="full">Token-to-utility rule<textarea rows={2} value={draft.utilityRule} onChange={e => update("utilityRule", e.target.value)} /></label>
        <label className="full">What does the user receive?<textarea rows={3} value={draft.serviceDescription} onChange={e => update("serviceDescription", e.target.value)} /></label>
        <label>Consumption model<select value={draft.consumptionModel} onChange={e => update("consumptionModel", e.target.value)}><option value="per-task">Per task</option><option value="per-minute">Per minute</option><option value="per-request">Per request</option><option value="subscription">Subscription</option></select></label>
        <label>Delivery mode<select value={draft.deliveryMode} onChange={e => update("deliveryMode", e.target.value)}><option value="api">API</option><option value="dashboard">Dashboard</option><option value="agent-to-agent">Agent-to-agent</option><option value="workflow">Workflow</option></select></label>
        <label>Documentation URL <small>optional</small><input value={draft.docsUrl} onChange={e => update("docsUrl", e.target.value)} placeholder="https://..." /></label>
        <label>Token name<input value={draft.tokenName} onChange={e => update("tokenName", e.target.value)} /></label>
        <label>Token symbol<input value={draft.tokenSymbol} onChange={e => update("tokenSymbol", e.target.value.toUpperCase())} maxLength={10} /></label>
      </div>
      {errors.length > 0 && <div className="launchpad-validation"><CircleAlert size={15} /><div>{errors.slice(0, 2).map(error => <span key={error}>{error}</span>)}</div></div>}
      <div className="launchpad-actions"><button className="button button-primary" disabled={errors.length > 0} onClick={() => setPhase("economics")}>Continue to economics <ChevronRight size={16} /></button></div>
    </div><aside className="launchpad-side"><span className="tiny-label">UTILITY PREVIEW</span><div className="utility-preview"><Sparkles size={18} /><strong>{draft.tokenSymbol || "AGNT"}</strong><p>{draft.tokenSymbol || "AGNT"} gives access to 1 {draft.utilityUnit || "service unit"} from {draft.agentName || "your agent"}.</p></div><div className="launchpad-side-note"><b>Security boundary</b><p>Only public metadata is saved in this draft. Wallet secrets and service API keys never belong here.</p></div></aside></div>}

    {phase === "economics" && <div className="launchpad-grid"><div className="launchpad-main"><div className="launchpad-card-head"><div><span className="tiny-label">PHASE B / ECONOMICS</span><h3>Configure the agent economy</h3></div><span className="launchpad-status">SOLANA DEVNET</span></div><p className="launchpad-helper">Choose how access demand becomes a market. These values are a local launch plan, not an on-chain quote.</p>
      <div className="preset-grid">{(Object.keys(presets) as Preset[]).map((key, index) => { const item = presets[key]; return <button key={key} className={`preset-card ${draft.preset === key ? "selected" : ""}`} onClick={() => choosePreset(key)}><span className="preset-number">0{index + 1}</span><strong>{item.label}</strong><p>{item.description}</p><small>{item.curve} · {item.fee / 100}% fee · {item.threshold} SOL graduation</small></button>; })}</div>
      <div className="launchpad-form-grid"><label>Initial liquidity (SOL)<input type="number" min="0.01" step="0.01" value={draft.initialLiquidity} onChange={e => update("initialLiquidity", Number(e.target.value))} /></label><label>Graduation threshold (SOL)<input type="number" min="0.1" step="0.1" value={draft.graduationThreshold} onChange={e => update("graduationThreshold", Number(e.target.value))} /></label><label>Launch fee (bps)<input type="number" min="0" step="25" value={draft.launchFeeBps} onChange={e => update("launchFeeBps", Number(e.target.value))} /></label><label>DLMM strategy<select value={draft.dlmmStrategy} onChange={e => update("dlmmStrategy", e.target.value)}><option value="spot">Spot</option><option value="curve">Curve</option><option value="bid-ask">Bid-ask</option></select></label></div>
      <label className="risk-check"><input type="checkbox" checked={draft.riskAcknowledged} onChange={e => update("riskAcknowledged", e.target.checked)} /><span>I understand this is a Devnet launch plan. It does not guarantee demand, price, liquidity, service availability, or returns.</span></label>
      <div className="launchpad-actions"><button className="button button-outline" onClick={() => setPhase("agent")}>Back to setup</button><button className="button button-primary" disabled={!economicsReady} onClick={() => setPhase("review")}>Build launch review <ChevronRight size={16} /></button></div>
    </div><aside className="launchpad-side"><span className="tiny-label">LIFECYCLE PLAN</span><div className="lifecycle-mini"><b>DBC</b><span>Price discovery</span><b>DAMM v2</b><span>Graduated market</span><b>DLMM</b><span>Concentrated liquidity</span></div><div className="launchpad-side-note"><b>{selected.label}</b><p>{selected.description} Current plan: {draft.initialLiquidity} SOL initial liquidity and {draft.graduationThreshold} SOL graduation threshold.</p></div></aside></div>}

    {phase === "review" && <div className="launchpad-review"><div className="launchpad-card-head"><h3>Review the launch plan</h3><span className="launchpad-status">READ ONLY</span></div><p>DBC to DAMM v2 to DLMM lifecycle review. No transaction created.</p><div className="launchpad-actions"><button className="button button-outline" onClick={() => setPhase("economics")}>Edit economics</button><button className="button button-primary" onClick={saveDraft}><Save size={15} /> Save launch draft</button></div></div>}
  </section>;
}
