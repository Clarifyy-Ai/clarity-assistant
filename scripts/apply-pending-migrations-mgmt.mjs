#!/usr/bin/env node
/**
 * Apply pending local migrations via Supabase Management API when db push is blocked.
 * Records migration in schema_migrations via POST /v1/projects/{ref}/database/migrations
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

function mgmtRequest(method, apiPath, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : null;
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: apiPath,
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body),
              }
            : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: data }),
        );
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runQuery(sql) {
  const res = await mgmtRequest(
    "POST",
    `/v1/projects/${REF}/database/query`,
    { query: sql },
  );
  return res;
}

async function applyMigration(fileName) {
  const filePath = path.join(ROOT, "supabase", "migrations", fileName);
  const sql = fs.readFileSync(filePath, "utf8");
  const version = fileName.split("_")[0];
  const name = fileName.replace(/\.sql$/, "").replace(/^\d+_/, "");

  console.log(`APPLY ${fileName} (${sql.length} bytes)`);

  const res = await mgmtRequest(
    "POST",
    `/v1/projects/${REF}/database/migrations`,
    { name, query: sql },
  );

  const snippet = res.body.slice(0, 300);
  console.log(`  -> ${res.status} ${snippet}`);

  if (res.status >= 200 && res.status < 300) {
    return { fileName, version, ok: true };
  }

  // Already applied or duplicate version — verify version row exists
  if (res.status === 409 || /already exists|duplicate/i.test(res.body)) {
    const check = await runQuery(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = '${version}' LIMIT 1`,
    );
    if (check.status >= 200 && check.status < 300 && check.body.includes(version)) {
      console.log(`  -> skip (already recorded as ${version})`);
      return { fileName, version, ok: true, skipped: true };
    }
  }

  return { fileName, version, ok: false, status: res.status, body: snippet };
}

async function main() {
  const appliedRes = await runQuery(
    "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version",
  );
  let applied = new Set();
  if (appliedRes.status >= 200 && appliedRes.status < 300) {
    try {
      const rows = JSON.parse(appliedRes.body);
      applied = new Set(rows.map((r) => r.version));
    } catch {
      console.warn("Could not parse applied migrations list");
    }
  }

  const files = fs
    .readdirSync(path.join(ROOT, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pending = files.filter((f) => !applied.has(f.split("_")[0]));
  console.log(`Pending migrations: ${pending.length}\n`);

  const results = [];
  for (const file of pending) {
    const result = await applyMigration(file);
    results.push(result);
    if (!result.ok) {
      console.error(`FAILED on ${file}`);
      break;
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nDone: ${results.filter((r) => r.ok).length}/${pending.length} applied`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
