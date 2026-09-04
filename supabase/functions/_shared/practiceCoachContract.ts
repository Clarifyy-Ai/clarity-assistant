// supabase/functions/_shared/practiceCoachContract.ts
// Canonical practice-coach Python/Edge contract helpers.

export const COACH_TONES = ["encouraging", "direct", "formal", "casual"] as const;
export type CoachTone = (typeof COACH_TONES)[number];

export const HINT_STYLES = ["short_hints", "keywords_only", "full_answer"] as const;
export type HintStyle = (typeof HINT_STYLES)[number];

export const PRACTICE_OPERATION_TYPES = [
  "hint",
  "answer",
  "coach_chat",
  "structure",
  "checklist",
  "star",
  "concepts",
  "followups",
] as const;
export type PracticeOperationType = (typeof PRACTICE_OPERATION_TYPES)[number];

export type NormalizedPythonCoachData = {
  reply: string;
  hints: string[];
  operationType: string;
  source: "python";
};

export function sanitizeCoachTone(input: unknown, fallback: CoachTone = "encouraging"): CoachTone {
  const value = String(input ?? "").trim().toLowerCase();
  return (COACH_TONES as readonly string[]).includes(value)
    ? (value as CoachTone)
    : fallback;
}

export function sanitizeHintStyle(input: unknown, fallback: HintStyle = "short_hints"): HintStyle {
  const value = String(input ?? "").trim().toLowerCase();
  if ((HINT_STYLES as readonly string[]).includes(value)) {
    return value as HintStyle;
  }
  // Wizard / profile legacy values
  switch (value) {
    case "minimal":
      return "keywords_only";
    case "balanced":
      return "short_hints";
    case "detailed":
      return "full_answer";
    default:
      return fallback;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function collectHints(obj: Record<string, unknown>): string[] {
  if (Array.isArray(obj.hints)) {
    return obj.hints.map((h) => String(h ?? "").trim()).filter(Boolean);
  }
  const singular = asString(obj.hint);
  if (singular) {
    // Split bullet lines if present
    const lines = singular
      .split(/\n+/)
      .map((l) => l.replace(/^[\s•\-\*\d.]+/, "").trim())
      .filter(Boolean);
    return lines.length >= 2 ? lines : [singular];
  }
  return [];
}

/**
 * Normalize Python practice_coach (and legacy shapes) into reply + hints.
 */
export function normalizePythonCoachData(data: unknown): NormalizedPythonCoachData | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  const operationType = asString(obj.operation_type) || asString(obj.help_type) || "";

  let reply =
    asString(obj.reply) ||
    asString(obj.answer) ||
    asString(obj.coaching) ||
    asString(obj.message) ||
    asString(obj.text) ||
    asString(obj.hint) ||
    "";

  let hints = collectHints(obj);

  // Legacy /internal/operations practice_coach_hint scaffold (no reply) -> flatten.
  if (!reply && obj.scaffold && typeof obj.scaffold === "object") {
    const scaffold = obj.scaffold as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ["clarify", "structure", "follow_ups", "followups"]) {
      const arr = scaffold[key];
      if (Array.isArray(arr)) {
        for (const item of arr) {
          const s = asString(item);
          if (s) parts.push(s);
        }
      }
    }
    if (parts.length) {
      hints = hints.length ? hints : parts.slice(0, 3);
      reply = parts.map((p) => (p.startsWith("\u2022") ? p : `\u2022 ${p}`)).join("\n");
    }
  }

  if (!reply && hints.length > 0) {
    reply = hints.map((h) => (h.startsWith("•") ? h : `• ${h}`)).join("\n");
  }

  if (!hints.length && reply) {
    const bulletLines = reply
      .split(/\n+/)
      .map((l) => l.replace(/^[\s•\-\*]+/, "").trim())
      .filter(Boolean);
    if (bulletLines.length >= 3) {
      hints = bulletLines.slice(0, 3);
    }
  }

  if (!reply.trim()) return null;

  return {
    reply: reply.trim(),
    hints,
    operationType,
    source: "python",
  };
}

export function buildToneStyleSystemAddon(
  coachTone: CoachTone,
  hintStyle: HintStyle,
): string {
  const toneLine: Record<CoachTone, string> = {
    encouraging:
      "Tone: warm, encouraging, and supportive. Acknowledge effort; stay constructive.",
    direct:
      "Tone: direct and concise. No fluff. Call out gaps immediately.",
    formal:
      "Tone: executive-formal. Professional corporate coaching language.",
    casual:
      "Tone: casual and conversational, like a supportive peer.",
  };

  const styleLine: Record<HintStyle, string> = {
    short_hints:
      "Style: short punchy cues and bullets. Prefer brevity.",
    keywords_only:
      "Style: minimal keywords and framework terms only when possible.",
    full_answer:
      "Style: more detailed coaching with structure; still do not invent facts.",
  };

  return `${toneLine[coachTone]}\n${styleLine[hintStyle]}`;
}

/** Offline notice only — never use as a successful conversational coach reply. */
export function deterministicCoachChatReply(opts: {
  question?: string;
  message?: string;
}): string {
  void opts;
  return "Coach AI is temporarily unavailable. Try again in a moment.";
}
