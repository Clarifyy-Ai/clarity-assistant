// Route-level Suspense fallback matching app shell chrome (sidebar + header).
// After 10s of loading, surfaces a retry button + DevTools instructions link
// so users are never stuck on an indefinite spinner.

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, AlertTriangle, ExternalLink } from "lucide-react";
import { Skeleton } from "@/components/ui/SkeletonLoader";
import { Button } from "@/components/ui/button";

const STUCK_TIMEOUT_MS = 10_000;

export function AppLoadingFallback(): JSX.Element {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setStuck(true), STUCK_TIMEOUT_MS);
    return () => window.clearTimeout(t);
  }, []);

  const handleRetry = useCallback(() => {
    // Hard reload bypasses HMR + service-worker caches that commonly cause
    // a stale bundle to hang in the preview iframe.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) void registration.unregister();
      });
    }
    if (window.caches) {
      void caches.keys().then((keys) => {
        for (const key of keys) void caches.delete(key);
      });
    }
    window.setTimeout(() => window.location.reload(), 150);
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
            The app hasn&apos;t finished loading after 10 seconds. This is usually
            caused by a stale cached bundle or a slow network. Retry the page, or
            open your browser&apos;s DevTools console to check for errors.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            type="button"
            onClick={handleRetry}
            variant="primary"
            size="md"
            leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          >
            Retry
          </Button>
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
          Tip: press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl/Cmd + Shift + R</kbd> to hard-refresh and clear the cache.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[100vh] w-full overflow-hidden bg-background" aria-busy="true" aria-live="polite">
      {/* Sidebar skeleton */}
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
        {/* Top bar skeleton */}
        <header className="h-14 border-b border-border flex items-center gap-3 px-4 shrink-0">
          <Skeleton className="h-8 w-8 rounded-lg md:hidden" />
          <Skeleton className="h-6 w-40" />
          <div className="ml-auto flex gap-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
        </header>

        {/* Main content skeleton */}
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
