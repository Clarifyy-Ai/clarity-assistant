/**
 * Session types valid for PostgREST `.in("type", …)` on `sessions.type`.
 * Must match `public.session_type` enum — never include UI aliases like "practice".
 */
export const DEBRIEF_SESSION_DB_TYPES = [
  "mock",
  "live",
  "rehearsal",
] as const;

export type DebriefSessionDbType = (typeof DEBRIEF_SESSION_DB_TYPES)[number];
