// Local deterministic text extraction for document parsing (PDF, plain text).

export type DocumentExtractPayload = {
  full_text: string;
  summary: string;
};

export function bytesToUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
    return s;
  }
}

export function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 2048));
  let nul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nul++;
  }
  return nul > 4;
}

/** Best-effort text extraction from text-based PDFs when Python/Gemini are unavailable. */
export function extractPdfTextBasic(bytes: Uint8Array): string | null {
  const raw = bytesToUtf8(bytes);
  const chunks: string[] = [];
  const re = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const piece = match[1]!
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")");
    if (piece.trim().length >= 2) chunks.push(piece);
  }
  const text = chunks.join(" ").replace(/\s+/g, " ").trim();
  return text.length >= 20 ? text : null;
}

export function buildDocumentExtractPayload(fullText: string): DocumentExtractPayload | null {
  const clipped = fullText.trim();
  if (clipped.length < 20) return null;
  return {
    full_text: clipped.slice(0, 50_000),
    summary: clipped.slice(0, 400),
  };
}

const PLAIN_TEXT_MIMES = new Set([
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
]);

/** Fast local extraction for PDF and plain-text documents (no external services). */
export function tryDeterministicTextExtract(
  bytes: Uint8Array,
  mimeType: string,
): DocumentExtractPayload | null {
  if (mimeType === "application/pdf") {
    const text = extractPdfTextBasic(bytes);
    return text ? buildDocumentExtractPayload(text) : null;
  }
  if (PLAIN_TEXT_MIMES.has(mimeType)) {
    if (looksBinary(bytes)) return null;
    const text = bytesToUtf8(bytes).replace(/^\uFEFF/, "").trim();
    return buildDocumentExtractPayload(text);
  }
  return null;
}
