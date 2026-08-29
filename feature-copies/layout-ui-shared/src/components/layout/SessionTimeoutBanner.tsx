import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Clock, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { assignLoginWithReturnTo } from "@/lib/auth/safeReturnTo";
import { cn } from "@/lib/utils";

const WARN_BEFORE_MS = 5 * 60 * 1000;
const TICK_MS = 30_000;

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

export function SessionTimeoutBanner() {
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const signOut = useAuthStore((s) => s.signOut);
  const location = useLocation();

  const [showWarning, setShowWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [extending, setExtending] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const forcedSignOutRef = useRef(false);

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const forceSignOut = useCallback(async () => {
    if (forcedSignOutRef.current) return;
    forcedSignOutRef.current = true;
    clearTick();
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    try {
      await signOut();
    } finally {
      assignLoginWithReturnTo({ returnTo, reason: "session_expired" });
    }
  }, [clearTick, signOut, location]);

  const evaluateExpiry = useCallback(() => {
    const expiresAt = session?.expires_at;
    if (!expiresAt) {
      setShowWarning(false);
      setRemainingMs(null);
      return;
    }

    const expiryMs = expiresAt * 1000;
    const msLeft = expiryMs - Date.now();

    if (msLeft <= 0) {
      setShowWarning(true);
      setRemainingMs(0);
      void forceSignOut();
      return;
    }

    if (msLeft <= WARN_BEFORE_MS) {
      setShowWarning(true);
      setRemainingMs(msLeft);
    } else {
      setShowWarning(false);
      setRemainingMs(null);
    }
  }, [session?.expires_at, forceSignOut]);

  useEffect(() => {
    forcedSignOutRef.current = false;
    clearTick();
    evaluateExpiry();

    if (!session?.expires_at) return;

    tickRef.current = setInterval(evaluateExpiry, TICK_MS);
    return clearTick;
  }, [session?.expires_at, evaluateExpiry, clearTick]);

  async function handleExtend() {
    setExtending(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) throw error;
      if (!data.session) throw new Error("Session refresh returned no session");
      setSession(data.session as Parameters<typeof setSession>[0]);
      setShowWarning(false);
      setRemainingMs(null);
    } catch (err) {
      console.error("[SessionTimeoutBanner] refresh failed:", err);
      await forceSignOut();
    } finally {
      setExtending(false);
    }
  }

  if (!showWarning || remainingMs === null) return null;

  const expired = remainingMs <= 0;

  return (
    <div
      className={cn(
        "w-full flex-shrink-0 border-b border-border backdrop-blur",
        expired ? "bg-red-500/10 text-red-300" : "bg-amber-500/10 text-amber-300",
      )}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center rounded-md border border-border bg-secondary p-1.5">
          <Clock className="h-4 w-4" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {expired ? "Your session has expired" : "Your session is expiring soon"}
          </p>
          <p className="text-xs opacity-80">
            {expired
              ? "Signing you out — please sign in again to continue."
              : `You'll be signed out in ${formatRemaining(remainingMs)} unless you extend.`}
          </p>
        </div>

        {!expired && (
          <Button
            variant="secondary"
            size="sm"
            loading={extending}
            onClick={() => void handleExtend()}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
            aria-label="Extend session to stay signed in"
          >
            Extend session
          </Button>
        )}
      </div>
    </div>
  );
}
