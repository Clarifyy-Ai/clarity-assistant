/**
 * Decide whether the next generated item should be an answer-aware follow-up.
 */

import { transcriptLooksComplete } from "@/lib/mock/silencePolicy";

export function followUpCapForDepth(depth: "none" | "light" | "deep"): number {
  if (depth === "none") return 0;
  if (depth === "deep") return 2;
  return 1;
}

export function shouldRequestFollowUp(input: {
  depth: "none" | "light" | "deep";
  followUpsUsed: number;
  maxFollowUps: number;
  answerText: string;
  skipped: boolean;
}): boolean {
  if (input.skipped) return false;
  if (input.depth === "none") return false;
  const cap = Math.max(0, Math.min(input.maxFollowUps, followUpCapForDepth(input.depth)));
  if (input.followUpsUsed >= cap) return false;

  const text = input.answerText.trim();
  if (!text) return false;

  // Thin / incomplete answers warrant a probe within the cap.
  if (text.length < 40) return true;
  if (!transcriptLooksComplete(text)) return true;

  // Deep mode: one clarifying follow-up even on moderately complete answers.
  if (input.depth === "deep" && input.followUpsUsed === 0 && text.length < 180) {
    return true;
  }

  return false;
}
