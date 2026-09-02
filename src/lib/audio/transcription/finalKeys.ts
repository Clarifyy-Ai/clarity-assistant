import type { TranscriptionChannel } from "./types";

export function finalSegmentFingerprint(
  channel: TranscriptionChannel,
  text: string,
  startMs: number,
  endMs: number,
): string {
  return [channel, text.trim().toLowerCase(), startMs, endMs].join(":");
}

export function rememberFinalKey(seen: Set<string>, fingerprint: string, max = 500): boolean {
  if (seen.has(fingerprint)) return false;
  seen.add(fingerprint);
  if (seen.size > max) {
    const oldest = seen.values().next().value;
    if (oldest) seen.delete(oldest);
  }
  return true;
}
