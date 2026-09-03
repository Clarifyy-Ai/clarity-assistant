import {
  buildAuthRedirectUrl,
  isLocalhostUrl,
  PRODUCTION_APP_URL,
} from "@/lib/auth/redirectUrl";

export { PRODUCTION_APP_URL, isLocalhostUrl, buildAuthRedirectUrl };

/** Canonical auth paths — do not scatter these across pages. */
export const AUTH_PATHS = {
  callback: "/auth/callback",
  oauthCallback: "/auth/callback",
  mfaChallenge: "/login",
  mfaEnroll: "/auth/mfa-enroll",
  mfaRecovery: "/auth/mfa-recovery",
  passwordReset: "/reset-password",
  verifyEmail: "/verify-email",
} as const;

export type AuthPathKey = keyof typeof AUTH_PATHS;

function redirectEnv(windowOrigin?: string | null) {
  return {
    configuredAppUrl: import.meta.env.VITE_APP_URL,
    appEnv: import.meta.env.VITE_APP_ENV,
    windowOrigin:
      windowOrigin ??
      (typeof window !== "undefined" ? window.location.origin : null),
  };
}

/** Absolute URL for a first-party auth path. Production never emits localhost. */
export function authAbsoluteUrl(path: string, windowOrigin?: string | null): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return buildAuthRedirectUrl({
    path: normalized,
    ...redirectEnv(windowOrigin),
  });
}

export function authUrl(key: AuthPathKey, windowOrigin?: string | null): string {
  return authAbsoluteUrl(AUTH_PATHS[key], windowOrigin);
}
