// Privacy preference helpers — parse profiles.privacy_prefs and apply
// live consumers (PostHog, Sentry, Edge training-consent, transcript skip).
// This module must not import authStore or database.ts (cycle risk).

import * as Sentry from "@sentry/react";
import posthog from "posthog-js";

export type PrivacyPrefs = {
  allow_ai_training: boolean;
  store_transcripts: boolean;
  analytics_tracking: boolean;
  crash_reporting: boolean;
  share_scorecard: boolean;
};

/** Keys that still have a live consumer after decorative toggles were removed. */
export const PRIVACY_ENFORCEMENT: Record<
  keyof PrivacyPrefs,
  { stored: boolean; enforced: boolean; consumer: string }
> = {
  allow_ai_training: {
    stored: true,
    enforced: true,
    consumer:
      "x-ai-training-consent on AI Edge calls; session text omitted from PostHog/Sentry when off",
  },
  store_transcripts: {
    stored: true,
    enforced: true,
    consumer: "session_transcripts inserts skipped when off; live overlay transcript stays in memory",
  },
  analytics_tracking: {
    stored: true,
    enforced: true,
    consumer: "PostHog capturing opt-in/out",
  },
  crash_reporting: {
    stored: true,
    enforced: true,
    consumer: "Sentry error reporting opt-out",
  },
  share_scorecard: {
    stored: true,
    enforced: true,
    consumer: "shareScorecard public token + Scorecard Share button",
  },
};

/**
 * Missing allow_ai_training defaults false: we do not claim session data is used
 * for model training. Other prefs default on (opt-out), matching current product.
 */
export const DEFAULT_PRIVACY_PREFS: PrivacyPrefs = {
  allow_ai_training: false,
  store_transcripts: true,
  analytics_tracking: true,
  crash_reporting: true,
  share_scorecard: true,
};

const LS = {
  analytics: "clarify:privacy:analytics_tracking",
  crash: "clarify:privacy:crash_reporting",
  training: "clarify:privacy:allow_ai_training",
} as const;

const SESSION_TEXT_KEYS = new Set([
  "transcript",
  "full_transcript",
  "transcript_chunk",
  "utterance",
  "utterances",
  "session_text",
  "document",
  "document_text",
  "resume",
  "prompt",
  "answer",
  "answer_text",
  "notes",
  "content",
]);

let crashReportingEnabled = DEFAULT_PRIVACY_PREFS.crash_reporting;
let allowAiTrainingEnabled = DEFAULT_PRIVACY_PREFS.allow_ai_training;

function readBool(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1) return true;
  if (raw === "false" || raw === 0) return false;
  return fallback;
}

/** Coerce profile privacy JSON — supports legacy keys and string booleans. */
export function resolveShareScorecardAllowed(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_PRIVACY_PREFS.share_scorecard;
  }
  const src = raw as Record<string, unknown>;
  if ("share_scorecard" in src) {
    return readBool(src.share_scorecard, DEFAULT_PRIVACY_PREFS.share_scorecard);
  }
  if ("allow_scorecard_sharing" in src) {
    return readBool(src.allow_scorecard_sharing, DEFAULT_PRIVACY_PREFS.share_scorecard);
  }
  return DEFAULT_PRIVACY_PREFS.share_scorecard;
}

export function parsePrivacyPrefs(raw: unknown): PrivacyPrefs {
  const src =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return {
    allow_ai_training: readBool(src.allow_ai_training, DEFAULT_PRIVACY_PREFS.allow_ai_training),
    store_transcripts: readBool(src.store_transcripts, DEFAULT_PRIVACY_PREFS.store_transcripts),
    analytics_tracking: readBool(src.analytics_tracking, DEFAULT_PRIVACY_PREFS.analytics_tracking),
    crash_reporting: readBool(src.crash_reporting, DEFAULT_PRIVACY_PREFS.crash_reporting),
    share_scorecard: resolveShareScorecardAllowed(src),
  };
}

