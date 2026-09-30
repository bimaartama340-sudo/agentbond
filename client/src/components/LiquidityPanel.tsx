import { useCallback, useEffect, useState } from "react";
import { Check, Coins, ExternalLink, Loader2, Trash2 } from "lucide-react";
import {
  addDammV2Liquidity,
  executeDammV2PositionFeeClaim,
  fetchDammV2Positions,
  fromRawAmount,
  previewDammV2Deposit,
  removeDammV2Liquidity,
  type DammV2PositionSummary,
  type DammV2DepositPreview,
  type SolanaProvider,
} from "@/lib/meteora";
import type { PoolRecord } from "@/lib/poolRegistry";

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function LiquidityPanel({
  pool,
  wallet,
  walletProvider,
}: {
  pool: PoolRecord;
  wallet: string | null;
  walletProvider: SolanaProvider | null;
}) {
  const [amount, setAmount] = useState("0.01");
  const [preview, setPreview] = useState<DammV2DepositPreview | null>(null);
  const [positions, setPositions] = useState<DammV2PositionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const loadPositions = useCallback(() => {
    if (!wallet || !pool.baseMint) {
      setPositions([]);
      return;
    }
    fetchDammV2Positions({ walletAddress: wallet, baseMint: pool.baseMint })
      .then(all => setPositions(all.filter(p => p.pool === pool.dammV2Pool && p.unlockedLiquidity !== "0")))
      .catch(() => setPositions([]));
  }, [wallet, pool.baseMint, pool.dammV2Pool]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  useEffect(() => {
    const parsed = Number(amount);
    if (!pool.dammV2Pool || !Number.isFinite(parsed) || parsed <= 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      previewDammV2Deposit({ poolAddress: pool.dammV2Pool as string, quoteAmountSol: parsed })
        .then(setPreview)
        .catch(() => setPreview(null));
    }, 400);
    return () => clearTimeout(timer);
  }, [amount, pool.dammV2Pool]);

  const addLiquidity = async () => {
    if (!wallet || !walletProvider || !pool.dammV2Pool) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return setMessage("Enter a valid SOL amount");
    setBusy(true);
    setMessage(null);
    try {
      const result = await addDammV2Liquidity({
        walletAddress: wallet,
        poolAddress: pool.dammV2Pool,
        quoteAmountSol: parsed,
        provider: walletProvider,
      });
      setLastSig(result.signature);
      setMessage(`Liquidity added${result.positionNft ? ` · position ${short(result.positionNft)}` : ""}`);
      loadPositions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Add liquidity failed or was rejected");
    } finally {
      setBusy(false);
    }
  };

  const claimFees = async (position: DammV2PositionSummary) => {
    if (!wallet || !walletProvider || !pool.dammV2Pool) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await executeDammV2PositionFeeClaim({
        walletAddress: wallet,
        poolAddress: pool.dammV2Pool,
        positionAddress: position.position,
        positionNftAccount: position.positionNftAccount,
        provider: walletProvider,
      });
      setLastSig(result.signature);
      setMessage(`Fees claimed from position ${short(position.position)}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fee claim failed or was rejected");
    } finally {
      setBusy(false);
    }
  };

  const removeLiquidity = async (position: DammV2PositionSummary) => {
    if (!wallet || !walletProvider || !pool.dammV2Pool) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await removeDammV2Liquidity({
        walletAddress: wallet,
        poolAddress: pool.dammV2Pool,
        positionAddress: position.position,
        positionNftAccount: position.positionNftAccount,
        unlockedLiquidity: position.unlockedLiquidity,
        percent: 100,
        provider: walletProvider,
      });
      setLastSig(result.signature);
      setMessage("Liquidity removed (100%)");
      loadPositions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Remove liquidity failed or was rejected");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp-panel">
      <div className="lp-head"><span className="tiny-label">LIQUIDITY · {pool.symbol}/SOL</span><span className="lab-mode">DAMM V2</span></div>
      {(!wallet || !walletProvider) && <p className="lp-note">Connect a wallet to manage liquidity.</p>}
      <div className="lp-row">
        <label className="amount-field compact lp-input"><span>DEPOSIT <b>SOL</b></span><input type="number" min="0.001" step="0.001" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <button className="button button-primary" onClick={addLiquidity} disabled={busy || !wallet || !walletProvider || !pool.dammV2Pool}>
          {busy ? <Loader2 className="spin" size={14} /> : null} Add
        </button>
      </div>
      {preview && (
        <div className="quote-preview">
          <div className="quote-line"><small>YOU DEPOSIT</small><strong>{fromRawAmount(preview.quoteAmountRaw, 9).toFixed(6)} SOL</strong></div>
          <div className="quote-line"><small>POOL PAIRS IT WITH</small><strong>{fromRawAmount(preview.baseAmountRaw, preview.baseDecimals).toLocaleString(undefined, { maximumFractionDigits: 2 })} {pool.symbol}</strong></div>
        </div>
      )}
      <div className="lp-positions">
        <small>YOUR POSITIONS</small>
        {positions.length === 0 ? (
          <p className="lp-note">{wallet ? "No positions in this pool yet." : "—"}</p>
        ) : (
          positions.map(position => (
            <div key={position.position} className="lp-position-row">
              <span>{short(position.position)} · liq {position.unlockedLiquidity.slice(0, 8)}…</span>
              <span className="lp-position-actions">
                <button className="button button-ghost small" onClick={() => claimFees(position)} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={12} /> : <Coins size={12} />} Fees
                </button>
                <button className="button button-ghost small" onClick={() => removeLiquidity(position)} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={12} /> : <Trash2 size={12} />} Remove 100%
                </button>
              </span>
            </div>
          ))
        )}
      </div>
      {message && <p className="lp-note">{message}{lastSig && <> · <a href={`https://explorer.solana.com/tx/${lastSig}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer <Check size={11} /> <ExternalLink size={11} /></a></>}</p>}
      <p className="lp-note">Removal executes at the pool's current price; a position can only be removed once, in full, with this beta panel.</p>
    </div>
  );
}
