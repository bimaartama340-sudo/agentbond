import { useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { readNotificationPreferences, saveNotificationPreferences, subscribeToNotificationPreferences, type NotificationPreferences } from "@/lib/notificationPreferences";
import ErrorBoundary, { MeteoraErrorBoundary } from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Pools from "./pages/Pools";
import Launch from "./pages/Launch";
import { PoolProvider } from "./context/PoolContext";

function SessionExpiryNotifier() {
  const { isAuthenticated } = useAuth();
  const sessionQuery = trpc.auth.session.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 60_000 });
  const preferencesQuery = trpc.notifications.preferences.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 300_000 });
  const expiringQuery = trpc.staking.expiring.useQuery(undefined, { enabled: isAuthenticated, refetchInterval: 300_000 });
  const [preferences, setPreferences] = useState<NotificationPreferences>(readNotificationPreferences);
  const notifiedSessionRef = useRef(false);
  const notifiedPositionIds = useRef<Set<number>>(new Set());
  const minutesRemaining = sessionQuery.data ? Math.max(0, Math.floor((sessionQuery.data - Date.now()) / 60_000)) : null;

  useEffect(() => {
    const unsubscribe = subscribeToNotificationPreferences(() => setPreferences(readNotificationPreferences()));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (preferencesQuery.data) {
      setPreferences(preferencesQuery.data);
      saveNotificationPreferences(preferencesQuery.data);
    }
  }, [preferencesQuery.data]);

  useEffect(() => {
    if (preferences.sessionExpiry && minutesRemaining !== null && minutesRemaining > 0 && minutesRemaining <= 15 && !notifiedSessionRef.current) {
      notifiedSessionRef.current = true;
      toast.warning(`Session expires in about ${minutesRemaining} minutes`, { description: "Sign in again to keep access to your private staking history.", duration: 12_000, action: { label: "Sign in again", onClick: () => startLogin() } });
    }
    if (!preferences.sessionExpiry || minutesRemaining === null || minutesRemaining > 15) notifiedSessionRef.current = false;
  }, [minutesRemaining, preferences.sessionExpiry]);

  useEffect(() => {
    if (!preferences.stakingExpiry) return;
    expiringQuery.data?.forEach((position) => {
      if (notifiedPositionIds.current.has(position.id)) return;
      notifiedPositionIds.current.add(position.id);
      const expiresAt = new Date(position.expiresAt).toLocaleDateString();
      toast.warning("Staking position nearing unlock", { description: `${position.amount.toLocaleString()} AGNT on ${position.walletAddress} expires around ${expiresAt}.`, duration: 12_000 });
    });
    if (!expiringQuery.data?.length) notifiedPositionIds.current.clear();
  }, [expiringQuery.data, preferences.stakingExpiry]);

  return null;
}

function MeteoraHome() {
  return (
    <MeteoraErrorBoundary>
      <Home />
    </MeteoraErrorBoundary>
  );
}
function Router() { return <PoolProvider><Switch><Route path="/" component={MeteoraHome} /><Route path="/pools" component={Pools} /><Route path="/launch" component={Launch} /><Route path="/profile" component={Profile} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></PoolProvider>; }

export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster position="bottom-right" theme="dark" /><SessionExpiryNotifier /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
