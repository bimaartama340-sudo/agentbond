import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getPool, listPools, setDiscoveredPools, type PoolRecord } from "@/lib/poolRegistry";
import { discoverPools } from "@/lib/discovery";

type PoolContextValue = {
  pools: PoolRecord[];
  active: PoolRecord;
  setActiveById: (id: string) => boolean;
  refreshPools: () => void;
  discoverOnChain: () => Promise<number>;
  discovering: boolean;
};

const PoolContext = createContext<PoolContextValue | null>(null);

export function PoolProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string>("agnt-canonical");
  const [version, setVersion] = useState(0);
  const [discovering, setDiscovering] = useState(false);
  const pools = useMemo(() => listPools(), [version]);
  const active = useMemo(() => getPool(activeId) ?? pools[0], [activeId, pools]);
  const setActiveById = useCallback((id: string) => Boolean(getPool(id) && (setActiveId(id), true)), []);
  const refreshPools = useCallback(() => setVersion(version => version + 1), []);
  const discoverOnChain = useCallback(async () => {
    setDiscovering(true);
    try {
      const found = await discoverPools();
      setDiscoveredPools(found);
      setVersion(current => current + 1);
      return found.length;
    } catch {
      return 0;
    } finally {
      setDiscovering(false);
    }
  }, []);
  useEffect(() => {
    void discoverOnChain();
  }, [discoverOnChain]);
  const value = useMemo(
    () => ({ pools, active, setActiveById, refreshPools, discoverOnChain, discovering }),
    [pools, active, setActiveById, refreshPools, discoverOnChain, discovering]
  );
  return <PoolContext.Provider value={value}>{children}</PoolContext.Provider>;
}

export function usePools() {
  const value = useContext(PoolContext);
  if (!value) throw new Error("usePools must be used inside PoolProvider");
  return value;
}
