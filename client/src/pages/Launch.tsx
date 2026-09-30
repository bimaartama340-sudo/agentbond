import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Globe,
  Loader2,
  LockKeyhole,
  Rocket,
  UploadCloud,
  WalletCards,
} from "lucide-react";
import { estimateLaunchQuote, launchTokenWithFirstBuy, validateLaunchInput } from "@/lib/creator";
import { DEFAULT_SWAP_SLIPPAGE_BPS, fromRawAmount } from "@/lib/meteora";
import { uploadTokenMetadata } from "@/lib/tokenMetadata";

function provider() {
  return window.phantom?.solana ?? window.solana;
}

function explorerUrl(signature: string) {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

type LaunchOutcome = {
  mint: string;
  dbcPool: string;
  createMintSignature: string;
  createPoolSignature: string;
  firstBuyOut: string;
};

export default function Launch() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [uri, setUri] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [hosting, setHosting] = useState(false);
  const [firstBuy, setFirstBuy] = useState("0.01");
  const [slippagePct, setSlippagePct] = useState(String(DEFAULT_SWAP_SLIPPAGE_BPS / 100));
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "mint" | "pool">("idle");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<LaunchOutcome | null>(null);

  const walletProvider = provider();

  useEffect(() => {
    walletProvider
      ?.connect({ onlyIfTrusted: true })
      .then(result => setWallet(result.publicKey.toString()))
      .catch(() => undefined);
  }, [walletProvider]);

  useEffect(() => {
    const amount = Number(firstBuy);
    const slippage = Number(slippagePct);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(slippage) || slippage < 0.1) {
      setQuoteOut(null);
      return;
    }
    const timer = setTimeout(() => {
      estimateLaunchQuote({ firstBuySol: amount, slippageBps: Math.round(slippage * 100) })
        .then(quote => setQuoteOut(quote.outputAmount.toString()))
        .catch(() => setQuoteOut(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [firstBuy, slippagePct]);

  const connect = async () => {
    if (!walletProvider) return setError("No Solana wallet detected — install Phantom");
    try {
      const result = await walletProvider.connect({ onlyIfTrusted: false });
      setWallet(result.publicKey.toString());
      setError(null);
    } catch {
      setError("Wallet connection was cancelled");
    }
  };

  const hostMetadata = async () => {
    if (!wallet) return setError("Connect Phantom before hosting metadata");
    if (!walletProvider) return setError("Injected Solana wallet not available");
    if (!name.trim() || !symbol.trim()) return setError("Fill the token name and symbol first");
    if (!/^https?:\/\/.+/.test(imageUrl.trim())) return setError("Image URL must start with http(s)://");
    setHosting(true);
    setError(null);
    try {
      const hosted = await uploadTokenMetadata({
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        imageUrl,
        provider: walletProvider,
      });
      setUri(hosted.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Metadata upload failed or was rejected");
    } finally {
      setHosting(false);
    }
  };

  const launch = async () => {
    if (!wallet) return setError("Connect Phantom before launching");
    if (!walletProvider) return setError("Injected Solana wallet not available");
    try {
      validateLaunchInput({ name, symbol, firstBuySol: Number(firstBuy) });
    } catch (e) {
      return setError(e instanceof Error ? e.message : "Invalid launch input");
    }
    setError(null);
    setOutcome(null);
    setStep("mint");
    try {
      const result = await launchTokenWithFirstBuy({
        creator: wallet,
        name,
        symbol,
        uri,
        firstBuySol: Number(firstBuy),
        slippageBps: Math.round(Number(slippagePct) * 100),
        provider: walletProvider as Parameters<typeof launchTokenWithFirstBuy>[0]["provider"],
      });
      setOutcome(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Launch failed or was rejected");
    } finally {
      setStep("idle");
    }
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
          <a href="/pools">Pools</a>
          <a className="active" href="/launch">Launch</a>
        </nav>
        <button className={`wallet-btn ${wallet ? "connected" : ""}`} onClick={wallet ? () => setWallet(null) : connect}>
          <WalletCards size={15} /> {wallet ? `${wallet.slice(0, 4)}…${wallet.slice(-4)}` : "Connect wallet"}<span className="network-dot" />
        </button>
      </header>
      <main>
        <section className="section container" style={{ paddingTop: 48 }}>
          <div className="section-heading"><div><span className="section-kicker">SIGNAL TO SERVICE · STEP 01</span><h2>Launch your<br /><em>agent token.</em></h2></div><p>Create a new token with its own bonding-curve pool on Solana Devnet. Your Phantom signs both the mint creation and the pool's first buy — nothing is custodial, and the mint keypair never leaves your browser.</p></div>
          <div className="devnet-lab"><div className="lab-left">
            <div className="transaction-console">
              <div className="console-head"><div><span className="tiny-label">DBC PERMISSIONLESS LAUNCH</span><h3>New token + first buy</h3></div><span className="lab-mode">DEVNET · LIVE</span></div>
              <label className="amount-field"><span>TOKEN NAME</span><input value={name} maxLength={32} placeholder="My Agent Service" onChange={event => setName(event.target.value)} /></label>
              <label className="amount-field"><span>SYMBOL</span><input value={symbol} maxLength={10} placeholder="MAS" onChange={event => setSymbol(event.target.value.toUpperCase())} /></label>
              <div className="lp-row">
                <label className="amount-field compact lp-input"><span>IMAGE URL <b>for logo</b></span><input value={imageUrl} placeholder="https://…/logo.png" onChange={event => setImageUrl(event.target.value)} /></label>
                <button className="button button-ghost" onClick={hostMetadata} disabled={hosting || !wallet}>
                  {hosting ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} {hosting ? "Uploading…" : "Host metadata"}
                </button>
              </div>
              <label className="amount-field"><span>METADATA URI <b>{uri ? "hosted" : "optional"}</b></span><input value={uri} placeholder="https://…/metadata.json" onChange={event => setUri(event.target.value)} /></label>
              {uri && <p className="lp-note"><Globe size={11} /> Metadata will be stored in the mint's Metaplex account and wallets will show your name, symbol, and logo.</p>}
              <label className="amount-field"><span>FIRST BUY <b>SOL</b></span><input type="number" min="0.001" step="0.001" value={firstBuy} onChange={event => setFirstBuy(event.target.value)} /></label>
              <label className="amount-field compact"><span>SLIPPAGE TOLERANCE <b>%</b></span><input type="number" min="0.1" max="10" step="0.1" value={slippagePct} onChange={event => setSlippagePct(event.target.value)} /></label>
              <div className="quote-preview">
                {quoteOut ? (
                  <div className="quote-line"><small>FIRST BUY ESTIMATED OUTPUT</small><strong>≈ {fromRawAmount(quoteOut, 6).toLocaleString(undefined, { maximumFractionDigits: 2 })} {symbol.trim().toUpperCase() || "TOKENS"}</strong></div>
                ) : (
                  <p className="quote-loading">Enter a first-buy amount to preview the curve price.</p>
                )}
              </div>
              <button className="button button-primary full" onClick={launch} disabled={step !== "idle" || !wallet}>
                {step !== "idle" ? <Loader2 className="spin" size={16} /> : <Rocket size={16} />}
                {step === "mint" ? "Step 1/2: creating mint…" : step === "pool" ? "Step 2/2: creating pool…" : wallet ? "Launch token" : "Connect wallet to launch"}
              </button>
              {error && <p className="quote-error" style={{ marginTop: 10 }}>{error}</p>}
              {outcome && (
                <div className="swap-result" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                  <span><Check size={13} /> Token launched: {outcome.mint}</span>
                  <span>Pool: {outcome.dbcPool}</span>
                  <span><a href={explorerUrl(outcome.createMintSignature)} target="_blank" rel="noreferrer">Mint tx <ExternalLink size={11} /></a> · <a href={explorerUrl(outcome.createPoolSignature)} target="_blank" rel="noreferrer">Pool tx <ExternalLink size={11} /></a></span>
                  <span><a href="/pools">Open the pools registry <ArrowLeft size={11} style={{ transform: "rotate(180deg)" }} /></a></span>
                </div>
              )}
              <p className="notice"><LockKeyhole size={13} /> You pay the mint rent, the DBC pool-creation fee, and the first buy — all in Devnet SOL from your wallet. Hosting metadata costs a fraction of a SOL on Irys devnet, paid from the same wallet. Your pool appears as UNVERIFIED in the registry.</p>
            </div>
          </div>
          <div className="lab-right">
            <div className="terminal-head"><span><span className="terminal-dot" /> HOW IT WORKS</span><b>2 TX</b></div>
            <div className="stage-list">
              <div className={`stage-row ${outcome || step !== "idle" ? "done" : ""}`}><span>01</span><b>Create SPL mint (your keypair)</b><i><Check size={13} /></i></div>
              <div className={`stage-row ${outcome ? "done" : ""}`}><span>02</span><b>Create DBC pool + first buy</b><i><Check size={13} /></i></div>
              <div className="stage-row"><span>03</span><b>Trade on the curve</b><i>→</i></div>
              <div className="stage-row"><span>04</span><b>Graduate to DAMM v2</b><i>→</i></div>
            </div>
            <div className="inspector"><div className="inspector-head"><span>LAUNCH FACTS</span><span className="ready">DEVNET</span></div>
              <div className="address-row"><span>CONFIG</span><code>permissionless</code></div>
              <div className="address-row"><span>DECIMALS</span><code>6</code></div>
              <div className="address-row"><span>CUSTODY</span><code>none</code></div>
            </div>
          </div></div>
        </section>
      </main>
      <footer className="footer container"><span>agent<span className="brand-dot">.</span>bond</span><span>PUBLIC DEVNET BETA · TEST ASSETS ONLY</span></footer>
    </div>
  );
}
