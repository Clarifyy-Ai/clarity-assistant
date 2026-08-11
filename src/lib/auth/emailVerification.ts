/**
 * Email confirmation helpers for signup / route guards.
 */

type EmailConfirmable = {
  email_confirmed_at?: string | null;
} | null | undefined;

/** True when Supabase has recorded a non-empty confirmation timestamp. */
export function isUserEmailConfirmed(user: EmailConfirmable): boolean {
  const value = user?.email_confirmed_at;
  return typeof value === "string" && value.trim().length > 0;
}
