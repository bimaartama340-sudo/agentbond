import { ArrowUpRight, ShieldCheck, TriangleAlert } from "lucide-react";
import { badgeFor, UNVERIFIED_DISCLAIMER, type PoolRecord } from "@/lib/poolRegistry";

function short(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function explorerAddress(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function PoolsList({
  pools,
  activeId,
  onSelect,
}: {
  pools: PoolRecord[];
  activeId?: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="pools-grid">
      {pools.map(pool => (
        <article key={pool.id} className={`pool-card ${pool.id === activeId ? "selected" : ""}`}>
          <div className="pool-card-head">
            <span className={`pool-badge ${pool.verified ? "verified" : ""}`}>
              {pool.verified ? <ShieldCheck size={12} /> : <TriangleAlert size={12} />} {badgeFor(pool)}
            </span>
            <span className="pool-stage">{pool.stage === "graduated" ? "GRADUATED · DAMM V2" : "ON CURVE"}</span>
          </div>
          <h3>{pool.name} <small>({pool.symbol})</small></h3>
          <div className="pool-addresses">
            {pool.dammV2Pool && (
              <div className="address-row"><span>DAMM V2</span><a href={explorerAddress(pool.dammV2Pool)} target="_blank" rel="noreferrer">{short(pool.dammV2Pool)} <ArrowUpRight size={12} /></a></div>
            )}
            {pool.dlmmPool && (
              <div className="address-row"><span>DLMM</span><a href={explorerAddress(pool.dlmmPool)} target="_blank" rel="noreferrer">{short(pool.dlmmPool)} <ArrowUpRight size={12} /></a></div>
            )}
            {pool.dbcPool && !pool.dammV2Pool && (
              <div className="address-row"><span>DBC</span><a href={explorerAddress(pool.dbcPool)} target="_blank" rel="noreferrer">{short(pool.dbcPool)} <ArrowUpRight size={12} /></a></div>
            )}
          </div>
          {!pool.verified && <p className="pool-disclaimer">{UNVERIFIED_DISCLAIMER}</p>}
          {onSelect && (
            <button
              className="button button-ghost full"
              onClick={() => onSelect(pool.id)}
              disabled={!pool.dammV2Pool}
            >
              {pool.dammV2Pool ? "Trade this pool" : "No DAMM v2 market yet"}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}
