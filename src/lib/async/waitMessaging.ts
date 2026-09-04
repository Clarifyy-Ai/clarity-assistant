/**
 * Patience copy for long waits — never marks a durable job failed by itself.
 */

export type WaitBand = "early" | "steady" | "long";

export function waitBandForElapsedMs(elapsedMs: number): WaitBand {
  if (elapsedMs < 10_000) return "early";
  if (elapsedMs < 30_000) return "steady";
  return "long";
}

export function waitMessageForElapsedMs(
  elapsedMs: number,
  baseMessage: string,
): string {
  const band = waitBandForElapsedMs(elapsedMs);
  if (band === "early") return baseMessage || "Processing…";
  if (band === "steady") {
    return baseMessage
      ? `Still processing — ${baseMessage.replace(/\.\.\.$/, "").replace(/…$/, "")}…`
      : "Still processing…";
  }
  return "Taking longer than expected. You can continue waiting.";
}
