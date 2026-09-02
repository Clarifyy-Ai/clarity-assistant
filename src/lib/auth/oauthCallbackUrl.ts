import { buildAuthRedirectUrl } from "@/lib/auth/redirectUrl";

/** Absolute URL Supabase Auth redirects to after OAuth (app callback route). */
export function buildOAuthCallbackUrl(windowOrigin?: string | null): string {
  return buildAuthRedirectUrl({
    path: "/auth/callback",
    configuredAppUrl: import.meta.env.VITE_APP_URL,
    appEnv: import.meta.env.VITE_APP_ENV,
    windowOrigin:
      windowOrigin ??
      (typeof window !== "undefined" ? window.location.origin : null),
  });
}
