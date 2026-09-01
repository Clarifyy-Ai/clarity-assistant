import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const mgmt = local.SUPABASE_ACCESS_TOKEN;
const testId = process.argv[2] || "92b12272-777f-4839-8b4f-a6731e234a89";
const paperId = process.argv[3] || "c379f00e-9786-41b3-b72f-bf8ccc0b9b9f";

async function q(sql) {
  const res = await fetch(
    "https://api.supabase.com/v1/projects/qzgvjrvtkwlzxpmlddkx/database/query",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mgmt}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  return JSON.parse(await res.text());
}

const sign = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: anon, "Content-Type": "application/json" },
  body: JSON.stringify({ email: qa.QA_USER_A_EMAIL, password: qa.QA_USER_A_PASSWORD }),
});
const session = await sign.json();
if (!session.access_token) {
  console.log("signin_failed", JSON.stringify(session).slice(0, 200));
  process.exit(2);
}

async function edge(name, body) {
  const r = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(name, r.status, text.slice(0, 500));
  try {
    return { status: r.status, json: JSON.parse(text) };
  } catch {
    return { status: r.status, json: null, text };
  }
}

const started = await edge("start-exam", { testId });
if (started.status >= 400) process.exit(3);

const qs = await q(`
  select question_id, sort_order
  from gov_generated_paper_questions
  where paper_id = '${paperId}'
  order by sort_order
  limit 10
`);
console.log("questions", Array.isArray(qs) ? qs.length : qs);

const first = Array.isArray(qs) ? qs[0] : null;
if (first?.question_id) {
  const saved = await edge("save-test-answer", {
    testId,
    answers: [
      {
        questionId: first.question_id,
        userAnswer: "A",
        isAttempted: true,
        isMarkedReview: true,
        timeSpentSeconds: 5,
        clientUpdatedAt: new Date().toISOString(),
      },
    ],
  });
  if (saved.status >= 400) process.exit(4);
}

const submitted = await edge("submit-test", { test_id: testId, idempotencyKey: `submit:${testId}` });
if (submitted.status >= 400 && submitted.status !== 409) process.exit(5);
const replay = await edge("submit-test", { test_id: testId, idempotencyKey: `submit:${testId}` });
console.log("replay_same", replay.status, replay.json?.alreadySubmitted || replay.json?.code || replay.json?.status);

const result = await q(`
  select id, status, score, percentage, started_at, expires_at, completed_at
  from mock_tests where id = '${testId}'
`);
console.log("mock_test", JSON.stringify(result));
process.exit(0);
