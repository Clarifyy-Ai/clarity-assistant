/**
 * Resume table schema compatibility.
 *
 * `resumes.updated_at` is added by 20260828130000_resumes_updated_at.sql.
 * Unmigrated environments still have `created_at` only — ordering or writing
 * `updated_at` 400s the upload path before parse can run.
 */

/** Always-present timestamp used for duplicate-resume ordering. */
export const RESUME_DEDUPE_ORDER_COLUMN = "created_at" as const;

export function isMissingResumeUpdatedAtError(error: unknown): boolean {
  if (error == null) return false;
  const rec =
    typeof error === "object"
      ? (error as { message?: string; details?: string; hint?: string; code?: string })
      : { message: String(error) };
  const hay = `${rec.message ?? ""} ${rec.details ?? ""} ${rec.hint ?? ""}`;
  if (!/updated_at/i.test(hay)) return false;
  return (
    rec.code === "42703" ||
    rec.code === "PGRST204" ||
    /does not exist/i.test(hay) ||
    /schema cache/i.test(hay) ||
    /could not find the ['"]?updated_at['"]? column/i.test(hay)
  );
}

/** Callers must not send `updated_at`; the DB trigger/default owns it when present. */
export function omitResumeUpdatedAt<T extends object>(row: T): Omit<T, "updated_at"> {
  const { updated_at: _ignored, ...rest } = row as T & { updated_at?: unknown };
  return rest as Omit<T, "updated_at">;
}
