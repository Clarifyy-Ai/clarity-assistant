#!/usr/bin/env node
/**
 * Government exam pilot ops snapshot.
 * Prefers SUPABASE_ACCESS_TOKEN (Management API SQL). Falls back to
 * SUPABASE_SERVICE_ROLE_KEY REST counts (same pattern as gov-bank-readiness.mjs).
 *
 * Reports:
 *   - gov_exams by review_state
 *   - gov_paper_generation_jobs by status (last 7 days)
 *   - bank readiness summary
 *   - question_translations by review_state if table exists
 *   - open content_quality_incidents (and status breakdown) if table exists
 *   - source_ingestion_jobs by status if exists
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/gov-exam-ops-snapshot.mjs
 *   # or with service role in env / .env.local:
 *   node scripts/gov-exam-ops-snapshot.mjs
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

function printSection(title) {
  console.log(`\n## ${title}`);
}

function printRows(rows) {
  if (!rows?.length) {
    console.log("(no rows)");
    return;
  }
  console.log(JSON.stringify(rows, null, 2));
}

function statusOf(approved, required) {
  if (approved <= 0) return "empty";
  if (required > 0 && approved >= required) return "ready";
  return "partial";
}

async function queryMgmt(sql) {
  const res = await postManagement(sql);
  if (res.status >= 300) {
    return { ok: false, status: res.status, error: res.body.slice(0, 500) };
  }
  try {
    return { ok: true, rows: JSON.parse(res.body) };
  } catch {
    return { ok: false, status: res.status, error: res.body.slice(0, 500) };
  }
}

async function viaManagement() {
  console.log(`mode=management_api project_ref=${ref}`);
  console.log(`generated_at=${new Date().toISOString()}`);

  printSection("gov_exams by review_state");
  const exams = await queryMgmt(`
SELECT review_state, COUNT(*)::int AS count
FROM public.gov_exams
GROUP BY review_state
ORDER BY review_state;
`.trim());
  if (!exams.ok) {
    console.error("FAILED", exams.status, exams.error);
    return false;
  }
  printRows(exams.rows);

  printSection("gov_paper_generation_jobs by status (last 7 days)");
  const jobs = await queryMgmt(`
SELECT status, COUNT(*)::int AS count
FROM public.gov_paper_generation_jobs
WHERE created_at > now() - interval '7 days'
GROUP BY status
ORDER BY status;
`.trim());
  if (!jobs.ok) console.error("FAILED", jobs.error);
  else if (!jobs.rows.length) console.log("(no jobs in last 7 days)");
  else printRows(jobs.rows);

  printSection("failed job error_codes (last 7 days)");
  const jobErrors = await queryMgmt(`
SELECT COALESCE(error_code, '(null)') AS error_code, COUNT(*)::int AS count
FROM public.gov_paper_generation_jobs
WHERE created_at > now() - interval '7 days'
  AND status = 'failed'
GROUP BY 1
ORDER BY count DESC;
`.trim());
  if (jobErrors.ok) printRows(jobErrors.rows);
  else console.log("skipped:", jobErrors.error);

  printSection("bank readiness summary");
  const readiness = await queryMgmt(`
SELECT
  exam_code,
  status,
  approved_public_count,
  required_questions,
  full_simulation_available
FROM public.get_gov_exam_bank_readiness(NULL)
ORDER BY exam_code;
`.trim());
  if (readiness.ok) {
    printRows(readiness.rows);
    const ready = readiness.rows.filter(
      (r) => r.status === "ready" || r.full_simulation_available === true,
    ).length;
    console.log(`summary: ${readiness.rows.length} exam(s); ${ready} full-sim ready`);
  } else {
    console.warn("get_gov_exam_bank_readiness() unavailable");
    console.warn(readiness.error);
  }

  printSection("question_translations by review_state");
  const qtExists = await queryMgmt(`
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'question_translations'
) AS exists;
`.trim());
  if (qtExists.ok && qtExists.rows[0]?.exists) {
    const qt = await queryMgmt(`
SELECT review_state, COUNT(*)::int AS count
FROM public.question_translations
GROUP BY review_state
ORDER BY review_state;
`.trim());
    if (qt.ok) {
      printRows(
        qt.rows.length
          ? qt.rows
          : [{ review_state: "(empty table)", count: 0 }],
      );
    } else console.error("FAILED", qt.error);
  } else {
    console.log("(table question_translations does not exist)");
  }

  printSection("content_quality_incidents (open + by status)");
  const cqiExists = await queryMgmt(`
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'content_quality_incidents'
) AS exists;
`.trim());
  if (cqiExists.ok && cqiExists.rows[0]?.exists) {
    const cqiOpen = await queryMgmt(`
SELECT COUNT(*)::int AS open_count
FROM public.content_quality_incidents
WHERE status IN ('open', 'triaging', 'triaged');
`.trim());
    const cqiByStatus = await queryMgmt(`
SELECT status, COUNT(*)::int AS count
FROM public.content_quality_incidents
GROUP BY status
ORDER BY status;
`.trim());
    if (cqiOpen.ok) {
      console.log(
        `open_or_triaging=${cqiOpen.rows[0]?.open_count ?? 0}`,
      );
    }
    if (cqiByStatus.ok) {
      printRows(
        cqiByStatus.rows.length
          ? cqiByStatus.rows
          : [{ status: "(empty table)", count: 0 }],
      );
    } else console.error("FAILED", cqiByStatus.error);
  } else {
    console.log("(table content_quality_incidents does not exist)");
  }

  printSection("source_ingestion_jobs by status");
  const siExists = await queryMgmt(`
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'source_ingestion_jobs'
) AS exists;
`.trim());
  if (siExists.ok && siExists.rows[0]?.exists) {
    const si = await queryMgmt(`
SELECT status, COUNT(*)::int AS count
FROM public.source_ingestion_jobs
GROUP BY status
ORDER BY status;
`.trim());
    if (si.ok) {
      printRows(
        si.rows.length ? si.rows : [{ status: "(empty table)", count: 0 }],
      );
    } else console.error("FAILED", si.error);
  } else {
    console.log("(table source_ingestion_jobs does not exist)");
  }

  printSection("human review backlog (lightweight)");
  const backlog = await queryMgmt(`
SELECT
  (SELECT COUNT(*)::int FROM public.questions WHERE (metadata->>'needs_review') = 'true')
    AS questions_needs_review,
  (SELECT COUNT(*)::int FROM public.previous_year_papers WHERE review_status IS DISTINCT FROM 'approved')
    AS previous_papers_not_approved;
`.trim());
  if (backlog.ok) printRows(backlog.rows);
  else console.log("skipped:", backlog.error);

  console.log("\nDone.");
  return true;
}

async function groupCount(table, column, extraFilter = "") {
  const res = await restGet(
    `/rest/v1/${table}`,
    `?select=${column}${extraFilter}&limit=10000`,
  );
  if (res.status === 404 || res.status === 406) {
    return { missing: true, groups: [] };
  }
  if (res.status >= 300) {
    return { missing: false, error: `${res.status} ${res.body.slice(0, 200)}`, groups: [] };
  }
  const rows = JSON.parse(res.body);
  const map = new Map();
  for (const r of rows) {
    const k = r[column] ?? "(null)";
    map.set(k, (map.get(k) || 0) + 1);
  }
  return {
    missing: false,
    groups: [...map.entries()]
      .map(([k, count]) => ({ [column]: k, count }))
      .sort((a, b) => String(a[column]).localeCompare(String(b[column]))),
  };
}

async function viaServiceRole() {
  if (!serviceKey || !supabaseUrl) return false;

  console.warn(
    "Using service-role REST counts (SUPABASE_ACCESS_TOKEN not set).\n",
  );
  console.log(`mode=service_role_rest project_ref=${ref}`);
  console.log(`generated_at=${new Date().toISOString()}`);

  printSection("gov_exams by review_state");
  const exams = await groupCount("gov_exams", "review_state");
  if (exams.error) {
    console.error("FAILED", exams.error);
    return false;
  }
  printRows(exams.groups);

  printSection("gov_paper_generation_jobs by status (last 7 days)");
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const jobs = await groupCount(
    "gov_paper_generation_jobs",
    "status",
    `&created_at=gte.${encodeURIComponent(since)}`,
  );
  if (jobs.error) console.error("FAILED", jobs.error);
  else if (!jobs.groups.length) console.log("(no jobs in last 7 days)");
  else printRows(jobs.groups);

  printSection("bank readiness summary");
  // Prefer RPC via PostgREST if exposed
  const rpcRes = await restGet(
    "/rest/v1/rpc/get_gov_exam_bank_readiness",
    "",
  );
  // RPC needs POST — use GET on view if present, else reuse readiness script logic lightly
  const viewRes = await restGet(
    "/rest/v1/gov_exam_bank_readiness",
    "?select=exam_code,status,approved_public_count,required_questions,full_simulation_available&order=exam_code",
  );
  if (viewRes.status < 300) {
    const rows = JSON.parse(viewRes.body);
    printRows(rows);
    const ready = rows.filter(
      (r) => r.status === "ready" || r.full_simulation_available === true,
    ).length;
    console.log(`summary: ${rows.length} exam(s); ${ready} full-sim ready`);
  } else {
    // Inline fallback counts (same as gov-bank-readiness service path)
    const examsRes = await restGet(
      "/rest/v1/gov_exams",
      "?select=id,code,name,legacy_exam_type&order=code",
    );
    if (examsRes.status >= 300) {
      console.error("bank readiness FAILED", examsRes.status, examsRes.body.slice(0, 200));
    } else {
      const examList = JSON.parse(examsRes.body);
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
      const stages =
        stagesRes.status < 300 ? JSON.parse(stagesRes.body) : [];
      const rows = [];
      for (const e of examList) {
        const st = stages
          .filter((s) => s.exam_id === e.id)
          .sort((a, b) => a.sort_order - b.sort_order)[0];
        const pat = patterns.find(
          (p) => p.exam_id === e.id && (!st || p.stage_id === st.id),
        );
        let approved = 0;
        if (e.legacy_exam_type) {
          const a = await restGet(
            "/rest/v1/questions",
            `?select=id&exam_type=eq.${encodeURIComponent(e.legacy_exam_type)}&is_public=eq.true&is_verified=eq.true&limit=1`,
          );
          approved = countFromRange(a.headers);
        }
        const required = pat?.total_questions ?? 0;
        const status = statusOf(approved, required);
        rows.push({
          exam_code: e.code,
          status,
          approved_public_count: approved,
          required_questions: required,
          full_simulation_available: status === "ready",
        });
      }
      printRows(rows);
      const ready = rows.filter((r) => r.status === "ready").length;
      console.log(`summary: ${rows.length} exam(s); ${ready} full-sim ready`);
      void rpcRes;
    }
  }

  printSection("question_translations by review_state");
  const qt = await groupCount("question_translations", "review_state");
  if (qt.missing) console.log("(table question_translations does not exist)");
  else if (qt.error) console.error("FAILED", qt.error);
  else if (!qt.groups.length) printRows([{ review_state: "(empty table)", count: 0 }]);
  else printRows(qt.groups);

  printSection("content_quality_incidents (open + by status)");
  const cqi = await groupCount("content_quality_incidents", "status");
  if (cqi.missing) {
    console.log("(table content_quality_incidents does not exist)");
  } else if (cqi.error) {
    console.error("FAILED", cqi.error);
  } else {
    const openStatuses = new Set(["open", "triaging", "triaged"]);
    const openCount = cqi.groups
      .filter((g) => openStatuses.has(String(g.status)))
      .reduce((n, g) => n + (g.count || 0), 0);
    console.log(`open_or_triaging=${openCount}`);
    if (!cqi.groups.length) printRows([{ status: "(empty table)", count: 0 }]);
    else printRows(cqi.groups);
  }

  printSection("source_ingestion_jobs by status");
  const si = await groupCount("source_ingestion_jobs", "status");
  if (si.missing) console.log("(table source_ingestion_jobs does not exist)");
  else if (si.error) console.error("FAILED", si.error);
  else if (!si.groups.length) printRows([{ status: "(empty table)", count: 0 }]);
  else printRows(si.groups);

  printSection("human review backlog (lightweight)");
  const needsReview = await restGet(
    "/rest/v1/questions",
    "?select=id&metadata->>needs_review=eq.true&limit=1",
  );
  const pyp = await restGet(
    "/rest/v1/previous_year_papers",
    "?select=id&review_status=neq.approved&limit=1",
  );
  if (needsReview.status < 300 || pyp.status < 300) {
    printRows([
      {
        questions_needs_review:
          needsReview.status < 300 ? countFromRange(needsReview.headers) : null,
        previous_papers_not_approved:
          pyp.status < 300 ? countFromRange(pyp.headers) : null,
      },
    ]);
  } else {
    console.log("skipped (tables/filters unavailable via REST)");
  }

  console.log("\nDone.");
  return true;
}

console.log("gov-exam-ops-snapshot");

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
