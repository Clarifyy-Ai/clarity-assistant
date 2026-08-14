#!/usr/bin/env node
/**
 * One-shot: generate (or reuse) EXAM_SCRAPE_CRON_SECRET, push it to Edge
 * Function secrets + Vault, so pg_cron can invoke run-daily-exam-scrape.
 *
 * Never prints the secret value.
 *
 *   node --use-system-ca scripts/setup-daily-exam-scrape-cron.mjs
 */
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function requestJson(method, apiPath, token, body) {
  const payload = body == null ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, data }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(root, ".env.local")),
    ...process.env,
  };
  const token = env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error("Set SUPABASE_ACCESS_TOKEN in .env.local");
    process.exit(1);
  }

  const existing = String(env.EXAM_SCRAPE_CRON_SECRET || "").trim();
  const secret =
    existing.length > 16 ? existing : crypto.randomBytes(32).toString("hex");
  const generated = secret !== existing;

  console.log(`Setting Edge secret EXAM_SCRAPE_CRON_SECRET (${generated ? "generated" : "from env"})`);
  const secretRes = await requestJson("POST", `/v1/projects/${PROJECT_REF}/secrets`, token, [
    { name: "EXAM_SCRAPE_CRON_SECRET", value: secret },
  ]);
  if (secretRes.status < 200 || secretRes.status >= 300) {
    console.error(`Edge secret failed (${secretRes.status}): ${secretRes.data.slice(0, 400)}`);
    process.exit(1);
  }
  console.log("OK Edge secret");

  const vaultSql = `
do $setup$
declare
  existing_id uuid;
begin
  select id into existing_id from vault.secrets where name = 'exam_scrape_cron_secret' limit 1;
  if existing_id is null then
    perform vault.create_secret(
      ${sqlLiteral(secret)},
      'exam_scrape_cron_secret',
      'Auth header for daily exam scrape Edge Function',
      null
    );
  else
    perform vault.update_secret(
      existing_id,
      ${sqlLiteral(secret)},
      'exam_scrape_cron_secret',
      'Auth header for daily exam scrape Edge Function',
      null
    );
  end if;

  select id into existing_id from vault.secrets where name = 'project_url' limit 1;
  if existing_id is null then
    perform vault.create_secret(
      ${sqlLiteral(PROJECT_URL)},
      'project_url',
      'Supabase API URL for pg_cron Edge Function calls',
      null
    );
  end if;
end
$setup$;
`.trim();

  console.log("Upserting Vault secrets exam_scrape_cron_secret + project_url");
  const sqlRes = await requestJson(
    "POST",
    `/v1/projects/${PROJECT_REF}/database/query`,
    token,
    { query: vaultSql },
  );
  if (sqlRes.status < 200 || sqlRes.status >= 300) {
    console.error(`Vault SQL failed (${sqlRes.status}): ${sqlRes.data.slice(0, 400)}`);
    process.exit(1);
  }
  console.log("OK Vault secrets");
  console.log("Daily scrape cron auth is configured. Secret value was not printed.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
