import { useState } from "react";
import { ArrowUpRight, ExternalLink, RefreshCw, WalletCards } from "lucide-react";
import { usePools } from "@/context/PoolContext";
import { PoolsList } from "@/components/PoolsList";

export default function Pools() {
  const { pools, discoverOnChain, discovering } = usePools();
  const [scanNote, setScanNote] = useState<string | null>(null);

  const runDiscovery = async () => {
    const found = await discoverOnChain();
    setScanNote(
      found > 0
        ? `On-chain scan found ${found} pool${found === 1 ? "" : "s"} on the open launch config.`
        : "On-chain scan found no additional pools on the launch config."
    );
  };

  return (
    <div className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="AgentBond home">
          <span className="logo-mark"><i /><i /><i /></span>
          agent<span className="brand-dot">.</span>bond
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a href="/">Overview</a>
          <a href="/#lifecycle">Lifecycle</a>
          <a className="active" href="/pools">Pools</a>
        </nav>
        <a className="wallet-btn" href="/#devnet"><WalletCards size={15} /> Devnet lab<span className="network-dot" /></a>
      </header>
      <main>
        <section className="section container">
          <div className="section-heading"><div><span className="section-kicker">POOLS ON THIS BETA</span><h2>Every market,<br /><em>one registry.</em></h2></div><p>Canonical AgentBond markets and community-launched pools. Community pools are unverified — they are not affiliated with AgentBond and may carry unpriced risk.</p></div>
          <div className="lp-row" style={{ marginBottom: 18 }}>
            <button className="button button-ghost" onClick={() => void runDiscovery()} disabled={discovering}>
              <RefreshCw size={14} className={discovering ? "spin" : ""} /> {discovering ? "Scanning Devnet…" : "Refresh on-chain"}
            </button>
          </div>
          <PoolsList pools={pools} />
          {scanNote && <p className="hero-note" style={{ marginTop: 12 }}><span>i</span> {scanNote}</p>}
          <p className="hero-note" style={{ marginTop: 18 }}><span>i</span> Pools you launch are stored in this browser. Canonical AGNT markets are curated here.</p>
        </section>
      </main>
      <footer className="footer container"><span>agent<span className="brand-dot">.</span>bond</span><span>PUBLIC DEVNET BETA · TEST ASSETS ONLY</span><a href="https://docs.meteora.ag/developer-guides/dbc" target="_blank" rel="noreferrer">Meteora DBC docs <ExternalLink size={12} /></a></footer>
    </div>
  );
}
