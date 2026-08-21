import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { validateUploadMime } from "./uploadValidation.ts";

export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_JOB_STATES = [
  "queued", "leased", "downloading", "extracting", "OCR", "segmenting",
  "validating", "awaiting_review", "completed", "failed_retryable",
  "failed_permanent", "cancelled",
] as const;

export const DOCUMENT_TERMINAL_STATES = new Set([
  "completed",
  "failed_permanent",
  "cancelled",
]);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{16,150}$/.test(value.trim());
}

export function safeError(
  code: string,
  message: string,
  stage: string,
  correlationId: string,
  retryable = false,
) {
  return {
    code,
    message,
    retryable,
    stage,
    correlation_id: correlationId,
  };
}

export async function getOwnedDocument(
  db: SupabaseClient,
  documentId: string,
  userId: string,
) {
  const { data, error } = await db
    .from("personal_library_documents")
    .select(
      "id, owner_id, storage_path, mime_type, content_hash, file_size_bytes, file_category, processing_status, parsed_content, parsed_metadata, parser_version",
    )
    .eq("id", documentId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export function validateDocumentRecord(document: Record<string, unknown>, userId: string) {
  const storagePath = typeof document.storage_path === "string"
    ? document.storage_path
    : "";
  if (!storagePath || !storagePath.startsWith(`${userId}/library/`) ||
      storagePath.includes("..") || storagePath.startsWith("/")) {
    return { ok: false as const, code: "INVALID_STORAGE_REFERENCE", message: "Document storage reference is invalid." };
  }
  const mime = validateUploadMime(String(document.mime_type ?? ""));
  if (!mime.ok) {
    return { ok: false as const, code: "UNSUPPORTED_DOCUMENT_TYPE", message: "Document type is not supported." };
  }
  const size = Number(document.file_size_bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0 || size > DOCUMENT_MAX_BYTES) {
    return { ok: false as const, code: "DOCUMENT_SIZE_INVALID", message: "Document size is invalid." };
  }
  return { ok: true as const };
}
