import "./index.css";

// ── Boot error UI ──────────────────────────────────────────────────────────
//
// The real boot sequence lives in ./bootstrap and is loaded dynamically below.
// If any module in that graph throws while evaluating — most commonly
// src/lib/env.ts failing fast because a deploy shipped without
// VITE_SUPABASE_URL baked into the bundle — the dynamic import() rejects
// instead of crashing this entry script outright. We catch that rejection
// here and replace the boot splash with a clear, static error panel so users
// never get stuck on an infinite "Preparing your workspace" spinner.
//
// This intentionally keeps the fail-fast behavior in env.ts (we still refuse
// to run with missing config) — it only makes the failure visible.

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
}

function showBootError(error: unknown): void {
  console.error("[Clarify AI] Boot failed:", error);

  const message = error instanceof Error ? error.message : String(error);
  const isMissingEnv = /Missing required environment variable/i.test(message);

  document.getElementById("boot-splash")?.remove();

  const rootEl = document.getElementById("root") ?? document.body;

  const description = isMissingEnv
    ? "This deployment is missing required configuration (VITE_SUPABASE_URL and/or the Supabase keys). " +
      "The site owner needs to set these environment variables in the hosting dashboard and trigger a full " +
      "rebuild — this is not an issue with your device or network."
    : "The app hit an unexpected error while starting up. Try reloading the page; if this keeps happening, " +
      "please contact support.";

  rootEl.innerHTML =
    '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'gap:16px;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,\'Segoe UI\',sans-serif;' +
    'padding:24px;text-align:center;">' +
    '<h1 style="margin:0;font-size:20px;font-weight:700">Clarify AI failed to start</h1>' +
    '<p style="margin:0;max-width:32rem;font-size:14px;opacity:.8;line-height:1.6">' +
    escapeHtml(description) +
    "</p>" +
    '<pre style="margin:0;max-width:32rem;width:100%;white-space:pre-wrap;text-align:left;font-size:11px;' +
    'background:rgba(148,163,184,.12);padding:10px;border-radius:8px;overflow:auto;max-height:160px">' +
    escapeHtml(message) +
    "</pre>" +
    '<button id="boot-error-retry" style="cursor:pointer;border:0;border-radius:8px;padding:9px 16px;' +
    'font-size:13px;font-weight:600;background:#e2e8f0;color:#0f172a">Retry</button>' +
    "</div>";

  document.getElementById("boot-error-retry")?.addEventListener("click", () => {
    window.location.reload();
  });
}

void import("./bootstrap").catch(showBootError);
