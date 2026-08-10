// ✅ FIX P0-A: Synchronous session read from Supabase auth localStorage cache
// so first paint can treat the user as signed-in without awaiting getSession().

import type { Session, User } from "@supabase/supabase-js";
import { isTabLocalLogout } from "@/lib/auth/tabLocalLogout";

const AUTH_TOKEN_SUFFIX = "-auth-token";

function isSessionFresh(expiresAt: number | undefined): boolean {
  if (!expiresAt) return true;
  // expires_at is seconds since epoch in Supabase persisted session
  return expiresAt * 1000 > Date.now() + 5_000;
}

export function readCachedAuthSession(): {
  session: Session;
  user: User;
} | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  // Independent-tab logout: do not hydrate UI from the shared session.
  if (isTabLocalLogout()) {
    return null;
  }

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.endsWith(AUTH_TOKEN_SUFFIX)) continue;

      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const sessionPayload =
        (parsed.currentSession as Record<string, unknown> | undefined) ??
        parsed;

      const accessToken = sessionPayload.access_token;
      const user = sessionPayload.user as User | undefined;
      const expiresAt = sessionPayload.expires_at as number | undefined;

      if (typeof accessToken !== "string" || !user?.id) continue;
      if (!isSessionFresh(expiresAt)) continue;

      const session = sessionPayload as unknown as Session;
      return { session, user };
    }
  } catch {
    return null;
  }

  return null;
}
