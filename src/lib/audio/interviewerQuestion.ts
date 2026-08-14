/**
 * Heuristic detection for interviewer questions (live transcription).
 * Conservative — false positives burn credits when auto-generate is on.
 */
const QUESTION_LEAD_IN =
  /^(what|what's|whats|how|how's|why|when|where|who|which|tell me|walk me through|walk me|describe|explain|can you|could you|would you|do you|did you|have you|has there|give me an example|share an example|talk about|speak about|are you|were you|is there|let's talk|lets talk|please explain|please describe|have you ever|compare|discuss)\b/i;

const FILLER_PREFIX = /^(um+|uh+|like|so yeah|okay|ok)\b/i;
const MOSTLY_FILLER = /^(?:(?:um+|uh+|like|so yeah|okay|ok)[\s,.]*)+$/i;

function isMostlyCandidateFiller(t: string): boolean {
  if (MOSTLY_FILLER.test(t)) return true;
  const match = t.match(FILLER_PREFIX);
  if (!match) return false;
  const rest = t.slice(match[0].length).replace(/^[\s,.!]+/, "").trim();
  return rest.length === 0 || rest.length <= t.length / 2;
}

export function isInterviewerQuestionText(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  if (isMostlyCandidateFiller(t)) return false;

  const wordCount = t.split(/\s+/).filter(Boolean).length;
  const endsWithQ = t.endsWith("?");
  if (wordCount <= 2 && !endsWithQ) return false;

  if (endsWithQ) return true;
  if (QUESTION_LEAD_IN.test(t)) return true;
  return false;
}

/** Alias kept for callers that prefer the likelihood naming. */
export const isLikelyInterviewerQuestion = isInterviewerQuestionText;
