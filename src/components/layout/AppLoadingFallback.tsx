// Route-level Suspense / auth hydration fallback matching app shell chrome.
// Soft stuck UI after soft budget; hard reload only when the user chooses Reload.

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, AlertTriangle, ExternalLink, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";
import {
  hardReloadApp,
  supportMailto,
} from "@/lib/auth/recoveryActions";

/**
 * Soft stuck UI after soft budget; hard reload only when the user chooses Reload.
 * Budget: session ≤8s + profile ≤6s × 2 attempts ≈ 20s (role no longer blocks paint).
 */
const STUCK_TIMEOUT_MS = 22_000;

export function AppLoadingFallback(): JSX.Element {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), STUCK_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, []);

  const handleSoftRetry = useCallback(() => {
    void useAuthStore.getState().retryAccountLoad();
    setStuck(false);
  }, []);

  const handleHardReload = useCallback(() => {
    hardReloadApp();
  }, []);

  if (stuck) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="flex h-[100vh] w-full flex-col items-center justify-center gap-6 bg-background px-6 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden="true" />
        </div>
        <div className="flex max-w-md flex-col gap-2">
          <h2 className="text-xl font-semibold text-foreground">
            This is taking longer than expected
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We couldn&apos;t load your account. Please try again.
            If this keeps happening, reload the page or contact support.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            onClick={handleSoftRetry}
            variant="primary"
            size="md"
            leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          >
            Try again
          </Button>
          <Button
            type="button"
            onClick={handleHardReload}
            variant="outline"
            size="md"
          >
            Reload
          </Button>
          <a
            href={supportMailto("Career Pilot loading help")}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            Contact support
          </a>
          <a
            href="https://developer.chrome.com/docs/devtools/open"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            How to open DevTools
          </a>
        </div>
        <p className="max-w-md text-xs text-muted-foreground">
          Tip: press{" "}
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
            Ctrl/Cmd + Shift + R
          </kbd>{" "}
          to hard-refresh and clear the cache.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[100vh] w-full overflow-hidden bg-background" aria-busy="true" aria-live="polite">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card/40 p-4 gap-4">
        <Skeleton className="h-8 w-32" />
        <div className="space-y-2 mt-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-xl mt-auto" />
      </aside>

      <div className="flex flex-1 flex-col min-w-0">
        <header className="h-14 border-b border-border flex items-center gap-3 px-4 shrink-0">
          <Skeleton className="h-8 w-8 rounded-lg md:hidden" />
          <Skeleton className="h-6 w-40" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </header>

        <main className="flex-1 overflow-hidden p-4 md:p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            <Skeleton className="h-8 w-56" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <Skeleton className="h-48 rounded-2xl" />
                <Skeleton className="h-40 rounded-2xl" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-36 rounded-2xl" />
                <Skeleton className="h-28 rounded-2xl" />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppLoadingFallback;
