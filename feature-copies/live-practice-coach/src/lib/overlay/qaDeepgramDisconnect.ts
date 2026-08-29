/**
 * QA-only Deepgram disconnect simulation.
 * Never enabled in production builds. Set localStorage
 * `clarify:qa-simulate-deepgram-disconnect=1` or `?qa_dg_disconnect=1`.
 */

const STORAGE_KEY = "clarify:qa-simulate-deepgram-disconnect";

function isProductionRuntime(): boolean {
  return Boolean(import.meta.env.PROD) &&
    String(import.meta.env.VITE_APP_ENV ?? "").toLowerCase() === "production";
}

export function isQaDeepgramDisconnectEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (isProductionRuntime()) return false;
  try {
    if (new URLSearchParams(window.location.search).get("qa_dg_disconnect") === "1") {
      return true;
    }
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}
