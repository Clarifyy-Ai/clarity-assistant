/**
 * Full app workflow smoke — create session, coach, gov, prep, docs-adjacent.
 */
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function load(p) {
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
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

function note(id, status, detail) {
  console.log(JSON.stringify({ id, status, detail }));
  return { id, status, detail };
}

const local = load(".env.local");
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const results = [];

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: auth, error: authErr } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (authErr || !auth.session) {
  results.push(note("AUTH", "BROKEN", authErr?.message || "no session"));
  console.log(JSON.stringify({ results }, null, 2));
  process.exit(2);
}
const tok = auth.session.access_token;
const uid = auth.session.user.id;
const headers = {
  Authorization: `Bearer ${tok}`,
  apikey: anon,
  "Content-Type": "application/json",
};

async function edge(fn, body, method = "POST", query = "") {
  const r = await fetch(`${url}/functions/v1/${fn}${query}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: r.status, text: text.slice(0, 280), json };
}

// Credits / profile
{
  const { data: profile, error: profileErr } = await client
    .from("profiles")
    .select("plan_id, credits, region")
    .eq("id", uid)
    .maybeSingle();
  results.push(
    note(
      "PROFILE",
      profile?.plan_id && profile?.credits != null ? "OK" : "BROKEN",
      `plan=${profile?.plan_id} credits=${profile?.credits} region=${profile?.region} err=${profileErr?.message || ""}`,
    ),
  );
}

// Start / restore session for coach
let sessionId = null;
{
  const r = await edge("start-session", {
    session_type: "practice",
    mode: "practice",
    title: "blocker-smoke",
  });
  sessionId = r.json?.session_id || r.json?.session?.id || r.json?.id || null;
  if (!sessionId) {
    // try restore
    const rest = await edge("start-session", {
      action: "restore",
      session_type: "practice",
    });
    sessionId =
      rest.json?.session_id ||
      rest.json?.session?.id ||
      null;
    results.push(
      note(
        "START_SESSION",
        sessionId ? "OK" : r.status < 500 ? "PARTIAL" : "BROKEN",
        `start=${r.status} ${r.text} restore=${rest.status} sid=${sessionId}`,
      ),
    );
  } else {
    results.push(
      note("START_SESSION", "OK", `http=${r.status} sid=${sessionId}`),
    );
  }
}

// Coach chat
{
  const body = sessionId
    ? { message: "Give one short tip for interviews.", session_id: sessionId }
    : { message: "Give one short tip.", mode: "practice" };
  const r = await edge("ai-coach-chat", body);
  results.push(
    note(
      "AI_COACH",
      r.status === 200 && r.json?.success !== false
        ? "OK"
        : r.status === 403 && r.json?.code === "FEATURE_DISABLED"
          ? "BLOCKED"
          : r.status < 500
            ? "PARTIAL"
            : "BROKEN",
      `http=${r.status} ${r.text}`,
    ),
  );
}

// Hint
{
  const r = await edge("generate-hint", {
    question: "Tell me about a time you failed.",
    answer_so_far: "I missed a deadline once",
    mode: "practice",
    session_id: sessionId,
  });
  results.push(
    note(
      "GENERATE_HINT",
      r.status === 200 ? "OK" : r.status === 403 && r.json?.code === "FEATURE_DISABLED" ? "BLOCKED" : r.status < 500 ? "PARTIAL" : "BROKEN",
      `http=${r.status} ${r.text}`,
    ),
  );
}

// Answer
{
  const r = await edge("generate-answer", {
    question: "Tell me about yourself",
    mode: "practice",
    session_id: sessionId,
  });
  results.push(
    note(
      "GENERATE_ANSWER",
      r.status === 200 ? "OK" : r.status < 500 ? "PARTIAL" : "BROKEN",
      `http=${r.status} ${r.text}`,
    ),
  );
}

// Prep tool
{
  const r = await edge("prep-tool", {
    tool_id: "system_design",
    input: "Design a URL shortener for 100M users",
  });
  results.push(
    note(
      "PREP_TOOL",
      r.status === 200 ? "OK" : r.status < 500 ? "PARTIAL" : "BROKEN",
      `http=${r.status} ${r.text}`,
    ),
  );
}

// STAR
{
  const r = await edge("generate-star-answer", {
    questionText: "Tell me about a challenge you faced.",
    context: "backend engineer",
  });
  results.push(
    note(
      "STAR",
      r.status === 200 ? "OK" : "BROKEN",
      `http=${r.status} source=${r.json?.source}`,
    ),
  );
}

// Company research
{
  const r = await edge("company-research", { company: "Microsoft" });
  results.push(
    note(
      "COMPANY",
      r.status === 200 ? "OK" : "BROKEN",
      `http=${r.status} source=${r.json?.source}`,
    ),
  );
}

// Gov search + availability + create paper (custom, small)
{
  const se = await edge("search-exams", null, "GET", "?q=SSC%20CGL");
  const exam = se.json?.results?.[0];
  results.push(
    note(
      "GOV_SEARCH",
      se.status === 200 && exam ? "OK" : "BROKEN",
      `http=${se.status} n=${se.json?.results?.length || 0}`,
    ),
  );
  if (exam) {
    const av = await edge("check-exam-paper-availability", {
      examId: exam.examId,
      stageId: exam.stages?.[0]?.id,
      mode: "custom_mock",
      questionCount: 10,
      language: "en",
    });
    results.push(
      note(
        "GOV_AVAIL",
        av.status === 200 && av.json?.blocked !== true ? "OK" : "BROKEN",
        `http=${av.status} available=${av.json?.available} blocked=${av.json?.blocked}`,
      ),
    );
    const cr = await edge("create-exam-paper", {
      examId: exam.examId,
      stageId: exam.stages?.[0]?.id,
      mode: "custom_mock",
      questionCount: 10,
      language: "en",
      title: "blocker-smoke-paper",
    });
    results.push(
      note(
        "GOV_CREATE",
        cr.status === 200 || cr.status === 202 ? "OK" : cr.status < 500 ? "PARTIAL" : "BROKEN",
        `http=${cr.status} ${cr.text}`,
      ),
    );
  }
}

// Hybrid
{
  const r = await edge("hybrid-ping", {});
  results.push(
    note(
      "HYBRID_PING",
      r.status === 200 && r.json?.source === "python" ? "OK" : "BROKEN",
      `http=${r.status} source=${r.json?.source}`,
    ),
  );
}

// Billing: legacy billing-status is intentionally retired; Razorpay path is live.
{
  const r = await edge("razorpay-create-order", {
    product: "credits_150",
  });
  // 400/422 validation or auth-ok business response is fine; 5xx is not.
  // 410 on billing-status is expected and not probed.
  results.push(
    note(
      "BILLING_RAZORPAY",
      r.status < 500 ? "OK" : "BROKEN",
      `http=${r.status} ${r.text}`,
    ),
  );
}

// Frontend
{
  const r = await fetch("https://clarify.ai.sltfinanceindia.com/");
  results.push(
    note(
      "FRONTEND",
      r.status === 200 ? "OK" : "BROKEN",
      `http=${r.status}`,
    ),
  );
}

const blocked = results.filter((r) => r.status === "BLOCKED" || r.status === "BROKEN");
const partial = results.filter((r) => r.status === "PARTIAL");
console.log(
  JSON.stringify(
    {
      summary: results.map((r) => `${r.id}:${r.status}`),
      blocked: blocked.map((r) => r.id),
      partial: partial.map((r) => r.id),
      verdict: blocked.length ? "HAS_BLOCKERS" : partial.length ? "SMOOTH_WITH_PARTIALS" : "SMOOTH",
    },
    null,
    2,
  ),
);
process.exit(blocked.length ? 2 : 0);
