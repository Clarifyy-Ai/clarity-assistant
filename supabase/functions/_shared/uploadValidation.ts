// supabase/functions/_shared/uploadValidation.ts
//
// MIME allowlist for document/resume uploads processed by edge functions.

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
};

export type UploadMimeValidation =
  | { ok: true; mimeType: string }
  | { ok: false; reason: string };

/** Normalize client-supplied MIME strings (strip parameters, lowercase). */
export function normalizeMimeType(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  const base = trimmed.split(";")[0]?.trim();
  return base || null;
}

/** Infer MIME from a storage path extension when metadata is missing. */
export function inferMimeFromPath(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  const name = filePath.split("/").pop() ?? filePath;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return EXTENSION_TO_MIME[ext] ?? null;
}

export function isAllowedUploadMime(mimeType: string | null | undefined): boolean {
  const normalized = normalizeMimeType(mimeType);
  return normalized !== null && ALLOWED_MIME_TYPES.has(normalized);
}

export function validateUploadMime(
  mimeType: string | null | undefined,
  options?: { filePath?: string | null },
): UploadMimeValidation {
  let resolved = normalizeMimeType(mimeType);

  if (!resolved && options?.filePath) {
    resolved = inferMimeFromPath(options.filePath);
  }

  if (!resolved) {
    return {
      ok: false,
      reason: "Missing or unrecognized file type. Allowed: PDF, DOCX, TXT.",
    };
  }

  if (!ALLOWED_MIME_TYPES.has(resolved)) {
    return {
      ok: false,
      reason: `File type "${resolved}" is not allowed. Allowed: PDF, DOCX, TXT.`,
    };
  }

  return { ok: true, mimeType: resolved };
}

/** PDF magic bytes (%PDF-) */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}
