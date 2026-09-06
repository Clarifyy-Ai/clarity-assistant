import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";

const SLOW_HINT_MS = 12_000;

export function useSettingsBootstrap() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const authStatus = useAuthStore((s) => s.status);
  const authError = useAuthStore((s) => s.error);
  const loadProfile = useAuthStore((s) => s.loadProfile);
  const retryAccountLoad = useAuthStore((s) => s.retryAccountLoad);

  const [slowHint, setSlowHint] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const ready = Boolean(user?.id && isProfileLoaded && profile?.id);
  const loading = Boolean(user?.id && !ready && authStatus !== "error");

  useEffect(() => {
    if (!user?.id || ready) return;
    void loadProfile({ background: true });
  }, [user?.id, ready, loadProfile]);

  useEffect(() => {
    if (!loading) {
      setSlowHint(false);
      return;
    }
    const timer = window.setTimeout(() => setSlowHint(true), SLOW_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [loading]);

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const ok = await retryAccountLoad();
      if (!ok && !useAuthStore.getState().profile?.id) {
        await loadProfile({ force: true });
      }
    } finally {
      setRetrying(false);
    }
  }, [loadProfile, retryAccountLoad]);

  return {
    ready,
    loading,
    slowHint,
    retrying,
    error: authStatus === "error" ? authError : null,
    retry,
  };
}
