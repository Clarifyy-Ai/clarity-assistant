#!/usr/bin/env node
/**
 * Runtime probe for Government Exam credits, inventory, idempotency, and CORS.
 * Does not print tokens or credentials.
 *
 * Usage: node --use-system-ca scripts/probe-gov-exam-runtime.mjs
 */
import fs from "node:fs";

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
const APPROVED_ORIGIN = "https://trycareerpilot.com";
const UNAPPROVED_ORIGIN = "https://evil.example";

const SSC = {
  examId: "350462c0-9111-4555-b19f-1eee6880cb22",
  stageId: "eebbace8-034e-4c38-8918-60c6a381ad62",
};

if (!base || !anon || !email || !password) {
  console.error("Missing base/anon/QA credentials");
  process.exit(1);
}

const failures = [];
function check(name, ok, extra = "") {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`;
  console.log(line);
  if (!ok) failures.push(line);
}

async function signIn() {
  const res = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`auth ${res.status}`);
  }
  return { token: json.access_token, userId: json.user?.id };
}

async function invoke(name, { token, origin, body, extraHeaders }) {
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      "Content-Type": "application/json",
      Origin: origin ?? APPROVED_ORIGIN,
      ...(extraHeaders ?? {}),
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
  return {
    status: res.status,
    acao: res.headers.get("access-control-allow-origin"),
    code: json?.code ?? json?.errorCode ?? json?.data?.code ?? null,
    json: json?.data && typeof json.data === "object" ? { ...json, ...json.data } : json,
    text: text.slice(0, 240),
  };
}

async function options(name, origin) {
  const res = await fetch(`${base}/functions/v1/${name}`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,apikey,content-type",
    },
  });
  return {
    status: res.status,
    acao: res.headers.get("access-control-allow-origin"),
  };
}

const auth = await signIn();
console.log(`[probe-gov-exam] project=${base} user=${String(auth.userId).slice(0, 8)}…`);

const creditsRes = await fetch(
  `${base}/rest/v1/rpc/get_spendable_credits`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.token}`,
      apikey: anon,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_user_id: auth.userId }),
  },
);
const creditsJson = await creditsRes.json();
const balance = Number(creditsJson?.balance);
check(
  "server spendable credits",
  creditsRes.ok && creditsJson?.success === true && Number.isFinite(balance) && balance >= 3,
  `balance=${balance} status=${creditsRes.status}`,
);

const submitOpt = await options("submit-test", APPROVED_ORIGIN);
check(
  "submit-test OPTIONS approved origin",
  submitOpt.status < 400 && submitOpt.acao === APPROVED_ORIGIN,
  `status=${submitOpt.status} acao=${submitOpt.acao}`,
);

const submitBad = await options("submit-test", UNAPPROVED_ORIGIN);
check(
  "submit-test OPTIONS unapproved origin denied",
  submitBad.acao !== UNAPPROVED_ORIGIN && submitBad.acao !== "*",
  `acao=${submitBad.acao}`,
);

const paperOpt = await options("create-exam-paper", APPROVED_ORIGIN);
check(
  "create-exam-paper OPTIONS approved origin",
  paperOpt.status < 400 && paperOpt.acao === APPROVED_ORIGIN,
  `status=${paperOpt.status} acao=${paperOpt.acao}`,
);

