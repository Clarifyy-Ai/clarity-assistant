/**
 * Heuristic detection for interviewer questions (live transcription).
 * Intentionally permissive — false positives are preferable to missed questions in practice mode.
 */
const QUESTION_LEAD_IN =
  /^(what|how|why|when|where|who|which|tell me|walk me through|walk me|describe|explain|can you|could you|would you|do you|did you|have you|has there|give me an example|share an example|talk about|speak about)\b/i;

export function isInterviewerQuestionText(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  if (t.endsWith("?")) return true;
  if (QUESTION_LEAD_IN.test(t)) return true;
  if (t.length < 160 && /\b(you|your|yourself)\b/i.test(t)) return true;
  return false;
}
