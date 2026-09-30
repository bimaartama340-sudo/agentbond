import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Trash2 } from "lucide-react";
import {
  addDlmmLiquidity,
  fetchDlmmPositions,
  fromRawAmount,
  removeDlmmLiquidity,
  type DlmmPositionSummary,
  type SolanaProvider,
} from "@/lib/meteora";
import type { PoolRecord } from "@/lib/poolRegistry";

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * DLMM liquidity management: one-sided SOL deposits in bins just below the
 * active price, and percentage-based removal per position.
 */
export function DlmmLiquidityPanel({
  pool,
  wallet,
  walletProvider,
}: {
  pool: PoolRecord;
  wallet: string | null;
  walletProvider: SolanaProvider | null;
}) {
  const [amount, setAmount] = useState("0.05");
  const [positions, setPositions] = useState<DlmmPositionSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);

  const loadPositions = useCallback(() => {
    if (!wallet || !pool.dlmmPool) {
      setPositions([]);
      return;
    }
    fetchDlmmPositions({ walletAddress: wallet, poolAddress: pool.dlmmPool })
      .then(all => setPositions(all.filter(p => p.xRaw !== "0" || p.yRaw !== "0")))
      .catch(() => setPositions([]));
  }, [wallet, pool.dlmmPool]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const addLiquidity = async () => {
    if (!wallet || !walletProvider || !pool.dlmmPool) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return setMessage("Enter a valid SOL amount");
    setBusy(true);
    setMessage(null);
    try {
      const result = await addDlmmLiquidity({
        walletAddress: wallet,
        poolAddress: pool.dlmmPool,
        amountSol: parsed,
        provider: walletProvider,
      });
      setLastSig(result.signature);
      setMessage(`Bid ladder added · position ${short(result.position)}`);
      loadPositions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Add liquidity failed or was rejected");
    } finally {
      setBusy(false);
    }
  };

  const removeLiquidity = async (position: DlmmPositionSummary, percent: number) => {
    if (!wallet || !walletProvider || !pool.dlmmPool) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await removeDlmmLiquidity({
        walletAddress: wallet,
        poolAddress: pool.dlmmPool,
        positionAddress: position.position,
        lowerBinId: position.lowerBinId,
        upperBinId: position.upperBinId,
        percent,
        provider: walletProvider,
      });
      setLastSig(result.signature);
      setMessage(`Removed ${percent}% of position ${short(position.position)}`);
      loadPositions();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Remove liquidity failed or was rejected");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp-panel">
      <div className="lp-head"><span className="tiny-label">LIQUIDITY · {pool.symbol}/SOL BINS</span><span className="lab-mode">DLMM</span></div>
      {(!wallet || !walletProvider) && <p className="lp-note">Connect a wallet to manage DLMM liquidity.</p>}
      <div className="lp-row">
        <label className="amount-field compact lp-input"><span>DEPOSIT <b>SOL</b></span><input type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <button className="button button-primary" onClick={addLiquidity} disabled={busy || !wallet || !walletProvider || !pool.dlmmPool}>
          {busy ? <Loader2 className="spin" size={14} /> : null} Add bid ladder
        </button>
      </div>
      <div className="lp-positions">
        <small>YOUR POSITIONS</small>
        {positions.length === 0 ? (
          <p className="lp-note">{wallet ? "No DLMM positions in this pool yet." : "—"}</p>
        ) : (
          positions.map(position => (
            <div key={position.position} className="lp-position-row">
              <span>
                {short(position.position)} · bins {position.lowerBinId}…{position.upperBinId} ·{" "}
                {fromRawAmount(position.yRaw, 9).toFixed(4)} SOL +{" "}
                {fromRawAmount(position.xRaw, 6).toFixed(2)} {pool.symbol}
              </span>
              <span className="lp-position-actions">
                <button className="button button-ghost small" onClick={() => removeLiquidity(position, 50)} disabled={busy}>
                  50%
                </button>
                <button className="button button-ghost small" onClick={() => removeLiquidity(position, 100)} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={12} /> : <Trash2 size={12} />} 100%
                </button>
              </span>
            </div>
          ))
        )}
      </div>
      {message && <p className="lp-note">{message}{lastSig && <> · <a href={`https://explorer.solana.com/tx/${lastSig}?cluster=devnet`} target="_blank" rel="noreferrer">Explorer <Check size={11} /> <ExternalLink size={11} /></a></>}</p>}
      <p className="lp-note">Deposits sit in bins just below the active price (bids). Removal executes at the current bin prices; removing 100% also closes the position.</p>
    </div>
  );
}
