import { authUrl } from "@/lib/auth/appOrigin";

/** Absolute URL Supabase Auth redirects to after OAuth (app callback route). */
export function buildOAuthCallbackUrl(windowOrigin?: string | null): string {
  return authUrl("oauthCallback", windowOrigin);
}
