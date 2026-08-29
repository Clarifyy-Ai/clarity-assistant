// Lightweight Parakeet UX metrics (TTFP, time-to-first-hint, same-setup %).
// Client-only timestamps + optional fire-and-forget sinks. No new deps.

import { analyticsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/authStore";
import type { Json } from "@/integrations/supabase/types";
import { isAiTrainingAllowed, stripSessionTextFromPayload } from "@/lib/privacy/privacyPrefs";

const KEYS = {
  onboardingCompleteAt: "clarify:ux:onboarding_complete_at",
  firstListeningDone: "clarify:ux:first_listening_done",
  practiceStartAt: "clarify:ux:practice_start_at",
  firstHintDone: "clarify:ux:first_hint_done",
  sameSetupStarts: "clarify:ux:same_setup_starts",
  wizardStarts: "clarify:ux:wizard_starts",
} as const;

export type PracticeStartSource = "same_setup" | "wizard";

export const UX_METRICS_EVENT = "clarify:ux-metric";

type UxMetricPayload = {
  event: string;
  properties?: Record<string, unknown>;
};

function now(): number {
  return Date.now();
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / private mode
  }
}

function ssGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function ssSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function ssRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function incr(key: string): number {
  const next = (Number.parseInt(lsGet(key) ?? "0", 10) || 0) + 1;
  lsSet(key, String(next));
  return next;
}

function debug(event: string, properties?: Record<string, unknown>): void {
  if (import.meta.env.DEV) {
    console.debug(`[uxMetrics] ${event}`, properties ?? {});
  }
}

function emit(payload: UxMetricPayload): void {
  const properties = isAiTrainingAllowed()
    ? payload.properties
    : payload.properties
      ? stripSessionTextFromPayload(payload.properties)
      : payload.properties;
  debug(payload.event, properties);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(UX_METRICS_EVENT, { detail: { event: payload.event, properties } }));
  }

  // Optional PostHog (already initialized in main.tsx when keyed)
  try {
    const ph = (window as unknown as { posthog?: { capture?: (e: string, p?: object) => void } })
      .posthog;
    ph?.capture?.(payload.event, properties);
  } catch {
    // ignore
  }

  // Optional analytics table — fire-and-forget when user is known
  try {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;
    void analyticsDB.track({
      user_id: userId,
      event_type: payload.event,
      properties: (properties ?? null) as Json,
    });
  } catch {
    // ignore
  }
}

/** Call when onboarding finishes successfully (TTFP start). */
export function markOnboardingComplete(): void {
  const ts = now();
  lsSet(KEYS.onboardingCompleteAt, String(ts));
  // Allow a new TTFP measurement after re-onboarding
  try {
    localStorage.removeItem(KEYS.firstListeningDone);
  } catch {
    // ignore
  }
  emit({ event: "ux_onboarding_complete", properties: { at: ts } });
}

/** Call when user starts Practice Coach (same-setup vs wizard). */
export function markPracticeStart(opts: { source: PracticeStartSource }): void {
  const ts = now();
  ssSet(KEYS.practiceStartAt, String(ts));
  ssRemove(KEYS.firstHintDone);

  const countKey =
    opts.source === "same_setup" ? KEYS.sameSetupStarts : KEYS.wizardStarts;
  const count = incr(countKey);
  const same = Number.parseInt(lsGet(KEYS.sameSetupStarts) ?? "0", 10) || 0;
  const wizard = Number.parseInt(lsGet(KEYS.wizardStarts) ?? "0", 10) || 0;
  const total = same + wizard;
  const sameSetupPct = total > 0 ? Math.round((same / total) * 100) : 0;

  emit({
    event: "ux_practice_start",
    properties: {
      source: opts.source,
      source_count: count,
      same_setup_starts: same,
      wizard_starts: wizard,
      same_setup_pct: sameSetupPct,
      at: ts,
    },
  });
}

/**
 * Call when Practice Coach session becomes active / listening.
 * Computes TTFP once from onboarding complete → first listening.
 */
export function markFirstListening(): void {
  if (lsGet(KEYS.firstListeningDone) === "1") return;

  const ts = now();
  const onboardRaw = lsGet(KEYS.onboardingCompleteAt);
  const onboardAt = onboardRaw ? Number.parseInt(onboardRaw, 10) : NaN;
  const ttfpMs = Number.isFinite(onboardAt) ? Math.max(0, ts - onboardAt) : null;

  lsSet(KEYS.firstListeningDone, "1");

  emit({
    event: "ux_first_listening",
    properties: {
      at: ts,
      ttfp_ms: ttfpMs,
      has_onboarding_mark: Number.isFinite(onboardAt),
    },
  });
}

/**
 * Call when the first AI hint/answer content is shown in a session.
 * Computes session_start → first hint once per practice start.
 */
export function markFirstHint(): void {
  if (ssGet(KEYS.firstHintDone) === "1") return;

  const ts = now();
  const startRaw = ssGet(KEYS.practiceStartAt);
  const startAt = startRaw ? Number.parseInt(startRaw, 10) : NaN;
  const timeToFirstHintMs = Number.isFinite(startAt) ? Math.max(0, ts - startAt) : null;

  ssSet(KEYS.firstHintDone, "1");

  emit({
    event: "ux_first_hint",
    properties: {
      at: ts,
      time_to_first_hint_ms: timeToFirstHintMs,
      has_practice_start: Number.isFinite(startAt),
    },
  });
}
