#!/usr/bin/env node
/**
 * Writes NDJSON to debug-4a9592.log from a live Edge probe.
 * Does not print credentials.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = val;
  }
  return out;
}

const env = { ...loadEnv(".env.local"), ...loadEnv(".env.qa.local") };
const base = (env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL || "").replace(/\/$/, "");
const anon = env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const email = env.QA_PRO_EMAIL || env.QA_MAX_EMAIL;
const password = env.QA_PRO_PASSWORD || env.QA_MAX_PASSWORD;
const SSC = {
  examId: "350462c0-9111-4555-b19f-1eee6880cb22",
  stageId: "eebbace8-034e-4c38-8918-60c6a381ad62",
};
const logPath = path.join(process.cwd(), "debug-4a9592.log");

function log(hypothesisId, location, message, data) {
  const line = JSON.stringify({
    sessionId: "4a9592",
    runId: "post-fix",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  });
  fs.appendFileSync(logPath, line + "\n", "utf8");
  console.log(`${message} ${JSON.stringify(data)}`);
}

if (!base || !anon || !email || !password) {
  log("H-B", "probe:init", "missing_env", { hasBase: Boolean(base), hasAnon: Boolean(anon), hasEmail: Boolean(email) });
  process.exit(1);
}

async function signIn() {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) throw new Error(`auth ${res.status}`);
  return { token: json.access_token, userId: json.user?.id };
}

async function invoke(name, token, body) {
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
      Origin: "https://trycareerpilot.com",
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, code: json?.code ?? json?.errorCode ?? null, json, text: text.slice(0, 200) };
}

async function credits(token, userId) {
  const res = await fetch(`${base}/rest/v1/rpc/get_spendable_credits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_user_id: userId }),
  });
  const json = await res.json();
  return Number(json?.balance);
}

const auth = await signIn();
const before = await credits(auth.token, auth.userId);
log("H-C", "probe:credits", "credits_before", { balance: before });

const avail = await invoke("check-exam-paper-availability", auth.token, {
  examId: SSC.examId,
  stageId: SSC.stageId,
  mode: "custom_mock",
  language: "en",
  questionCount: 8,
});
log("H-B", "probe:availability", "availability", {
  status: avail.status,
  code: avail.code,
  available: avail.json?.available ?? null,
  blocked: avail.json?.blocked ?? null,
});

const key = `debug-4a9592-${Date.now()}`;
const created = await invoke("create-exam-paper", auth.token, {
  examId: SSC.examId,
  stageId: SSC.stageId,
  mode: "custom_mock",
  language: "en",
  questionCount: 8,
  idempotencyKey: key,
  generator: "edge",
});
log("H-C", "probe:create", "create_exam_paper", {
  status: created.status,
  code: created.code,
  jobStatus: created.json?.status ?? null,
  jobId: typeof created.json?.jobId === "string" ? created.json.jobId.slice(0, 8) : null,
  mockTestId: Boolean(created.json?.mockTestId),
  creditsCharged: created.json?.creditsCharged ?? null,
  generator: created.json?.generationPlan?.generator ?? created.json?.generator ?? null,
  error: typeof created.json?.error === "string" ? created.json.error.slice(0, 160) : null,
  text: created.text,
});

const replay = await invoke("create-exam-paper", auth.token, {
  examId: SSC.examId,
  stageId: SSC.stageId,
  mode: "custom_mock",
  language: "en",
  questionCount: 8,
  idempotencyKey: key,
  generator: "edge",
});
log("H-E", "probe:replay", "duplicate_create", {
  status: replay.status,
  replay: Boolean(replay.json?.idempotentReplay),
  sameJob:
    created.json?.jobId && replay.json?.jobId
      ? created.json.jobId === replay.json.jobId
      : null,
});

const jobId = created.json?.jobId || replay.json?.jobId;
let last = created;
let rateLimited = 0;
if (jobId) {
  for (let i = 0; i < 22; i++) {
    last = await invoke("get-paper-generation-job", auth.token, { jobId });
    if (last.status === 429) rateLimited += 1;
    log("H-A", "probe:poll", "poll_tick", {
      i,
      status: last.status,
      jobStatus: last.json?.status ?? null,
      code: last.code,
      mockTestId: Boolean(last.json?.mockTestId),
    });
    if (last.json?.status === "completed" || last.json?.mockTestId) break;
    if (["failed", "failed_retryable", "failed_permanent", "cancelled"].includes(String(last.json?.status ?? ""))) {
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

if (jobId && !last.json?.mockTestId && last.json?.status === "queued") {
  const kick = await invoke("process-paper-generation-job", auth.token, { jobId });
  log("H-C", "probe:nudge", "process_job", {
    status: kick.status,
    code: kick.code,
    jobStatus: kick.json?.status ?? null,
    mockTestId: Boolean(kick.json?.mockTestId),
  });
  last = await invoke("get-paper-generation-job", auth.token, { jobId });
  log("H-C", "probe:nudge", "after_nudge", {
    status: last.status,
    jobStatus: last.json?.status ?? null,
    mockTestId: Boolean(last.json?.mockTestId),
  });
}

const after = await credits(auth.token, auth.userId);
log("H-C", "probe:credits", "credits_after", {
  before,
  after,
  delta: Number.isFinite(before) && Number.isFinite(after) ? before - after : null,
  rateLimited,
  completed: Boolean(last.json?.mockTestId) || last.json?.status === "completed",
  finalJobStatus: last.json?.status ?? null,
});
