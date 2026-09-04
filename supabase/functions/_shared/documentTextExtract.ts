// Local deterministic text extraction for document parsing (PDF, plain text, DOCX-ish XML).

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

function printableRatio(text: string): number {
  if (!text.length) return 0;
  let ok = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c < 127) || c > 159) ok += 1;
  }
  return ok / text.length;
}

function decodePdfLiteral(piece: string): string {
  return piece
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\")
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8) % 256));
}

function decodePdfHex(hex: string): string | null {
  const clean = hex.replace(/\s+/g, "");
  if (clean.length < 4 || clean.length % 2 !== 0) return null;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 2) {
    const n = parseInt(clean.slice(i, i + 2), 16);
    if (!Number.isFinite(n)) return null;
    bytes.push(n);
  }
  let start = 0;
  let step = 1;
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    start = 2;
    step = 2;
  }
  let out = "";
  if (step === 2) {
    for (let i = start; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    }
  } else {
    for (let i = start; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i]!);
    }
  }
  const t = out.replace(/\s+/g, " ").trim();
  if (t.length < 2 || printableRatio(t) < 0.85) return null;
  return t;
}

function looksLikePdfDump(text: string): boolean {
  if (/%PDF-|endobj|endstream/.test(text) && text.length < 80) return true;
  if (printableRatio(text) < 0.82) return true;
  const operators = (text.match(/\b(?:Tj|TJ|BT|ET|Tf|Td|Tm)\b/g) ?? []).length;
  return operators >= 4 && !/[A-Za-z]{5,}/.test(text.replace(/\b(?:Tj|TJ|BT|ET)\b/g, ""));
}

/** Best-effort text extraction from text-based PDFs when Python/Gemini are unavailable. */
export function extractPdfTextBasic(bytes: Uint8Array): string | null {
  const raw = bytesToUtf8(bytes);
  const chunks: string[] = [];

  const lit = /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/gi;
  let match: RegExpExecArray | null;
  while ((match = lit.exec(raw)) !== null) {
    const piece = decodePdfLiteral(match[1]!);
    if (piece.trim().length >= 2) chunks.push(piece);
  }

  if (chunks.length === 0) {
    const loose = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
    while ((match = loose.exec(raw)) !== null) {
      const piece = decodePdfLiteral(match[1]!);
      if (piece.trim().length >= 2 && printableRatio(piece) >= 0.9) chunks.push(piece);
    }
  }

  const hex = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
  while ((match = hex.exec(raw)) !== null) {
    const decoded = decodePdfHex(match[1]!);
    if (decoded) chunks.push(decoded);
  }

  const text = chunks.join(" ").replace(/\s+/g, " ").trim();
  if (text.length < 20) return null;
  if (looksLikePdfDump(text)) return null;
  return text;
}

export function buildDocumentExtractPayload(fullText: string): DocumentExtractPayload | null {
  const clipped = fullText.trim();
  if (clipped.length < 20) return null;
  if (looksLikePdfDump(clipped)) return null;
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

/** Preserve paragraph breaks from OOXML document.xml (skills/sections stay line-oriented). */
export function extractDocxXmlText(xml: string): string | null {
  const text = xml
    .replace(/<w:tab[^/]*\/>/g, "\t")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<w:br[^/]*\/>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text.length >= 20 ? text.slice(0, 50_000) : null;
}

export function extractJdFieldsFromText(text: string): {
  role: string | null;
  company: string | null;
  location: string | null;
  salary_range: string | null;
  required_skills: string[];
  summary: string;
} {
  const clipped = text.trim();
  const roleMatch = clipped.match(/(?:job\s*title|position|role|title)\s*[:\-–]\s*([^\n]{3,120})/i);
  const companyMatch = clipped.match(/(?:company|employer|organization)\s*[:\-–]\s*([^\n]{2,120})/i);
  const locationMatch =
    clipped.match(/(?:work\s*location|locations?|based in|office)\s*[:\-–]\s*([^\n]{2,80})/i) ||
    clipped.match(/based in\s+([^\n,]{2,80})/i);
  const salaryMatch = clipped.match(
    /(?:salary|compensation|ctc|package|pay\s*range)\s*[:\-–]\s*([^\n]{2,80})/i,
  );
  const skillsBlock = clipped.match(
    /(?:required skills|key skills|must have|requirements)[:\s]*([\s\S]{20,1200}?)(?:\n\n|responsibilities|qualifications|benefits|$)/i,
  );
  const skills = (skillsBlock?.[1] ?? "")
    .split(/\n|•|,|;/)
    .map((line) => line.replace(/^[\-\*\d.\s]+/, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2 && line.length <= 80 && line !== "[object Object]")
    .slice(0, 40);
  return {
    role: roleMatch?.[1]?.trim() || null,
    company: companyMatch?.[1]?.trim() || null,
    location: locationMatch?.[1]?.trim() || null,
    salary_range: salaryMatch?.[1]?.trim() || null,
    required_skills: skills,
    summary: clipped.slice(0, 400),
  };
}
