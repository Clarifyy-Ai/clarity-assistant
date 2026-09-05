#!/usr/bin/env node
/**
 * Set CORS_ORIGINS on Render clarity-scraper and trigger deploy.
 * Usage: node --use-system-ca scripts/sync-render-cors-origins.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE_ID = process.env.RENDER_SERVICE_ID || "srv-da58j1qjobas73dtjbk0";
const CORS_ORIGINS =
  process.env.CORS_ORIGINS ||
  "https://trycareerpilot.com,https://www.trycareerpilot.com";

function load(file) {
  const p = path.join(ROOT, file);
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

const local = load(".env.local");
const apiKey = process.env.RENDER_API_KEY || local.RENDER_API_KEY || "";
if (!apiKey) {
  console.error("RENDER_API_KEY missing");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const put = await fetch(
  `https://api.render.com/v1/services/${SERVICE_ID}/env-vars/CORS_ORIGINS`,
  { method: "PUT", headers, body: JSON.stringify({ value: CORS_ORIGINS }) },
);
console.log("cors_put", put.status);
if (!put.ok) {
  console.error((await put.text()).slice(0, 300));
  process.exit(2);
}

const dep = await fetch(`https://api.render.com/v1/services/${SERVICE_ID}/deploys`, {
  method: "POST",
  headers,
  body: JSON.stringify({ clearCache: "do_not_clear" }),
});
const depText = await dep.text();
console.log("deploy", dep.status, depText.slice(0, 200));
process.exit(dep.ok ? 0 : 3);
