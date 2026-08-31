/** PostgREST / Postgres error helpers. */

export function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(err.message ?? ""));
}

type PgErr = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
} | null | undefined;

/** Postgres 42703 / PostgREST PGRST204 — column missing from live schema. */
export function isUndefinedColumn(err: PgErr, column?: string): boolean {
  if (!err) return false;
  const hay = `${err.message ?? ""} ${err.details ?? ""} ${err.hint ?? ""}`;
  const missing =
    err.code === "42703" ||
    err.code === "PGRST204" ||
    /does not exist/i.test(hay) ||
    /schema cache/i.test(hay) ||
    /could not find the '.+' column/i.test(hay);
  if (!missing) return false;
  if (!column) return true;
  return hay.toLowerCase().includes(column.toLowerCase());
}
