export type TranscriptDisplayKind = "interim" | "final";

export function transcriptDisplayKind(isFinal: boolean | null | undefined): TranscriptDisplayKind {
  return isFinal === true ? "final" : "interim";
}

export function transcriptAriaLabel(kind: TranscriptDisplayKind): string {
  return kind === "final" ? "Final transcript" : "Interim transcript — not final";
}

export function shouldPersistTranscriptSegment(isFinal: boolean | null | undefined): boolean {
  return isFinal === true;
}

export function mergeUtteranceText(
  finals: Array<{ text: string }>,
  interim: string | null | undefined,
): { committed: string; pending: string } {
  return {
    committed: finals.map((u) => u.text.trim()).filter(Boolean).join(" "),
    pending: (interim ?? "").trim(),
  };
}
