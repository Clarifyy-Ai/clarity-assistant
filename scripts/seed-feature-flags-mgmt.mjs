#!/usr/bin/env node
/**
 * Upsert missing feature_flags rows on staging (is_enabled=true).
 * Kill-switches only hide when is_enabled=false.
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";

if (process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const FLAG_KEYS = [
  "live_assist",
  "mock_sessions",
  "answer_bank",
  "star_builder",
  "rephraser",
  "ai_coach",
  "company_research",
  "coding_hints",
  "system_design",
  "session_debrief",
  "resume_analysis",
  "overlay",
  "screenshot_capture",
  "audio_analysis",
  "filler_detection",
  "wpm_tracking",
  "diarization",
  "analytics",
  "byok",
  "calendar_sync",
  "priority_support",
  "coach_sessions",
  "experimental_ui",
  "debug_panel",
  "beta_models",
  "mock_test_ai",
  "gov_exam_ai_fill",
];

function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(".env.local");

const token = process.env.SUPABASE_ACCESS_TOKEN || "";
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing");
  process.exit(1);
}

function runQuery(sql) {
  const payload = JSON.stringify({ query: sql });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${REF}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            reject(new Error(`${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve([]);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function main() {
  const existing = await runQuery(`SELECT key FROM public.feature_flags`);
  const have = new Set((existing || []).map((r) => r.key));
  const missing = FLAG_KEYS.filter((k) => !have.has(k));

  if (missing.length === 0) {
    console.log(`All ${FLAG_KEYS.length} feature flag keys present.`);
    return;
  }

  console.log(`Inserting ${missing.length} missing flags…`);
  for (const key of missing) {
    const name = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const sql = `
      INSERT INTO public.feature_flags (key, name, is_enabled, description, rollout_percent)
      VALUES ('${key}', '${name.replace(/'/g, "''")}', true, 'Auto-seeded for kill-switch parity', 100)
      ON CONFLICT (key) DO NOTHING
    `;
    await runQuery(sql);
    console.log(`  + ${key}`);
  }
  console.log("done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
