import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import posthog from "posthog-js";
import App from "./App";
import "./index.css";

// ── Helpers ────────────────────────────────────────────────────────────────
/** Returns true only when a key is present AND not a known placeholder */
function isRealKey(value: string | undefined, placeholderPrefixes: string[]): boolean {
  if (!value) return false;
  return !placeholderPrefixes.some((prefix) =>
    value.toLowerCase().startsWith(prefix.toLowerCase())
  );
}

// ── Sentry — error monitoring ──────────────────────────────────────────────
if (
  isRealKey(import.meta.env.VITE_SENTRY_DSN, ["your-sentry", "https://your"]) &&
  import.meta.env.VITE_APP_ENV !== "development"
) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_APP_ENV ?? "production",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText:   true,   // Privacy — mask PII in replays
        blockAllMedia: false,
      }),
    ],
    tracesSampleRate:           import.meta.env.VITE_APP_ENV === "production" ? 0.2 : 1.0,
    replaysSessionSampleRate:   0.05,
    replaysOnErrorSampleRate:   1.0,
    beforeSend(event) {
      // Strip any audio stream data from error payloads
      if (event.extra && "audioStream" in event.extra) {
        delete event.extra.audioStream;
      }
      return event;
    },
  });
}

// ── PostHog — product analytics ───────────────────────────────────────────
// Guard against the placeholder key "phc_your_posthog_key" which is truthy
// but causes a 404 when PostHog tries to load its config script.
if (isRealKey(import.meta.env.VITE_POSTHOG_KEY, ["phc_your", "your_posthog", "placeholder"])) {
  posthog.init(import.meta.env.VITE_POSTHOG_KEY, {
    api_host:         import.meta.env.VITE_POSTHOG_HOST ?? "https://app.posthog.com",
    person_profiles:  "identified_only",
    capture_pageview: false,   // We handle this manually in router
    capture_pageleave: true,
    autocapture:      false,   // Manual events only — avoid noise
    session_recording: {
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email:    true,
      },
    },
    loaded(ph) {
      if (import.meta.env.VITE_APP_ENV !== "production") {
        ph.opt_out_capturing(); // No tracking in dev/staging
      }
    },
  });
}

// ── Service Worker — PWA support ──────────────────────────────────────────
if ("serviceWorker" in navigator && import.meta.env.VITE_APP_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.warn("[SW] Registration failed:", err));
  });
}

// ── Mount React ───────────────────────────────────────────────────────────
const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error(
    "[ConfideQ] Could not find #root element. Check your index.html."
  );
}

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
  </React.StrictMode>
);