export function allowsAiTraining(raw: unknown): boolean {
  // Explicit true only — missing or false is fail-closed.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return (raw as Record<string, unknown>).allow_ai_training === true;
  }
  return false;
}

export function shouldStoreTranscripts(raw: unknown): boolean {
  return parsePrivacyPrefs(raw).store_transcripts;
}

export function canShareScorecard(raw: unknown): boolean {
  return resolveShareScorecardAllowed(raw);
}

export function isCrashReportingEnabled(): boolean {
  return crashReportingEnabled;
}

export function isAiTrainingAllowed(): boolean {
  return allowAiTrainingEnabled;
}

export function stripSessionTextFromPayload<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripSessionTextFromPayload(item)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SESSION_TEXT_KEYS.has(key) || SESSION_TEXT_KEYS.has(key.toLowerCase())) {
      out[key] = "[omitted: ai-training-opt-out]";
    } else if (nested && typeof nested === "object") {
      out[key] = stripSessionTextFromPayload(nested);
    } else {
      out[key] = nested;
    }
  }
  return out as T;
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "true" : "false");
  } catch {
    // quota / private mode
  }
}

function lsBool(key: string, fallback: boolean): boolean {
  const v = lsGet(key);
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

/** Boot-time flags from the last saved prefs (profile is not loaded yet). */
export function readLocalObservabilityPrefs(): Pick<
  PrivacyPrefs,
  "analytics_tracking" | "crash_reporting" | "allow_ai_training"
> {
  return {
    analytics_tracking: lsBool(LS.analytics, DEFAULT_PRIVACY_PREFS.analytics_tracking),
    crash_reporting: lsBool(LS.crash, DEFAULT_PRIVACY_PREFS.crash_reporting),
    allow_ai_training: lsBool(LS.training, DEFAULT_PRIVACY_PREFS.allow_ai_training),
  };
}

function hydrateFromLocalStorage(): void {
  const local = readLocalObservabilityPrefs();
  crashReportingEnabled = local.crash_reporting;
  allowAiTrainingEnabled = local.allow_ai_training;
}

hydrateFromLocalStorage();

export function persistObservabilityPrefsLocal(prefs: PrivacyPrefs): void {
  lsSet(LS.analytics, prefs.analytics_tracking);
  lsSet(LS.crash, prefs.crash_reporting);
  lsSet(LS.training, prefs.allow_ai_training);
}

export function applyAnalyticsPreference(enabled: boolean): void {
  if (!import.meta.env.VITE_POSTHOG_KEY) return;
  try {
    if (enabled) {
      posthog.opt_in_capturing();
    } else {
      posthog.opt_out_capturing();
    }
  } catch {
    // PostHog may be unavailable
  }
}

export function applyCrashReportingPreference(enabled: boolean): void {
  crashReportingEnabled = enabled;
  try {
    const client = Sentry.getClient();
    if (client) {
      client.getOptions().enabled = enabled;
    }
  } catch {
    // Sentry may not be initialized
  }
}

export function applyObservabilityPreferences(prefs: PrivacyPrefs): void {
  allowAiTrainingEnabled = prefs.allow_ai_training === true;
  crashReportingEnabled = prefs.crash_reporting;
  persistObservabilityPrefsLocal(prefs);
  applyAnalyticsPreference(prefs.analytics_tracking);
  applyCrashReportingPreference(prefs.crash_reporting);
}

/** Call after profile load / save so runtime consumers match the stored JSON. */
export function syncPrivacyPrefsFromProfile(raw: unknown): PrivacyPrefs {
  const prefs = parsePrivacyPrefs(raw);
  applyObservabilityPreferences(prefs);
  return prefs;
}

/** Visible prefs written on Save — drops retired decorative keys. */
export function toStoredPrivacyPrefs(prefs: PrivacyPrefs): PrivacyPrefs {
  return {
    allow_ai_training: prefs.allow_ai_training,
    store_transcripts: prefs.store_transcripts,
    analytics_tracking: prefs.analytics_tracking,
    crash_reporting: prefs.crash_reporting,
    share_scorecard: prefs.share_scorecard,
  };
}
