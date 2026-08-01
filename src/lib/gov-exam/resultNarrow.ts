/** Narrow `{ ok: true } | { ok: false; code; message }` without TS complaining. */

export type FailResult = { ok: false; code: string; message: string };

export function isFailResult(r: { ok: boolean }): r is FailResult {
  return r.ok === false;
}
