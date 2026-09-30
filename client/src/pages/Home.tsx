import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleDot,
  ExternalLink,
  Gauge,
  GitBranch,
  Layers3,
  Loader2,
  LockKeyhole,
  Radar,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  WalletCards,
  Zap,
} from "lucide-react";
import {
  DEFAULT_SWAP_SLIPPAGE_BPS,
  executeDammV2Swap,
  executeDammV2Migration,
  executeDlmmSwap,
  fetchDbcCurveProgress,
  fromRawAmount,
  getDammV2SwapQuote,
  getDlmmSwapQuote,
  getTestnetExplorerUrl,
  type DammV2SwapDirection,
  type DammV2SwapQuote,
  type DlmmSwapQuote,
  type SolanaProvider,
} from "@/lib/meteora";
import { badgeFor, UNVERIFIED_DISCLAIMER, updateUserPool, type PoolRecord } from "@/lib/poolRegistry";
import { usePools } from "@/context/PoolContext";
import { PoolsList } from "@/components/PoolsList";
import { LiquidityPanel } from "@/components/LiquidityPanel";
import { DlmmLiquidityPanel } from "@/components/DlmmLiquidityPanel";
import { AgentServicePanel } from "@/components/AgentServicePanel";
import { LifecycleStatus } from "@/components/LifecycleStatus";

type VenueQuote = {
  rawOutAmount: string;
  rawMinimumOut: string;
  outputDecimals: number;
  priceImpactPct: number;
  slippageBps: number;
};

type Venue = "damm" | "dlmm";

type RpcSnapshot = {
  slot: number;
  balance: number;
  poolExists: boolean | null;
  status: string;
};

const RPC = "https://api.devnet.solana.com";
const DBC_PROGRAM = "dbcij3LWUppWwqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";

function provider() {
  return window.phantom?.solana ?? window.solana;
}

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function explorerAddress(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || "Devnet RPC error");
  return payload.result;
}

