/** PostgREST / Postgres error helpers. */

export function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(err.message ?? ""));
}
