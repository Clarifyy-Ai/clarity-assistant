// ─────────────────────────────────────────────────────────────────────────────
// pages/auth/index.ts — Barrel export for all auth pages.
// Import from "@/pages/auth" anywhere in the router.
// ─────────────────────────────────────────────────────────────────────────────

export { default as Login }         from "./Login";
export { default as Signup }        from "./Signup";
export { default as VerifyEmail }   from "./VerifyEmail";
export { default as ResetPassword } from "./ResetPassword";
