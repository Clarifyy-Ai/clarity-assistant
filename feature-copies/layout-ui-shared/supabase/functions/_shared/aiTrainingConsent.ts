/**
 * AI training consent from the browser `x-ai-training-consent` header.
 * Fail-closed: missing or anything other than "true" means no training.
 * There is currently no training sink — call skipTrainingSink() before
 * adding one so opted-out sessions are never forwarded.
 */

export const AI_TRAINING_CONSENT_HEADER = "x-ai-training-consent";

export function hasAiTrainingConsent(req: Request): boolean {
  const raw = req.headers.get(AI_TRAINING_CONSENT_HEADER);
  if (raw == null) return false;
  return raw.trim().toLowerCase() === "true";
}

/** True when session/document payloads must not be sent to a training sink. */
export function skipTrainingSink(req: Request): boolean {
  return !hasAiTrainingConsent(req);
}
