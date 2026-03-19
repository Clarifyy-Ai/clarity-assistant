// ─────────────────────────────────────────────────────────────────────────────
// types/index.ts — Single barrel export for ALL app types.
// Import from "@/types" anywhere in the codebase.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Existing ✅ ──────────────────────────────────────────────────────────────
export * from "./ai.types";
export * from "./analytics.types";
export * from "./audio.types";
export * from "./billing.types";
export * from "./document.types";
export * from "./gamification.types";
export * from "./interview.types";
export * from "./notification.types";
export * from "./room.types";
export * from "./session.types";
export * from "./user.types";

// ─── New ✅ ───────────────────────────────────────────────────────────────────

// API contracts — edge function payloads, HTTP types, streaming
export * from "./api.types";

// Structured error system — codes, severity, Result<T,E>
export * from "./error.types";

// Overlay window system — position, panels, stealth, state
export * from "./overlay.types";

// Constant-derived types — PlanId, FeatureFlagId, ModelInfo, etc.
export * from "./constants.types";

// Supabase schema — Row/Insert/Update for every table
export * from "./supabase.types";
