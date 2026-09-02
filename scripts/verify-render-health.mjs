#!/usr/bin/env node
/**
 * Minimal Render Python service health probe.
 *
 * Usage:
 *   node --use-system-ca scripts/verify-render-health.mjs
 *   PYTHON_SERVICE_URL=https://clarity-assistant-az05.onrender.com node --use-system-ca scripts/verify-render-health.mjs
 *
 * Reads PYTHON_SERVICE_URL from env (falls back to VITE_SCRAPER_URL, SCRAPER_URL, .env.local).
 */
import fs from "node:fs";

const RECOMMENDED_CORS_ORIGINS =
  "https://trycareerpilot.com,https://www.trycareerpilot.com,https://clarify.ai.sltfinanceindia.com";

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

const fileEnv = loadEnv(".env.local");
const base = (
  process.env.PYTHON_SERVICE_URL ||
  process.env.VITE_SCRAPER_URL ||
  process.env.SCRAPER_URL ||
  fileEnv.PYTHON_SERVICE_URL ||
  fileEnv.VITE_SCRAPER_URL ||
  fileEnv.SCRAPER_URL ||
  ""
).replace(/\/$/, "");

if (!base) {
  console.error(
    "[verify-render-health] Missing PYTHON_SERVICE_URL (or VITE_SCRAPER_URL / SCRAPER_URL)",
  );
  process.exit(1);
}

async function probe(path) {
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { path, status: res.status, body };
}

async function corsHint() {
  const origin = "https://trycareerpilot.com";
  const res = await fetch(`${base}/health`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "GET",
    },
  });
  const allowOrigin = res.headers.get("access-control-allow-origin");
  if (allowOrigin) {
    return `Access-Control-Allow-Origin=${allowOrigin} (preflight from ${origin})`;
  }
  return `No CORS header on OPTIONS preflight — set Render CORS_ORIGINS=${RECOMMENDED_CORS_ORIGINS}`;
}

console.log(`[verify-render-health] base=${base}`);

for (const path of ["/health", "/ready"]) {
  const result = await probe(path);
  console.log(JSON.stringify(result));
}

console.log(`[verify-render-health] cors_hint: ${await corsHint()}`);
