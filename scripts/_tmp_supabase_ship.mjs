#!/usr/bin/env node
/**
 * Apply all pending named local migrations + deploy all edge functions.
 * Usage: node --use-system-ca scripts/_tmp_supabase_ship.mjs [--migrations-only|--functions-only]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const REF = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN required");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const migrationsOnly = args.has("--migrations-only");
const functionsOnly = args.has("--functions-only");
const onlySlug = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);

/** Retired or scaffold-only slugs — never deploy (frees plan slots, avoids missing index.ts failures). */
const DEPLOY_SKIP_SLUGS = new Set(["parakeet-token"]);


const API = `https://api.supabase.com/v1/projects/${REF}`;
const headers = { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" };

async function api(pathname, init = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${pathname}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function isUuidName(name) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name);
}

async function applyMigrations() {
  const remote = await api("/database/migrations");
  const byName = new Set(remote.map((m) => m.name).filter(Boolean));
  const byVersion = new Set(remote.map((m) => String(m.version)));

  const migDir = path.join(ROOT, "supabase", "migrations");
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
  const toApply = [];

  console.log(`\nRemote migrations: ${remote.length}`);
  for (const file of files) {
    const base = file.replace(/\.sql$/, "");
    const m = base.match(/^(\d+)_(.+)$/);
    if (!m) continue;
    const [, ver, name] = m;
    // Skip Lovable UUID dump leftovers (usually already present under other versions)
    if (isUuidName(name)) continue;
    if (byVersion.has(ver) || byName.has(name)) continue;
    toApply.push({ file, ver, name });
  }

  console.log(`Pending named migrations: ${toApply.length}`);
  for (const item of toApply) {
    const full = path.join(migDir, item.file);
    const query = fs.readFileSync(full, "utf8");
    process.stdout.write(`  → ${item.file} ... `);
    try {
      await api("/database/migrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: item.name, query }),
      });
      console.log("OK");
      byVersion.add(item.ver);
      byName.add(item.name);
    } catch (e) {
      console.log("FAILED");
      console.error(`     ${e.message}`);
      item.error = e.message;
    }
  }
  const failed = toApply.filter((x) => x.error);
  return { applied: toApply.length - failed.length, failed, pending: toApply.map((t) => t.file) };
}

function walkTsFiles(dir, baseRel = "") {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.posix.join(baseRel, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
      out.push(...walkTsFiles(abs, rel));
    } else if (ent.name.endsWith(".ts") || ent.name.endsWith(".js") || ent.name.endsWith(".json")) {
      out.push({ abs, rel });
    }
  }
  return out;
}

function readVerifyJwt(slug) {
  const cfgPath = path.join(ROOT, "supabase", "config.toml");
  const text = fs.readFileSync(cfgPath, "utf8");
  const re = new RegExp(`\\[functions\\.${slug}\\][\\s\\S]*?verify_jwt\\s*=\\s*(true|false)`, "m");
  const m = text.match(re);
  if (m) return m[1] === "true";
  return true;
}

async function deployFunction(slug) {
  const fnDir = path.join(ROOT, "supabase", "functions", slug);
  const sharedDir = path.join(ROOT, "supabase", "functions", "_shared");
  const files = [
    ...walkTsFiles(fnDir, `supabase/functions/${slug}`),
    ...walkTsFiles(sharedDir, "supabase/functions/_shared"),
  ];
  if (!files.some((f) => f.rel.endsWith(`${slug}/index.ts`))) {
    throw new Error(`missing index.ts for ${slug}`);
  }

  const form = new FormData();
  const metadata = {
    name: slug,
    entrypoint_path: `supabase/functions/${slug}/index.ts`,
    verify_jwt: readVerifyJwt(slug),
  };
  form.append("metadata", JSON.stringify(metadata));
  for (const f of files) {
    const blob = new Blob([fs.readFileSync(f.abs)], { type: "application/typescript" });
    form.append("file", blob, f.rel);
  }

  const res = await fetch(`${API}/functions/deploy?slug=${encodeURIComponent(slug)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

async function deployAllFunctions() {
  const fnRoot = path.join(ROOT, "supabase", "functions");
  const slugs = (
    onlySlug
      ? [onlySlug]
      : fs
          .readdirSync(fnRoot)
          .filter(
            (n) =>
              !n.startsWith("_") &&
              !DEPLOY_SKIP_SLUGS.has(n) &&
              fs.statSync(path.join(fnRoot, n)).isDirectory(),
          )
  ).sort();
  console.log(`\nDeploying ${slugs.length} functions via Management API...`);
  const ok = [];
  const failed = [];
  for (const slug of slugs) {
    process.stdout.write(`  → ${slug.padEnd(40)}`);
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const r = await deployFunction(slug);
        console.log(`OK v${r.version ?? "?"}${attempt > 1 ? ` (retry ${attempt})` : ""}`);
        ok.push(slug);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
    if (lastErr) {
      console.log("FAILED");
      console.error(`     ${lastErr.message}`);
      failed.push({ slug, error: lastErr.message });
    }
  }
  return { ok, failed };
}

async function fetchRecentLogs() {
  console.log("\nChecking function inventory + health...");
  const list = await api("/functions");
  const active = list.filter((f) => String(f.status).toUpperCase() === "ACTIVE");
  console.log(`  Active functions: ${active.length}/${list.length}`);
  const recent = [...list].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 10);
  for (const f of recent) {
    const ts = f.updated_at ? new Date(f.updated_at).toISOString() : "?";
    console.log(`  ${f.slug.padEnd(36)} v${f.version} ${f.status} updated=${ts}`);
  }

  const start = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const end = new Date().toISOString();
  const sql = "select id, timestamp, event_message from edge_logs order by timestamp desc limit 15";
  const url =
    `https://api.supabase.com/v1/projects/${REF}/analytics/endpoints/logs.all` +
    `?iso_timestamp_start=${encodeURIComponent(start)}` +
    `&iso_timestamp_end=${encodeURIComponent(end)}` +
    `&sql=${encodeURIComponent(sql)}`;
  const logRes = await fetch(url, { headers });
  const logBody = await logRes.json();
  console.log(`\nEdge/API logs (status=${logRes.status}):`);
  const rows = logBody.result || [];
  for (const row of rows.slice(0, 12)) {
    const ts = row.timestamp ? new Date(Number(row.timestamp) / 1000).toISOString() : "?";
    console.log(`  ${ts} ${String(row.event_message || "").slice(0, 140)}`);
  }

  const base = `https://${REF}.supabase.co/functions/v1`;
  for (const slug of ["ping", "health"]) {
    const r = await fetch(`${base}/${slug}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    console.log(`  invoke ${slug}: ${r.status} ${(await r.text()).slice(0, 80)}`);
  }
}

const result = { migrations: null, functions: null };
if (!functionsOnly) {
  result.migrations = await applyMigrations();
}
if (!migrationsOnly) {
  result.functions = await deployAllFunctions();
}
try {
  await fetchRecentLogs();
} catch (e) {
  console.error("Log check failed:", e.message);
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify(result, null, 2));
if (result.migrations?.failed?.length || result.functions?.failed?.length) {
  process.exit(1);
}