function signaturePreview(signature: Uint8Array) {
  const hex = Array.from(signature, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 10)}…${hex.slice(-8)}`;
}

export default function Home() {
  const [wallet, setWallet] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RpcSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Ready for wallet review");
  const [tradeMode, setTradeMode] = useState<DammV2SwapDirection>("sol-to-agnt");
  const [amount, setAmount] = useState("0.01");
  const [slippagePct, setSlippagePct] = useState(String(DEFAULT_SWAP_SLIPPAGE_BPS / 100));
  const [quote, setQuote] = useState<VenueQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [swapResult, setSwapResult] = useState<{ signature: string; outAmount: number } | null>(null);
  const [venue, setVenue] = useState<Venue>("damm");

  const walletProvider = provider();
  const connectedLabel = wallet ? short(wallet) : "Connect wallet";
  const { pools, active, setActiveById, refreshPools } = usePools();
  const activeDammPool = active.dammV2Pool ?? null;
  const activeDlmmPool = active.dlmmPool ?? null;

  const readDevnet = useCallback(async (address?: string) => {
    setLoading(true);
    try {
      const poolToCheck = active.dbcPool ?? DBC_PROGRAM;
      const [slot, account, balance] = await Promise.all([
        rpc("getSlot", [{ commitment: "confirmed" }]),
        rpc("getAccountInfo", [poolToCheck, { encoding: "base64", commitment: "confirmed" }]),
        address ? rpc("getBalance", [address, { commitment: "confirmed" }]) : Promise.resolve(null),
      ]);
      const next = {
        slot,
        balance: balance ? balance.value / 1_000_000_000 : 0,
        poolExists: Boolean(account.value),
        status: account.value
          ? `${active.symbol} pool account found on Devnet`
          : `${active.symbol} pool account not found`,
      } satisfies RpcSnapshot;
      setSnapshot(next);
      setMessage(next.status);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Devnet RPC unavailable");
    } finally {
      setLoading(false);
    }
  }, [active.dbcPool, active.symbol]);

  useEffect(() => {
    void readDevnet();
  }, [readDevnet]);

  const parsedAmount = Number(amount);
  const parsedSlippage = Number(slippagePct);
  const quoteRequestId = useRef(0);
  const inputLabel = tradeMode === "sol-to-agnt" ? "SOL" : active.symbol;
  const outputLabel = tradeMode === "sol-to-agnt" ? active.symbol : "SOL";

  useEffect(() => {
    if (!activeDlmmPool && venue === "dlmm") setVenue("damm");
  }, [activeDlmmPool, venue]);

  useEffect(() => {
    const venuePool = venue === "dlmm" ? activeDlmmPool : activeDammPool;
    if (!venuePool) {
      setQuote(null);
      setQuoteError(
        venue === "dlmm"
          ? `${active.symbol} has no DLMM market`
          : `${active.symbol} has no DAMM v2 market yet`
      );
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    if (!Number.isFinite(parsedSlippage) || parsedSlippage < 0.1 || parsedSlippage > 10) {
      setQuote(null);
      setQuoteError("Slippage must be between 0.1% and 10%");
      return;
    }
    const requestId = ++quoteRequestId.current;
    setQuoting(true);
    setQuoteError(null);
    const timer = setTimeout(() => {
      const request =
        venue === "dlmm"
          ? getDlmmSwapQuote({
              direction: tradeMode,
              amount: parsedAmount,
              slippageBps: Math.round(parsedSlippage * 100),
              poolAddress: venuePool,
            })
          : getDammV2SwapQuote({
              direction: tradeMode,
              amount: parsedAmount,
              slippageBps: Math.round(parsedSlippage * 100),
              poolAddress: venuePool,
            });
      request
        .then(result => {
          if (quoteRequestId.current !== requestId) return;
          setQuote(result);
          setQuoteError(null);
        })
        .catch((error: unknown) => {
          if (quoteRequestId.current !== requestId) return;
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : "Quote unavailable");
        })
        .finally(() => {
          if (quoteRequestId.current === requestId) setQuoting(false);
        });
    }, 450);
    return () => clearTimeout(timer);
  }, [activeDammPool, activeDlmmPool, active.symbol, parsedAmount, parsedSlippage, tradeMode, venue]);

  const connectWallet = async () => {
    if (!walletProvider) {
      setMessage("Install Phantom or another injected Solana wallet to continue");
      return;
    }
    try {
      const result = await walletProvider.connect({ onlyIfTrusted: false });
      const address = result.publicKey.toString();
      setWallet(address);
      setSignature(null);
      setMessage("Wallet connected to the public Devnet beta");
      void readDevnet(address);
    } catch {
      setMessage("Wallet connection was cancelled");
    }
  };

  const disconnectWallet = async () => {
    await walletProvider?.disconnect?.();
    setWallet(null);
    setSignature(null);
    setSnapshot(null);
    setMessage("Wallet disconnected");
  };

  const signIn = async () => {
    if (!wallet) return setMessage("Connect a wallet before signing in");
    if (!walletProvider?.signMessage) return setMessage("This wallet does not support signMessage");
    try {
      const text = `AgentBond Devnet sign-in\nWallet: ${wallet}\nNonce: ${crypto.randomUUID()}`;
      const result = await walletProvider.signMessage(new TextEncoder().encode(text), "utf8");
      setSignature(signaturePreview(result.signature));
      setMessage("Sign-in message approved. No funds moved.");
    } catch {
      setMessage("Sign-in message was rejected");
    }
  };

  const sendSwapTransaction = async () => {
    if (!wallet) return setMessage("Connect a wallet before swapping");
    if (!walletProvider) return setMessage("Injected Solana wallet not available");
    const venuePool = venue === "dlmm" ? activeDlmmPool : activeDammPool;
    if (!venuePool) {
      return setMessage(
        venue === "dlmm" ? `${active.symbol} has no DLMM market` : `${active.symbol} has no DAMM v2 market yet`
      );
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setMessage("Enter a valid amount");
    if (!quote) return setMessage(quoteError ?? "Wait for the quote preview before swapping");
    setSending(true);
    setSwapResult(null);
    try {
      const provider = walletProvider as Parameters<typeof executeDammV2Swap>[0]["provider"];
      const result =
        venue === "dlmm"
          ? await executeDlmmSwap({
              walletAddress: wallet,
              direction: tradeMode,
              amount: parsedAmount,
              slippageBps: Math.round(parsedSlippage * 100),
              poolAddress: venuePool,
              provider,
            })
          : await executeDammV2Swap({
              walletAddress: wallet,
              direction: tradeMode,
              amount: parsedAmount,
              slippageBps: Math.round(parsedSlippage * 100),
              poolAddress: venuePool,
              provider,
            });
      setSwapResult({
        signature: result.signature,
        outAmount: fromRawAmount(result.rawOutAmount, result.outputDecimals),
      });
      setMessage(
        `${venue === "dlmm" ? "DLMM" : "DAMM v2"} swap confirmed on Devnet: ${result.signature.slice(0, 8)}…`
      );
      void readDevnet(wallet);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Swap failed or was rejected");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="AgentBond home">
          <span className="logo-mark"><i /><i /><i /></span>
          agent<span className="brand-dot">.</span>bond
        </a>
        <nav className="topnav" aria-label="Primary navigation">
          <a className="active" href="#top">Overview</a>
          <a href="#lifecycle">Lifecycle</a>
          <a href="/pools">Pools</a>
          <a href="/launch">Launch</a>
          <a href="#devnet">Devnet lab</a>
        </nav>
        <button className={`wallet-btn ${wallet ? "connected" : ""}`} onClick={wallet ? disconnectWallet : connectWallet}>
          <WalletCards size={15} /> {connectedLabel}<span className="network-dot" />
        </button>
      </header>

      <main id="top">
        <section className="hero container">
          <div className="hero-copy">
            <div className="eyebrow"><span className="pulse-dot" /> PUBLIC DEVNET BETA / METEORA DBC</div>
            <h1>Useful work.<br /><em>Liquid value.</em></h1>
            <p>AgentBond turns AI services into redeemable markets—launching through programmable price discovery, then flowing into durable Meteora liquidity.</p>
            <div className="hero-actions">
              <a className="button button-primary" href="#devnet">Open Devnet lab <ArrowUpRight size={16} /></a>
              <a className="button button-ghost" href="#lifecycle">Explore lifecycle <ChevronRight size={16} /></a>
            </div>
            <div className="hero-note"><span>01</span> Test with Devnet assets. No mainnet funds are used in this beta.</div>
          </div>
          <div className="hero-visual">
            <div className="orbit orbit-a" /><div className="orbit orbit-b" />
            <div className="visual-core"><span className="core-glow" /><ScanLine size={42} /><b>AGNT</b><small>UTILITY SIGNAL</small></div>
            <div className="node-tag node-one"><i /> DBC <b>price discovery</b></div>
            <div className="node-tag node-two"><i /> DAMM <b>durable market</b></div>
            <div className="node-tag node-three"><i /> DLMM <b>active bands</b></div>
            <div className="visual-label"><span className="signal-dot" /> AGENT SYSTEM MAP</div>
          </div>
        </section>

        <section className="ticker"><div className="container ticker-inner"><span>PREPAID ACCESS CREDITS</span><i /><span>ON-CHAIN PRICE DISCOVERY</span><i /><span>USAGE-BACKED DEMAND</span><i /><span>DEVNET TEST ASSETS</span></div></section>

        <section id="lifecycle" className="section container">
          <div className="section-heading"><div><span className="section-kicker">THE LIFECYCLE</span><h2>From signal<br /><em>to service.</em></h2></div><p>Each Meteora primitive has a distinct job in the operating system for useful agent economies.</p></div>
          <div className="lifecycle-grid">
            <article className="lifecycle-card stage-dbc"><span className="stage-number">01</span><Gauge size={22} /><small>PRICE DISCOVERY</small><h3>DBC</h3><p>Programmable curve, fee schedule, quote mint, and graduation threshold.</p><footer>Virtual pool <ArrowUpRight size={14} /></footer></article>
            <article className="lifecycle-card stage-damm"><span className="stage-number">02</span><Layers3 size={22} /><small>DURABLE MARKET</small><h3>DAMM v2</h3><p>Graduated liquidity becomes a real market with configurable positions and locks.</p><footer>Constant-product pool <ArrowUpRight size={14} /></footer></article>
            <article className="lifecycle-card stage-dlmm"><span className="stage-number">03</span><GitBranch size={22} /><small>ACTIVE LIQUIDITY</small><h3>DLMM</h3><p>Concentrated bands and dynamic fees put capital where users actually trade.</p><footer>Liquidity bands <ArrowUpRight size={14} /></footer></article>
          </div>
        </section>

        <section id="devnet" className="section container devnet-section">
          <div className="section-heading"><div><span className="section-kicker">LIVE SOLANA DEVNET TRADING</span><h2>Connect. Preview.<br /><em>Trade.</em></h2></div><p>Swap real Devnet SOL and AGNT on the live Meteora DAMM v2 pool — the quote is fetched on-chain, and every transaction is signed non-custodially in your wallet before it hits Solana Devnet.</p></div>
          <div className="devnet-lab">
            <div className="lab-left">
              <div className="lab-status-row"><span className="network-badge"><span className="network-dot" /> SOLANA DEVNET</span><span className="lab-mode"><LockKeyhole size={13} /> TEST ASSETS ONLY</span><a href="https://faucet.solana.com/" target="_blank" rel="noreferrer">Get test SOL <ExternalLink size={11} /></a></div>
              <div className="wallet-card"><div className="icon-box blue"><WalletCards size={20} /></div><div><small>CONNECTED WALLET</small><strong>{wallet ? short(wallet) : "Not connected"}</strong><span>{wallet ? "Injected Solana provider · ready to swap" : walletProvider ? "Attach Phantom to swap" : "No Solana wallet detected — install Phantom"}</span></div><button className="button button-ghost" onClick={wallet ? disconnectWallet : connectWallet}>{wallet ? "Disconnect" : "Connect"}</button></div>
              <div className="wallet-card compact"><div><small>DEVNET WALLET STATUS</small><strong>{loading ? "Reading Devnet…" : wallet ? "Connected and synced" : "Not connected"}</strong><span>{snapshot ? `${snapshot.balance.toFixed(4)} SOL · slot ${snapshot.slot.toLocaleString()}` : "Solana Devnet balance"}</span></div><button className="text-button" onClick={() => void readDevnet(wallet ?? undefined)} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh</button></div>
              <div className="action-row"><button className="wallet-choice"><b>P</b><span><strong>Phantom</strong><small>real injected provider</small></span><CircleDot size={14} /></button></div>
              <div className="lab-actions"><button className="button button-ghost" onClick={signIn} disabled={!wallet}><ShieldCheck size={16} /> {signature ? "Signed in" : "Sign in with wallet"}</button>{signature && <span className="signature-ok"><Check size={13} /> {signature}</span>}</div>
              <div className="transaction-console"><div className="console-head"><div><span className="tiny-label">{venue === "dlmm" ? "METEORA DLMM SWAP" : "METEORA DAMM V2 SWAP"}</span><h3>Swap {inputLabel} for {outputLabel}</h3></div><span className="lab-mode">DEVNET · LIVE</span></div><div className="pool-select-row"><label className="pool-select"><span>POOL</span><select value={active.id} onChange={event => { setActiveById(event.target.value); setVenue("damm"); }}>{pools.filter(pool => pool.dammV2Pool || pool.dlmmPool).map(pool => (<option key={pool.id} value={pool.id}>{pool.name} ({pool.symbol}){pool.verified ? "" : " · unverified"}</option>))}</select></label><span className={`pool-badge ${active.verified ? "verified" : ""}`}>{badgeFor(active)}</span>{!active.verified && <span className="pool-warning" title={UNVERIFIED_DISCLAIMER}>ⓘ</span>}</div>{activeDlmmPool && <div className="mode-row venue-row"><button className={venue === "damm" ? "selected" : ""} onClick={() => setVenue("damm")}>DAMM v2 venue</button><button className={venue === "dlmm" ? "selected" : ""} onClick={() => setVenue("dlmm")}>DLMM venue</button></div>}<div className="mode-row"><button className={tradeMode === "sol-to-agnt" ? "selected" : ""} onClick={() => setTradeMode("sol-to-agnt")}>SOL → {active.symbol}</button><button className={tradeMode === "agnt-to-sol" ? "selected" : ""} onClick={() => setTradeMode("agnt-to-sol")}>{active.symbol} → SOL</button></div><label className="amount-field"><span>AMOUNT <b>{inputLabel}</b></span><input type="number" min="0.000001" step="0.001" value={amount} onChange={event => setAmount(event.target.value)} /></label><label className="amount-field compact"><span>SLIPPAGE TOLERANCE <b>%</b></span><input type="number" min="0.1" max="10" step="0.1" value={slippagePct} onChange={event => setSlippagePct(event.target.value)} /></label><div className="quote-preview">{quoting ? <p className="quote-loading"><Loader2 className="spin" size={14} /> Fetching quote…</p> : quoteError ? <p className="quote-error">{quoteError}</p> : quote ? (<><div className="quote-line"><small>ESTIMATED OUTPUT</small><strong>{fromRawAmount(quote.rawOutAmount, quote.outputDecimals).toFixed(6)} {outputLabel}</strong></div><div className="quote-line"><small>MINIMUM AFTER {(quote.slippageBps / 100).toFixed(2)}% SLIPPAGE</small><strong>{fromRawAmount(quote.rawMinimumOut, quote.outputDecimals).toFixed(6)} {outputLabel}</strong></div><div className="quote-line"><small>PRICE IMPACT</small><strong>{quote.priceImpactPct.toFixed(3)}%</strong></div></>) : <p className="quote-loading">Enter an amount to preview the swap.</p>}</div><button className="button button-primary full" onClick={sendSwapTransaction} disabled={sending || !wallet || !quote || Boolean(quoteError)}>{sending ? <Loader2 className="spin" size={16} /> : <Zap size={16} />}{sending ? "Sending to Phantom…" : !walletProvider ? "No wallet detected" : wallet ? "Send swap transaction" : "Connect wallet to swap"}</button>{swapResult && <div className="swap-result"><Check size={13} /> Received ≈ {swapResult.outAmount.toFixed(6)} {outputLabel} · <a href={getTestnetExplorerUrl(swapResult.signature)} target="_blank" rel="noreferrer">View on Explorer <ExternalLink size={11} /></a></div>}<p className="notice"><LockKeyhole size={13} /> Non-custodial: Phantom signs every transaction. Swaps use Devnet assets only; the wallet must approve each one.</p></div>
              {active.dbcPool && <LifecycleStatus pool={active} wallet={wallet} walletProvider={walletProvider as SolanaProvider | null} onMigrated={() => refreshPools()} />}
              {activeDammPool && active.baseMint && <LiquidityPanel pool={active} wallet={wallet} walletProvider={walletProvider as SolanaProvider | null} />}
              {activeDlmmPool && <DlmmLiquidityPanel pool={active} wallet={wallet} walletProvider={walletProvider as SolanaProvider | null} />}
              {active.agentWallet && <AgentServicePanel pool={active} wallet={wallet} walletProvider={walletProvider as SolanaProvider | null} />}
            </div>
            <div className="lab-right"><div className="terminal-head"><span><span className="terminal-dot" /> DEVNET RPC STATUS</span><b>{loading ? "CHECKING" : "LIVE"}</b></div><div className="stage-list"><div className="stage-row done"><span>01</span><b>Read confirmed slot</b><i><Check size={13} /></i></div><div className={`stage-row ${snapshot?.poolExists ? "done" : ""}`}><span>02</span><b>Verify DBC pool account</b><i>{snapshot?.poolExists ? <Check size={13} /> : <CircleDot size={13} />}</i></div><div className="stage-row"><span>03</span><b>Review wallet action</b><i><CircleDot size={13} /></i></div></div><div className="metrics"><div><small>SLOT</small><strong>{snapshot?.slot?.toLocaleString() ?? "—"}</strong></div><div><small>POOL</small><strong>{snapshot?.poolExists ? "FOUND" : "—"}</strong></div><div><small>NETWORK</small><strong>DEVNET</strong></div></div><div className="inspector"><div className="inspector-head"><span><Radar size={15} /> METEORA SDK INSPECTOR</span><span className="ready">LIVE RPC</span></div><p>{message}</p>{active.dbcPool && <div className="address-row"><span>DBC POOL</span><a href={explorerAddress(active.dbcPool)} target="_blank" rel="noreferrer">{short(active.dbcPool)} <ExternalLink size={12} /></a></div>}{activeDammPool && <div className="address-row"><span>DAMM V2 POOL</span><a href={explorerAddress(activeDammPool)} target="_blank" rel="noreferrer">{short(activeDammPool)} <ExternalLink size={12} /></a></div>}{active.dlmmPool && <div className="address-row"><span>DLMM POOL</span><a href={explorerAddress(active.dlmmPool)} target="_blank" rel="noreferrer">{short(active.dlmmPool)} <ExternalLink size={12} /></a></div>}<div className="address-row"><span>PROGRAM</span><a href={explorerAddress(DBC_PROGRAM)} target="_blank" rel="noreferrer">{short(DBC_PROGRAM)} <ExternalLink size={12} /></a></div>{active.baseMint && <div className="address-row"><span>BASE MINT</span><a href={explorerAddress(active.baseMint)} target="_blank" rel="noreferrer">{short(active.baseMint)} <ExternalLink size={12} /></a></div>}</div></div>
          </div>
        </section>

        <section id="pools" className="section container">
          <div className="section-heading"><div><span className="section-kicker">POOLS ON THIS BETA</span><h2>Every market,<br /><em>one registry.</em></h2></div><p>Canonical AgentBond markets and community-launched pools. Community pools are unverified — they are not affiliated with AgentBond and may carry unpriced risk.</p></div>
          <PoolsList pools={pools} activeId={active.id} onSelect={setActiveById} />
        </section>
      </main>
      <footer className="footer container"><span>agent<span className="brand-dot">.</span>bond</span><span>PUBLIC DEVNET BETA · TEST ASSETS ONLY</span><a href="https://docs.meteora.ag/developer-guides/dbc" target="_blank" rel="noreferrer">Meteora DBC docs <ExternalLink size={12} /></a></footer>
    </div>
  );
}
