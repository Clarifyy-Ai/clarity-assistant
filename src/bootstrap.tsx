// src/bootstrap.tsx
//
// The actual app boot sequence (observability, service worker, DOM mount
// guards, React mount). Split out from src/main.tsx and loaded via a dynamic
// import so that a thrown error anywhere in this module's dependency graph
// (most notably src/lib/env.ts failing fast on a missing VITE_SUPABASE_URL)
// rejects a catchable promise instead of crashing the whole entry script
// before any error UI can be shown. See src/main.tsx for the catch site.

import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import App from "./App";
import { isElectronApp } from "@/lib/platform/isElectron";
import { logSupabaseHealth } from "@/lib/supabase/healthCheck";
import {
  readLocalObservabilityPrefs,
  isCrashReportingEnabled,
  isAiTrainingAllowed,
  stripSessionTextFromPayload,
} from "@/lib/privacy/privacyPrefs";
import { isExpectedBusinessFailure } from "@/lib/network/businessConflict";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Returns true only when a key is present AND not a known placeholder */
function isRealKey(value: string | undefined, placeholderPrefixes: string[]): boolean {
  if (!value) return false;
  return !placeholderPrefixes.some((prefix) =>
    value.toLowerCase().startsWith(prefix.toLowerCase()),
  );
}

function readSentryString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() && value !== "[REDACTED]"
    ? value.trim()
    : undefined;
}

