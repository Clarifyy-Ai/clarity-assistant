import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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
    )
      v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

const local = load(".env.local");
const qa = load(".env.qa.local");
const supabaseUrl = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const token = local.SUPABASE_ACCESS_TOKEN;

async function q(sql) {
  const res = await fetch(
    "https://api.supabase.com/v1/projects/qzgvjrvtkwlzxpmlddkx/database/query",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  return JSON.parse(await res.text());
}

const exam = (await q(`
  select e.id as exam_id, s.id as stage_id, e.code
  from gov_exams e
  join gov_exam_stages s on s.exam_id = e.id
  where e.code = 'IBPS_PO'
  limit 1
`))[0];
console.log("exam", exam);

const sign = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: qa.QA_USER_A_EMAIL, password: qa.QA_USER_A_PASSWORD }),
});
const session = await sign.json();
if (!session.access_token) {
  console.log("signin_failed", sign.status, JSON.stringify(session).slice(0, 300));
  process.exit(2);
}

const credits = (await q(`select credits from profiles where id = '${session.user.id}'`))[0];
console.log("credits", credits);

const idempotencyKey = crypto.randomUUID();
const create = await fetch(`${supabaseUrl}/functions/v1/create-exam-paper`, {
  method: "POST",
  headers: {
    apikey: anon,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    examId: exam.exam_id,
    stageId: exam.stage_id,
    mode: "custom_mock",
    language: "en",
    questionCount: 10,
    idempotencyKey,
    generator: "auto",
  }),
});
const createText = await create.text();
console.log("create", create.status, createText.slice(0, 800));
let jobId = null;
try {
  const parsed = JSON.parse(createText);
  jobId = parsed.jobId || parsed.job_id;
} catch {
  /* ignore */
}
if (!jobId) process.exit(3);

for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const poll = await fetch(`${supabaseUrl}/functions/v1/get-paper-generation-job`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jobId }),
  });
  const pollText = await poll.text();
  console.log("poll", i + 1, poll.status, pollText.slice(0, 400));
  try {
    const parsed = JSON.parse(pollText);
    const status = parsed.status;
    if (["completed", "failed_permanent", "failed_retryable", "cancelled", "failed"].includes(status)) {
      const row = await q(`
        select id, status, credits_reserved, credits_charged, credits_finalized_at, credits_released_at,
               mock_test_id, generated_paper_id, error_code, error_message
        from gov_paper_generation_jobs where id = '${jobId}'
      `);
      console.log("job_row", JSON.stringify(row));
      process.exit(status === "completed" ? 0 : 4);
    }
  } catch {
    /* continue */
  }
}
process.exit(5);
