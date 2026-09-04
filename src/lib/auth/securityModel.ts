/**
 * Career Pilot authentication model.
 *
 * PRIMARY AUTH (AAL1)
 *   - Email + password
 *   - OAuth (Google, etc. when configured)
 *   - Email magic link / signup confirmation OTP (email ownership only)
 *
 * SECOND FACTOR (AAL2)
 *   - Supabase Auth TOTP (authenticator app)
 *   - Email OTP / magic link NEVER satisfies this factor
 *
 * RECOVERY (lost authenticator)
 *   - One-time hashed recovery codes issued after TOTP is verified
 *   - Verified-email recovery token after primary auth (AAL1)
 *   - Then old TOTP is revoked via service role and a new factor must be enrolled
 *
 * Trusted-device "remember MFA" is intentionally not implemented.
 */

export const AUTH_FACTOR = {
  PRIMARY: "primary",
  TOTP: "totp",
  EMAIL_OTP: "email_otp",
} as const;

export type AuthFactor = (typeof AUTH_FACTOR)[keyof typeof AUTH_FACTOR];

/** Email/magic-link OTP proves inbox access. It is not TOTP MFA. */
export function emailOtpSatisfiesMfa(): false {
  return false;
}
