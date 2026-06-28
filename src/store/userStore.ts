// ─────────────────────────────────────────────────────────────────────────────
// userStore.ts
//
// useAuthStore is now the single Zustand store defined in authStore.ts.
// All 50+ components that import from this file get the real, initialised
// auth state without any wrapper — eliminating the "Maximum update depth
// exceeded" infinite loop that was caused by returning a new object on every
// render.
//
// Notification store lives in notificationStore.ts — do not duplicate here.
// ─────────────────────────────────────────────────────────────────────────────

export { useAuthStore } from "./authStore";
