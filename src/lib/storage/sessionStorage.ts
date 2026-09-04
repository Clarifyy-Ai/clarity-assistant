// ─────────────────────────────────────────────────────────────────────────────
// sessionStorage.ts — SessionStorage helpers for ephemeral tab-scoped data.
// Data persists for the browser tab session only — cleared on tab close.
// Used for live session state, temp drafts, and in-progress interview data.
// ─────────────────────────────────────────────────────────────────────────────

const NAMESPACE = "career-pilot:session:";
const LEGACY_NAMESPACE = "clarify:session:";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ns = (key: string) => `${NAMESPACE}${key}`;
const legacyNs = (key: string) => `${LEGACY_NAMESPACE}${key}`;

function safeGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    let raw = window.sessionStorage.getItem(ns(key));
    if (raw === null) {
      const legacy = window.sessionStorage.getItem(legacyNs(key));
      if (legacy !== null) {
        try {
          window.sessionStorage.setItem(ns(key), legacy);
          window.sessionStorage.removeItem(legacyNs(key));
        } catch {
          /* keep reading legacy */
        }
        raw = legacy;
      }
    }
    return raw !== null ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(ns(key), JSON.stringify(value));
  } catch (e) {
    console.warn(`[sessionStorage] set "${key}" failed:`, e);
  }
}

// ─── sessionStorage API ───────────────────────────────────────────────────────

export const ss = {
  set:          <T>(key: string, value: T)    => safeSet(key, value),
  get:          <T>(key: string)              => safeGet<T>(key),
  getOrDefault: <T>(key: string, def: T): T   => safeGet<T>(key) ?? def,
  has:          (key: string): boolean        => safeGet(key) !== null,

  remove(key: string): void {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.removeItem(ns(key));
      window.sessionStorage.removeItem(legacyNs(key));
    } catch {}
  },

  patch<T extends object>(key: string, partial: Partial<T>): void {
    const existing = safeGet<T>(key) ?? ({} as T);
    safeSet<T>(key, { ...existing, ...partial });
  },

  clear(): void {
    if (typeof window === "undefined") return;
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k?.startsWith(NAMESPACE) || k?.startsWith(LEGACY_NAMESPACE)) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {}
  },

  keys(): string[] {
    if (typeof window === "undefined") return [];
    const keys: string[] = [];
    try {
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k?.startsWith(NAMESPACE)) {
          keys.push(k.slice(NAMESPACE.length));
        }
      }
    } catch {}
    return keys;
  },
};

// ─── Typed Session Keys ───────────────────────────────────────────────────────

export const SS_KEYS = {
  // Live session
  LIVE_SESSION_ID:         "live:session_id",
  LIVE_QUESTION:           "live:current_question",
  LIVE_TRANSCRIPT:         "live:transcript",
  LIVE_ANSWER_DRAFT:       "live:answer_draft",
  LIVE_START_TIME:         "live:start_time",
  LIVE_PANIC_COUNT:        "live:panic_count",

  // Audio
  AUDIO_STREAM_ACTIVE:     "audio:stream_active",
  AUDIO_DEVICE_ID:         "audio:device_id",
  MIC_PERMISSION:          "audio:mic_permission",

  // Overlay
  OVERLAY_LAST_POSITION:   "overlay:last_position",
  OVERLAY_LAST_SIZE:       "overlay:last_size",

  // Navigation
  REDIRECT_AFTER_LOGIN:    "nav:redirect_after_login",
  LAST_VISITED_ROUTE:      "nav:last_visited",

  // Temp data
  DRAFT_STAR_ANSWER:       "draft:star_answer",
  DRAFT_COMPANY_RESEARCH:  "draft:company_research",
  INTERVIEW_CONTEXT:       "draft:interview_context",
} as const;

export type SSKey = (typeof SS_KEYS)[keyof typeof SS_KEYS];

// ─── Domain-Specific Helpers ──────────────────────────────────────────────────

export const liveSession = {
  setId:       (id: string)           => ss.set(SS_KEYS.LIVE_SESSION_ID, id),
  getId:       ()                     => ss.get<string>(SS_KEYS.LIVE_SESSION_ID),
  setQuestion: (q: string)            => ss.set(SS_KEYS.LIVE_QUESTION, q),
  getQuestion: ()                     => ss.get<string>(SS_KEYS.LIVE_QUESTION),
  appendTranscript: (chunk: string)   => {
    const existing = ss.getOrDefault<string>(SS_KEYS.LIVE_TRANSCRIPT, "");
    ss.set(SS_KEYS.LIVE_TRANSCRIPT, `${existing} ${chunk}`.trim());
  },
  getTranscript:    ()                => ss.getOrDefault<string>(SS_KEYS.LIVE_TRANSCRIPT, ""),
  setAnswerDraft:   (text: string)    => ss.set(SS_KEYS.LIVE_ANSWER_DRAFT, text),
  getAnswerDraft:   ()                => ss.get<string>(SS_KEYS.LIVE_ANSWER_DRAFT),
  setStartTime:     ()                => ss.set(SS_KEYS.LIVE_START_TIME, Date.now()),
  getStartTime:     ()                => ss.get<number>(SS_KEYS.LIVE_START_TIME),
  clearAll:         ()                => {
    [
      SS_KEYS.LIVE_SESSION_ID,
      SS_KEYS.LIVE_QUESTION,
      SS_KEYS.LIVE_TRANSCRIPT,
      SS_KEYS.LIVE_ANSWER_DRAFT,
      SS_KEYS.LIVE_START_TIME,
    ].forEach((k) => ss.remove(k));
  },
};
