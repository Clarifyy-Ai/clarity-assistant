#!/usr/bin/env node
/**
 * Per-exam verification runway: public, verified, needed for ready.
 * Prefers SUPABASE_ACCESS_TOKEN (Management API). Falls back to
 * SUPABASE_SERVICE_ROLE_KEY / .env.local for REST counts (does not invent).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/gov-bank-verify-stats.mjs
 *   node scripts/gov-bank-verify-stats.mjs
 */
import fs from "node:fs";
import https from "node:https";
import path from "node:path";

const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(path.join(process.cwd(), ".env")),
  ...loadEnvFile(path.join(process.cwd(), ".env.local")),
};

const token = process.env.SUPABASE_ACCESS_TOKEN || fileEnv.SUPABASE_ACCESS_TOKEN;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  fileEnv.SUPABASE_URL ||
  fileEnv.VITE_SUPABASE_URL;

function postManagement(query) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: "api.supabase.com",
        path: `/v1/projects/${ref}/database/query`,
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: data });
        });
      },
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function restGet(pathname, search) {
  const url = new URL(supabaseUrl);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: url.hostname,
        path: pathname + search,
        method: "GET",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Accept: "application/json",
          Prefer: "count=exact",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function countFromRange(headers) {
  const cr = headers["content-range"] || headers["Content-Range"];
  if (!cr) return 0;
  return Number(String(cr).split("/")[1]) || 0;
}

function statusOf(approved, required) {
  if (approved <= 0) return "empty";
  if (required > 0 && approved >= required) return "ready";
  return "partial";
}

function verifiesNeeded(approved, required) {
  return Math.max(0, (Number(required) || 0) - (Number(approved) || 0));
}

function printRows(rows) {
  console.log(
    [
      "exam_code".padEnd(20),
      "status".padEnd(10),
      "verified".padEnd(10),
      "public".padEnd(8),
      "unverified".padEnd(11),
      "needed".padEnd(8),
      "pattern".padEnd(8),
      "legacy_exam_type",
    ].join(" "),
  );
  console.log("-".repeat(110));

  for (const r of rows) {
    const approved = Number(r.approved_public_count) || 0;
    const required = Number(r.required_questions) || 0;
    const pub = Number(r.public_count) || 0;
    const unverified =
      r.unverified_public_count != null
        ? Number(r.unverified_public_count) || 0
        : Math.max(0, pub - approved);
    const needed =
      r.verifies_needed != null
        ? Number(r.verifies_needed) || 0
        : verifiesNeeded(approved, required);
    const status = r.status || statusOf(approved, required);
    console.log(
      [
        String(r.exam_code ?? "").padEnd(20),
        String(status).padEnd(10),
        String(approved).padEnd(10),
        String(pub).padEnd(8),
        String(unverified).padEnd(11),
        String(needed).padEnd(8),
        String(required).padEnd(8),
        String(r.legacy_exam_type ?? ""),
      ].join(" "),
    );
  }

  const totalNeeded = rows.reduce(
    (n, r) =>
      n +
      (r.verifies_needed != null
        ? Number(r.verifies_needed) || 0
        : verifiesNeeded(r.approved_public_count, r.required_questions)),
    0,
  );
  const ready = rows.filter(
    (r) =>
      (r.status ||
        statusOf(
          Number(r.approved_public_count) || 0,
          Number(r.required_questions) || 0,
        )) === "ready",
  ).length;
  console.log(
    `\n${rows.length} exam(s); ${ready} ready; ${totalNeeded} total verifies still needed for all packs to reach ready.`,
  );
  console.log(
    "Note: Do not auto-verify. Use Admin → Gov Exams → Q Review (public+unverified) with explicit confirm.",
  );
}

async function viaManagement() {
  const query = `
WITH readiness AS (
  SELECT *
  FROM public.get_gov_exam_bank_readiness(NULL)
)
SELECT
  r.exam_code,
  r.exam_name,
  r.legacy_exam_type,
  r.required_questions,
  r.approved_public_count,
  r.public_count,
  r.status,
  GREATEST(0, r.required_questions - r.approved_public_count)::int AS verifies_needed,
  COALESCE((
    SELECT COUNT(*)::int
    FROM public.questions q
    WHERE r.legacy_exam_type IS NOT NULL
      AND q.exam_type = r.legacy_exam_type
      AND q.is_public IS TRUE
      AND q.is_verified IS FALSE
  ), 0) AS unverified_public_count
FROM readiness r
ORDER BY r.exam_code;
`.trim();

  const res = await postManagement(query);
  if (res.status >= 300) {
    console.error("Management API query failed:", res.status, res.body.slice(0, 600));
    return false;
  }
  printRows(JSON.parse(res.body));
  return true;
}

async function viaServiceRole() {
  if (!serviceKey || !supabaseUrl) return false;

  console.warn(
    "Using service-role REST counts (SUPABASE_ACCESS_TOKEN not set).\n",
  );

  const examsRes = await restGet(
    "/rest/v1/gov_exams",
    "?select=id,code,name,legacy_exam_type&order=code",
  );
  if (examsRes.status >= 300) {
    console.error("gov_exams", examsRes.status, examsRes.body.slice(0, 400));
    return false;
  }
  const exams = JSON.parse(examsRes.body);
  const patternsRes = await restGet(
    "/rest/v1/gov_exam_pattern_versions",
    "?select=exam_id,stage_id,version,total_questions,effective_date&review_state=eq.approved&order=effective_date.desc",
  );
  const patterns =
    patternsRes.status < 300 ? JSON.parse(patternsRes.body) : [];
  const stagesRes = await restGet(
    "/rest/v1/gov_exam_stages",
    "?select=id,exam_id,code,sort_order&order=sort_order.asc",
  );
  const stages = stagesRes.status < 300 ? JSON.parse(stagesRes.body) : [];

  const rows = [];
  for (const e of exams) {
    const st = stages
      .filter((s) => s.exam_id === e.id)
      .sort((a, b) => a.sort_order - b.sort_order)[0];
    const pat = patterns.find(
      (p) => p.exam_id === e.id && (!st || p.stage_id === st.id),
    );
    let approved = 0;
    let pub = 0;
    let unverified = 0;
    if (e.legacy_exam_type) {
      const a = await restGet(
        "/rest/v1/questions",
        `?select=id&exam_type=eq.${encodeURIComponent(e.legacy_exam_type)}&is_public=eq.true&is_verified=eq.true&limit=1`,
      );
      const p = await restGet(
        "/rest/v1/questions",
        `?select=id&exam_type=eq.${encodeURIComponent(e.legacy_exam_type)}&is_public=eq.true&limit=1`,
      );
      const u = await restGet(
        "/rest/v1/questions",
        `?select=id&exam_type=eq.${encodeURIComponent(e.legacy_exam_type)}&is_public=eq.true&is_verified=eq.false&limit=1`,
      );
      approved = countFromRange(a.headers);
      pub = countFromRange(p.headers);
      unverified = countFromRange(u.headers);
    }
    const required = pat?.total_questions ?? 0;
    const status = statusOf(approved, required);
    rows.push({
      exam_code: e.code,
      exam_name: e.name,
      legacy_exam_type: e.legacy_exam_type,
      required_questions: required,
      approved_public_count: approved,
      public_count: pub,
      unverified_public_count: unverified,
      verifies_needed: verifiesNeeded(approved, required),
      status,
    });
  }
  printRows(rows);
  return true;
}

if (token) {
  const ok = await viaManagement();
  process.exit(ok ? 0 : 1);
}

const ok = await viaServiceRole();
if (!ok) {
  console.error(
    "Need SUPABASE_ACCESS_TOKEN (Management API) or SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL.",
  );
  process.exit(1);
}
