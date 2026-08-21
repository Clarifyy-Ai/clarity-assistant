// supabase/functions/_shared/uploadValidation.ts
//
// MIME allowlist for document/resume uploads processed by edge functions.

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
      reason: "Missing or unrecognized file type. Allowed: PDF, DOCX, TXT, CSV, XLSX.",
    };
  }

  if (!ALLOWED_MIME_TYPES.has(resolved)) {
    return {
      ok: false,
      reason: `File type "${resolved}" is not allowed. Allowed: PDF, DOCX, TXT, CSV, XLSX.`,
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

/** DOCX/OOXML is a ZIP (PK..) */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
    (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08)
  );
}

/**
 * Prefer declared MIME, then path extension, then magic bytes.
 * Handles mangled extensions (e.g. `.resum`) when content is still PDF/DOCX/text.
 */
export function resolveUploadMime(
  mimeType: string | null | undefined,
  options?: { filePath?: string | null; bytes?: Uint8Array | null },
): UploadMimeValidation {
  const declared = validateUploadMime(mimeType, { filePath: options?.filePath });
  if (declared.ok) {
    // If claimed PDF but bytes aren't, fall through to magic detection.
    if (
      declared.mimeType === "application/pdf" &&
      options?.bytes &&
      !looksLikePdf(options.bytes)
    ) {
      // continue below
    } else {
      return declared;
    }
  }

  const bytes = options?.bytes;
  if (bytes) {
    if (looksLikePdf(bytes)) {
      return { ok: true, mimeType: "application/pdf" };
    }
    if (looksLikeZip(bytes)) {
      return {
        ok: true,
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      };
    }
    // Printable UTF-8 / ASCII text heuristic
    const sample = bytes.slice(0, Math.min(bytes.length, 2048));
    let printable = 0;
    for (let i = 0; i < sample.length; i++) {
      const b = sample[i]!;
      if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80) {
        printable++;
      }
    }
    if (sample.length > 0 && printable / sample.length >= 0.9) {
      return { ok: true, mimeType: "text/plain" };
    }
  }

  return {
    ok: false,
    reason: declared.ok
      ? `File content does not match declared type "${declared.mimeType}".`
      : (declared.reason ||
        "Missing or unrecognized file type. Allowed: PDF, DOCX, TXT, CSV, XLSX."),
  };
}
