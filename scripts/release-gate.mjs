#!/usr/bin/env node
/**
 * Phase 10 release gate. Does not declare complete from green Render / 200s.
 * Prints RELEASE_BLOCKED until required secrets and live smoke are actually verified.
 */
const required = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "VITE_OAUTH_PROVIDERS",
];

const missing = required.filter((key) => !String(process.env[key] ?? "").trim());
const liveSmokeVerified = process.env.RELEASE_LIVE_SMOKE_VERIFIED === "1";

if (missing.length || !liveSmokeVerified) {
  console.log("RELEASE_BLOCKED");
  if (missing.length) {
    console.log(`Missing secrets: ${missing.join(", ")}`);
  }
  if (!liveSmokeVerified) {
    console.log(
      "Live smoke not verified. Set RELEASE_LIVE_SMOKE_VERIFIED=1 only after seeded (not mocked) signup/MFA/session/delete/calendar/reminder/402/admin review pass.",
    );
  }
  process.exit(2);
}

console.log("RELEASE_READY");
