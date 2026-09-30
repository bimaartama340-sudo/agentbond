import { useCallback, useEffect, useState } from "react";
import { Check, Coins, ExternalLink, Loader2, Rocket } from "lucide-react";
import {
  executeDammV2Migration,
  executeDbcCreatorFeeClaim,
  fetchDbcCurveProgress,
  fetchDbcCreatorFees,
  fromRawAmount,
  getTestnetExplorerUrl,
  type DbcCreatorFeeSummary,
  type SolanaProvider,
} from "@/lib/meteora";
import { updateUserPool, type PoolRecord } from "@/lib/poolRegistry";

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export function LifecycleStatus({
  pool,
  wallet,
  walletProvider,
  onMigrated,
}: {
  pool: PoolRecord;
  wallet: string | null;
  walletProvider: SolanaProvider | null;
  onMigrated: (dammV2Pool: string) => void;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [isMigrated, setIsMigrated] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [creatorFees, setCreatorFees] = useState<DbcCreatorFeeSummary | null>(null);

  const isCreator = Boolean(wallet && pool.creator && pool.creator === wallet);

  const load = useCallback(() => {
    if (!pool.dbcPool) {
      setProgress(null);
      setIsMigrated(null);
      return;
    }
    fetchDbcCurveProgress(pool.dbcPool)
      .then(result => {
        setProgress(result.quoteProgress);
        setIsMigrated(result.isMigrated);
      })
      .catch(() => {});
  }, [pool.dbcPool]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pool.dbcPool) {
      setCreatorFees(null);
      return;
    }
    fetchDbcCreatorFees(pool.dbcPool)
      .then(setCreatorFees)
      .catch(() => setCreatorFees(null));
  }, [pool.dbcPool, lastSig]);

  const claimCreatorFees = async () => {
    if (!wallet || !walletProvider || !pool.dbcPool) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await executeDbcCreatorFeeClaim({
        walletAddress: wallet,
        poolAddress: pool.dbcPool,
        provider: walletProvider,
      });
      setLastSig(result.signature);
      setMessage("Creator trading fees claimed");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fee claim failed or was rejected");
    } finally {
      setBusy(false);
    }
  };

  const graduate = async () => {
    if (!wallet || !walletProvider || !pool.dbcPool) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await executeDammV2Migration({
        walletAddress: wallet,
        poolAddress: pool.dbcPool,
        provider: walletProvider,
      });
      setLastSig(result.signature);
      if (result.dammPool) {
        updateUserPool(pool.id, { dammV2Pool: result.dammPool, stage: "graduated" });
        onMigrated(result.dammPool);
        setMessage("Graduation confirmed — DAMM v2 market is live");
      } else {
        setMessage("Graduation confirmed — DAMM v2 pool derivation pending");
      }
      load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Graduation failed or was rejected");
    } finally {
      setBusy(false);
    }
  };

  if (!pool.dbcPool) return null;

  const stage = isMigrated
    ? "MIGRATED TO DAMM V2"
    : progress !== null && progress >= 100
      ? "READY TO GRADUATE"
      : "PRICE DISCOVERY · DBC CURVE";

  return (
    <div className="lifecycle-status">
      <div className="lifecycle-status-head">
        <span className="tiny-label">LIFECYCLE · {pool.symbol}</span>
        <span className={`lifecycle-stage ${isMigrated ? "done" : progress !== null && progress >= 100 ? "ready" : ""}`}>
          {stage}
        </span>
      </div>
      {isMigrated ? (
        <p className="lp-note">
          The bonding curve completed and liquidity moved to DAMM v2. Trade and manage liquidity there.
        </p>
      ) : (
        <>
          <div className="lifecycle-progress">
            <div className="lifecycle-progress-bar">
              <i style={{ width: `${Math.min(Math.max(progress ?? 0, 0), 100)}%` }} />
            </div>
            <b>{progress === null ? "—" : `${Math.min(progress, 100).toFixed(1)}%`}</b>
          </div>
          <button
            className="button button-ghost full"
            onClick={graduate}
            disabled={busy || !wallet || !walletProvider || progress === null || progress < 100}
          >
            {busy ? <Loader2 className="spin" size={15} /> : <Rocket size={15} />}
            {busy
              ? "Sending migration to Phantom…"
              : progress !== null && progress >= 100
                ? "Trigger graduation"
                : "Curve not complete yet"}
          </button>
        </>
      )}
      {message && (
        <p className="lp-note">
          {message}
          {lastSig && (
            <>
              {" · "}
              <a href={getTestnetExplorerUrl(lastSig)} target="_blank" rel="noreferrer">
                Explorer <ExternalLink size={11} /> <Check size={11} />
              </a>
            </>
          )}
        </p>
      )}
      {progress !== null && !isMigrated && (
        <p className="lp-note">
          Graduation is permissionless: once the curve reaches 100%, any wallet can migrate the pool to DAMM v2.
        </p>
      )}
      {pool.dammV2Pool && <p className="lp-note">DAMM v2 pool: {short(pool.dammV2Pool)}</p>}
      {isCreator && creatorFees && (creatorFees.unclaimedBaseRaw !== "0" || creatorFees.unclaimedQuoteRaw !== "0") && (
        <div className="lp-row" style={{ marginTop: 12 }}>
          <span className="lp-note" style={{ margin: 0 }}>
            Creator fees: {fromRawAmount(creatorFees.unclaimedBaseRaw, 6).toFixed(4)} {pool.symbol} +{" "}
            {fromRawAmount(creatorFees.unclaimedQuoteRaw, 9).toFixed(6)} SOL
          </span>
          <button className="button button-ghost small" onClick={claimCreatorFees} disabled={busy}>
            {busy ? <Loader2 className="spin" size={12} /> : <Coins size={12} />} Claim
          </button>
        </div>
      )}
      {isCreator && <p className="lp-note">You are the creator of this pool — unclaimed trading fees appear here.</p>}
    </div>
  );
}
