#!/usr/bin/env node
/**
 * Print per-exam question-bank readiness (public+verified vs pattern total).
 * Prefers SUPABASE_ACCESS_TOKEN (Management API + RPC). Falls back to
 * SUPABASE_SERVICE_ROLE_KEY / .env.local for REST counts (does not invent).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/gov-bank-readiness.mjs
 *   # or with service role in env / .env.local:
 *   node scripts/gov-bank-readiness.mjs
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

function printRows(rows) {
  console.log(
    [
      "exam_code".padEnd(20),
      "status".padEnd(10),
      "approved/required".padEnd(18),
      "public".padEnd(8),
      "full_sim".padEnd(10),
      "legacy_exam_type",
    ].join(" "),
  );
  console.log("-".repeat(100));

  for (const r of rows) {
    const approved = Number(r.approved_public_count) || 0;
    const required = Number(r.required_questions) || 0;
    const status = r.status || statusOf(approved, required);
    const fullSim =
      typeof r.full_simulation_available === "boolean"
        ? r.full_simulation_available
        : status === "ready";
    const coverage = `${approved}/${required}`;
    console.log(
      [
        String(r.exam_code ?? "").padEnd(20),
        String(status).padEnd(10),
        coverage.padEnd(18),
        String(r.public_count ?? "").padEnd(8),
        String(fullSim ? "yes" : "no").padEnd(10),
        String(r.legacy_exam_type ?? ""),
      ].join(" "),
    );
  }

  const ready = rows.filter((r) => (r.status || statusOf(
    Number(r.approved_public_count) || 0,
    Number(r.required_questions) || 0,
  )) === "ready").length;
  console.log(`\n${rows.length} exam(s); ${ready} ready for full simulation.`);
}

async function viaManagement() {
  const rpcQuery = `
SELECT
  exam_code,
  exam_name,
  legacy_exam_type,
  pattern_version,
  required_questions,
  approved_public_count,
  public_count,
  status,
  full_simulation_available
FROM public.get_gov_exam_bank_readiness(NULL)
ORDER BY exam_code;
`.trim();

  const primary = await postManagement(rpcQuery);
  if (primary.status < 300) {
    printRows(JSON.parse(primary.body));
    return true;
  }

  const fallback = `
SELECT
  e.code AS exam_code,
  e.name AS exam_name,
  e.legacy_exam_type,
  pv.version AS pattern_version,
  COALESCE(pv.total_questions, 0) AS required_questions,
  (
    SELECT COUNT(*)::bigint
    FROM public.questions q
    WHERE e.legacy_exam_type IS NOT NULL
      AND q.exam_type = e.legacy_exam_type
      AND q.is_public IS TRUE
      AND q.is_verified IS TRUE
  ) AS approved_public_count,
  (
    SELECT COUNT(*)::bigint
    FROM public.questions q
    WHERE e.legacy_exam_type IS NOT NULL
      AND q.exam_type = e.legacy_exam_type
      AND q.is_public IS TRUE
  ) AS public_count
FROM public.gov_exams e
LEFT JOIN LATERAL (
  SELECT pv2.version, pv2.total_questions
  FROM public.gov_exam_stages st
  JOIN public.gov_exam_pattern_versions pv2
    ON pv2.exam_id = e.id AND pv2.stage_id = st.id AND pv2.review_state = 'approved'
  WHERE st.exam_id = e.id
  ORDER BY st.sort_order ASC, pv2.effective_date DESC NULLS LAST
  LIMIT 1
) pv ON true
ORDER BY e.code;
`.trim();

  const fb = await postManagement(fallback);
  if (fb.status >= 300) {
    console.error("Management API query failed.");
    console.error("RPC:", primary.status, primary.body.slice(0, 600));
    console.error("Fallback:", fb.status, fb.body.slice(0, 600));
    return false;
  }
  console.warn(
    "Note: get_gov_exam_bank_readiness() missing — using fallback SQL. Apply migration 20260802160000_gov_exam_bank_readiness.sql.\n",
  );
  const rows = JSON.parse(fb.body).map((r) => {
    const approved = Number(r.approved_public_count) || 0;
    const required = Number(r.required_questions) || 0;
    const status = statusOf(approved, required);
    return {
      ...r,
      status,
      full_simulation_available: status === "ready",
    };
  });
  printRows(rows);
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
    if (e.legacy_exam_type) {
      const a = await restGet(
        "/rest/v1/questions",
        `?select=id&exam_type=eq.${encodeURIComponent(e.legacy_exam_type)}&is_public=eq.true&is_verified=eq.true&limit=1`,
      );
      const p = await restGet(
        "/rest/v1/questions",
        `?select=id&exam_type=eq.${encodeURIComponent(e.legacy_exam_type)}&is_public=eq.true&limit=1`,
      );
      approved = countFromRange(a.headers);
      pub = countFromRange(p.headers);
    }
    const required = pat?.total_questions ?? 0;
    const status = statusOf(approved, required);
    rows.push({
      exam_code: e.code,
      exam_name: e.name,
      legacy_exam_type: e.legacy_exam_type,
      pattern_version: pat?.version ?? null,
      required_questions: required,
      approved_public_count: approved,
      public_count: pub,
      status,
      full_simulation_available: status === "ready",
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