const unauthSubmit = await fetch(`${base}/functions/v1/submit-test`, {
  method: "POST",
  headers: {
    Origin: "http://127.0.0.1:5000",
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: "{}",
});
const unauthAcao = unauthSubmit.headers.get("access-control-allow-origin");
check(
  "submit-test unauth POST is readable or CORS-safe",
  unauthSubmit.status === 401 && (unauthAcao === "*" || Boolean(unauthAcao)),
  `status=${unauthSubmit.status} acao=${unauthAcao}`,
);

const submitAuth = await invoke("submit-test", {
  token: auth.token,
  origin: APPROVED_ORIGIN,
  body: {
    test_id: "00000000-0000-4000-8000-000000000000",
    idempotencyKey: "submit:00000000-0000-4000-8000-000000000000",
  },
});
check(
  "submit-test auth POST echoes approved origin",
  submitAuth.acao === APPROVED_ORIGIN,
  `status=${submitAuth.status} acao=${submitAuth.acao} code=${submitAuth.code}`,
);

const inventory = await invoke("create-exam-paper", {
  token: auth.token,
  body: {
    examId: SSC.examId,
    stageId: SSC.stageId,
    mode: "official_previous",
    language: "en",
    questionCount: 100,
    idempotencyKey: `probe-inv-${Date.now()}`,
  },
});
check(
  "CASE C official 100-q blocked by inventory before charge (never fabricate PYQ)",
  inventory.status === 409 &&
    (inventory.code === "QUESTION_INVENTORY_INSUFFICIENT" ||
      inventory.code === "CONTENT_INSUFFICIENT"),
  `status=${inventory.status} code=${inventory.code} available=${inventory.json?.available} requested=${inventory.json?.requested}`,
);
check(
  "inventory denial is not PAYMENT_REQUIRED / 402",
  inventory.status !== 402 && inventory.code !== "PAYMENT_REQUIRED" && inventory.code !== "INSUFFICIENT_CREDITS",
  `status=${inventory.status} code=${inventory.code}`,
);

const afterInvCredits = await fetch(`${base}/rest/v1/rpc/get_spendable_credits`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${auth.token}`,
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_user_id: auth.userId }),
});
const afterInvJson = await afterInvCredits.json();
check(
  "inventory denial did not deduct credits",
  Number(afterInvJson?.balance) === balance,
  `before=${balance} after=${afterInvJson?.balance}`,
);

const skipGenerate = process.argv.includes("--skip-generate");
const available = Math.max(5, Math.min(8, Number(inventory.json?.available) || 0));
const genKey = `probe-gen-${Date.now()}`;
let firstGen = { status: 0, code: null, json: {}, text: "" };
let secondGen = { status: 0, code: null, json: {}, text: "" };
if (skipGenerate) {
  check("CASE A/B generate skipped (already verified this session)", true, "--skip-generate");
  const testsRes = await fetch(
    `${base}/rest/v1/mock_tests?user_id=eq.${auth.userId}&status=eq.COMPLETED&select=id&order=updated_at.desc&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        apikey: anon,
      },
    },
  );
  const testsJson = await testsRes.json();
  const mockTestId = Array.isArray(testsJson) ? testsJson[0]?.id : null;
  if (mockTestId) {
    const submitBody = {
      test_id: mockTestId,
      idempotencyKey: `submit:${mockTestId}`,
    };
    const [s1, s2] = await Promise.all([
      invoke("submit-test", { token: auth.token, origin: APPROVED_ORIGIN, body: submitBody }),
      invoke("submit-test", { token: auth.token, origin: APPROVED_ORIGIN, body: submitBody }),
    ]);
    check(
      "submit-test success/error echoes approved origin",
      s1.acao === APPROVED_ORIGIN && s2.acao === APPROVED_ORIGIN,
      `a=${s1.status}/${s1.acao} b=${s2.status}/${s2.acao}`,
    );
    const already = Boolean(s1.json?.already_completed && s2.json?.already_completed);
    check(
      "CASE F/G duplicate submit returns one result",
      s1.status < 300 && s2.status < 300 && already,
      `a=${s1.status} already=${Boolean(s1.json?.already_completed)} b=${s2.status} already=${Boolean(s2.json?.already_completed)}`,
    );
  } else {
    check("submit probe skipped — no completed mock test", false);
  }
} else if (available >= 5) {
  const genBody = {
    examId: SSC.examId,
    stageId: SSC.stageId,
    mode: "custom_mock",
    language: "en",
    questionCount: available,
    idempotencyKey: genKey,
  };
  [firstGen, secondGen] = await Promise.all([
    invoke("create-exam-paper", { token: auth.token, body: genBody }),
    invoke("create-exam-paper", { token: auth.token, body: genBody }),
  ]);
  const ids = [firstGen.json?.jobId, secondGen.json?.jobId].filter(Boolean);
  check(
    "CASE A/B custom set is not rejected for credits/payment",
    [firstGen, secondGen].every(
      (r) => r.code !== "INSUFFICIENT_CREDITS" && r.code !== "PAYMENT_REQUIRED" && r.status !== 402,
    ),
    `a=${firstGen.status}/${firstGen.code ?? firstGen.json?.status} b=${secondGen.status}/${secondGen.code ?? secondGen.json?.status}`,
  );
  check(
    "CASE D/E duplicate generate shares one job",
    ids.length === 2 && ids[0] === ids[1],
    `jobA=${ids[0] ?? "none"} jobB=${ids[1] ?? "none"} replay=${Boolean(firstGen.json?.idempotentReplay || secondGen.json?.idempotentReplay)}`,
  );

  let mockTestId = firstGen.json?.mockTestId || secondGen.json?.mockTestId || null;
  const jobId = ids[0];
  for (let i = 0; i < 25 && jobId && !mockTestId; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const job = await invoke("get-paper-generation-job", {
      token: auth.token,
      body: { jobId },
    });
    if (job.json?.mockTestId) mockTestId = job.json.mockTestId;
    if (["failed", "cancelled"].includes(String(job.json?.status ?? ""))) break;
  }

  if (mockTestId) {
    const submitBody = {
      test_id: mockTestId,
      idempotencyKey: `submit:${mockTestId}`,
    };
    const [s1, s2] = await Promise.all([
      invoke("submit-test", { token: auth.token, origin: APPROVED_ORIGIN, body: submitBody }),
      invoke("submit-test", { token: auth.token, origin: APPROVED_ORIGIN, body: submitBody }),
    ]);
    check(
      "submit-test success/error echoes approved origin",
      s1.acao === APPROVED_ORIGIN && s2.acao === APPROVED_ORIGIN,
      `a=${s1.status}/${s1.acao} b=${s2.status}/${s2.acao}`,
    );
    const already = Boolean(s1.json?.already_completed || s2.json?.already_completed);
    const bothOk = s1.status < 300 && s2.status < 300;
    check(
      "CASE F/G duplicate submit returns one result",
      bothOk && already,
      `a=${s1.status} already=${Boolean(s1.json?.already_completed)} b=${s2.status} already=${Boolean(s2.json?.already_completed)}`,
    );
  } else {
    check("submit probe skipped — paper job produced no mockTestId", false, `job=${jobId ?? "none"}`);
  }
} else {
  check("CASE A custom generate skipped — inventory < 5", false, `available=${available}`);
}

const afterGenCredits = await fetch(`${base}/rest/v1/rpc/get_spendable_credits`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${auth.token}`,
    apikey: anon,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_user_id: auth.userId }),
});
const afterGenJson = await afterGenCredits.json();
const charged = Number.isFinite(balance) && Number.isFinite(Number(afterGenJson?.balance))
  ? balance - Number(afterGenJson.balance)
  : null;
check(
  "duplicate generate charged at most once",
  charged === 0 || charged === 3,
  `before=${balance} after=${afterGenJson?.balance} delta=${charged}`,
);

const missingJwt = await invoke("create-exam-paper", {
  token: "not-a-jwt",
  body: { examId: SSC.examId, stageId: SSC.stageId, mode: "custom_mock", language: "en" },
});
check(
  "invalid JWT is not treated as insufficient credits",
  missingJwt.code !== "INSUFFICIENT_CREDITS" && missingJwt.status !== 402,
  `status=${missingJwt.status} code=${missingJwt.code}`,
);

if (failures.length) {
  console.error(`[probe-gov-exam] FAILED ${failures.length}`);
  process.exit(1);
}
console.log("[probe-gov-exam] OK");
