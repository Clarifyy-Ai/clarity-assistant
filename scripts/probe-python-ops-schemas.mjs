/** Schema-correct Python op probes. */
import fs from "node:fs";
import crypto from "node:crypto";

function load(p) {
  const o = {};
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

const local = load(".env.local");
const base = (local.VITE_SCRAPER_URL || "").replace(/\/$/, "");
const secret = local.DOCUMENT_INTELLIGENCE_AUTH_SECRET;
const oid = () => crypto.randomUUID();

async function signed(method, path, bodyObj) {
  const body = JSON.stringify(bodyObj);
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `fix-${crypto.randomBytes(4).toString("hex")}`;
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  const msg = [method, path, ts, rid, digest].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const r = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Timestamp": ts,
      "X-Request-ID": rid,
      "X-Internal-Signature": `sha256=${sig}`,
    },
    body,
  });
  const t = await r.text();
  console.log(
    JSON.stringify({
      path,
      op: bodyObj.operation || bodyObj.operation_type,
      status: r.status,
      ok: r.status === 200,
      body: t.slice(0, 180),
    }),
  );
}

await signed("POST", "/internal/operations", {
  operation_type: "ping",
  operation_id: oid(),
  correlation_id: oid(),
  payload: {},
});

for (const [op, payload] of [
  [
    "star_format",
    {
      situation: "Led migration",
      task: "Cut latency",
      action: "Sharded DB",
      result: "p95 -40%",
    },
  ],
  ["system_design_outline", { prompt: "Design a URL shortener" }],
  ["resume_structure", { text: "John Doe Software Engineer Built APIs" }],
  ["company_research_skeleton", { company: "Google" }],
  ["mock_question_bank", { role: "backend", topic: "systems" }],
  ["document_extract", { text: "John Doe Software Engineer Built APIs" }],
  ["practice_coach", { operation_type: "hint", question: "Tell me about failure" }],
]) {
  await signed("POST", "/internal/operations", {
    operation_type: op,
    operation_id: oid(),
    correlation_id: oid(),
    payload,
  });
}

const processPayloads = {
  document_extract: { text: "John Doe\nSoftware Engineer\nBuilt APIs at Acme" },
  document_classify: { text: "John Doe\nSoftware Engineer at Acme" },
  star_evidence: {
    question: "Tell me about a challenge",
    evidence: "I led a migration",
  },
  system_design: { prompt: "Design a URL shortener" },
  practice_coach: { operation_type: "coach_chat", message: "Say hi briefly." },
  company_normalize: { company: "Google" },
  mock_question_validate: {
    question: "What is a race condition?",
    role: "backend",
  },
  speech_process: {
    transcript: "Hello this is a test transcript for verification.",
  },
};

for (const [op, payload] of Object.entries(processPayloads)) {
  await signed("POST", "/v1/process", {
    operation: op,
    operation_id: oid(),
    correlation_id: oid(),
    payload,
  });
}