function readSentryStatus(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** Drop expected product conflicts (HTTP 409 / credit-inventory codes) from Sentry. */
function isExpectedBusinessSentryEvent(event: {
  extra?: Record<string, unknown>;
  tags?: Record<string, unknown>;
}): boolean {
  const extra = event.extra ?? {};
  const tags = event.tags ?? {};
  const codes = [
    readSentryString(extra.code),
    readSentryString(extra.errorCode),
    readSentryString(tags.code),
  ].filter((value): value is string => Boolean(value));
  const statuses = [
    readSentryStatus(extra.httpStatus),
    readSentryStatus(extra.status),
    readSentryStatus(tags.httpStatus),
    readSentryStatus(tags.status),
  ].filter((value): value is number => value !== undefined);

  if (statuses.some((status) => isExpectedBusinessFailure(status))) return true;
  return codes.some((code) => isExpectedBusinessFailure(0, code));
}

// ── Sentry — error monitoring ──────────────────────────────────────────────
const bootPrivacy = readLocalObservabilityPrefs();
if (
  isRealKey(import.meta.env.VITE_SENTRY_DSN, ["your-sentry", "https://your"]) &&
  import.meta.env.VITE_APP_ENV !== "development"
) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    enabled: bootPrivacy.crash_reporting,
    environment: import.meta.env.VITE_APP_ENV || "development",
    release: `Career Pilot@${import.meta.env.VITE_APP_VERSION || "1.0.0"}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Chrome DevTools injects web-vitals that can throw on SPA soft-nav:
    // "Cannot read properties of undefined (reading 'startTime')" via reportAllChanges.
    // That is not Interview Scheduler code (no app reportAllChanges / startTime field).
    ignoreErrors: [
      /Cannot read properties of undefined \(reading 'startTime'\)/,
      /Cannot read property 'startTime' of undefined/,
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 1.0 : 0,
    beforeSend(event) {
      if (!isCrashReportingEnabled()) return null;
      if (isExpectedBusinessSentryEvent(event)) return null;
      if (event.extra && "audioStream" in event.extra) {
        delete event.extra.audioStream;
      }
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map((b) => {
          if (b.data?.url)
            b.data.url = b.data.url.replace(/token=[^&]+/, "token=[REDACTED]");
          return b;
        });
      }
      if (!isAiTrainingAllowed()) {
        if (event.extra) event.extra = stripSessionTextFromPayload(event.extra);
        if (event.contexts) event.contexts = stripSessionTextFromPayload(event.contexts);
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((b) => ({
            ...b,
            data: b.data ? stripSessionTextFromPayload(b.data) : b.data,
          }));
        }
      }
      return event;
    },
  });
}

// ── PostHog — product analytics ───────────────────────────────────────────
if (isRealKey(import.meta.env.VITE_POSTHOG_KEY, ["phc_your", "your_posthog", "placeholder"])) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host:          import.meta.env.VITE_POSTHOG_HOST ?? "https://app.posthog.com",
    person_profiles:   "identified_only",
    capture_pageview:  false,  // Handled manually in router
    capture_pageleave: true,
    autocapture:       false,  // Manual events only
    session_recording: {
      maskAllInputs:    true,
      maskInputOptions: { password: true, email: true },
    },
    loaded(ph) {
      if (import.meta.env.VITE_APP_ENV !== "production") {
        ph.opt_out_capturing(); // No tracking in dev/staging
      }
      if (!bootPrivacy.analytics_tracking) {
        ph.opt_out_capturing();
      }
    },
    sanitize_properties(props) {
      if (isAiTrainingAllowed()) return props;
      return stripSessionTextFromPayload(props ?? {});
    },
  });
}

// ── Service Worker — PWA support (web only; breaks on file:// in Electron) ──
if (!isElectronApp() && "serviceWorker" in navigator) {
  if (
    import.meta.env.DEV ||
    import.meta.env.VITE_APP_ENV === "development" ||
    import.meta.env.VITE_APP_ENV === "test"
  ) {
    // Dev: drop any stale SW/cache from production builds (prevents blank screen).
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) void reg.unregister();
    });
    void caches.keys().then((keys) => {
      for (const key of keys) void caches.delete(key);
    });
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => console.warn("[SW] Registration failed:", err));
    });
  }
}

// ── DOM mount guards ──────────────────────────────────────────────────────
// These checks run synchronously before React mounts so any DOM issue is
// caught with a clear error rather than a cryptic React tree failure.

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error(
    "[Career Pilot] #root element not found. Check your index.html.",
  );
}

// Defensive guard: index.html declares <div id="overlay-root"></div> as a
// sibling of #root. If a CDN, browser extension, or HTML-rewriting proxy
// strips it, recreate it here so OverlayWindow never has to fall back to
// document.body. In the common case (HTML intact) this is a single getElementById.
(function ensureOverlayRoots() {
  const ROOT_IDS = ["overlay-root", "clarify-overlay-root"];
  for (const id of ROOT_IDS) {
    if (document.getElementById(id)) continue;
    console.warn(`[Career Pilot] #${id} missing from HTML — recreating it.`);
    const el = document.createElement("div");
    el.id = id;
    el.style.cssText =
      `position:fixed;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:1100;isolation:isolate;`;
    document.body.appendChild(el);
  }
})();

// ── Web Vitals — Core Web Vitals reporting (web only) ─────────────────────
if (import.meta.env.PROD && !isElectronApp()) {
  import("web-vitals").then(({ onCLS, onINP, onLCP, onFCP, onTTFB }) => {
    const reportMetric = (metric: { name: string; value: number }) => {
      if ((window as any).posthog) {
        (window as any).posthog.capture("web_vital", {
          metric: metric.name,
          value: metric.value,
        });
      }
    };
    onCLS(reportMetric);
    onINP(reportMetric);
    onLCP(reportMetric);
    onFCP(reportMetric);
    onTTFB(reportMetric);
  });
}

// ── Mount React ───────────────────────────────────────────────────────────
// Keep #boot-splash until React's first commit replaces #root children.
// Removing it here flashes an empty root between bundle parse and paint.

// Runtime check: confirm Supabase env + connectivity. Non-blocking.
void logSupabaseHealth();

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
          <div className="text-4xl">⚠️</div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-md text-center text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "An unexpected error occurred."}
          </p>
          <button
            onClick={resetError}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="text-sm text-muted-foreground underline underline-offset-4"
          >
            Go home
          </a>
        </div>
      )}
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
