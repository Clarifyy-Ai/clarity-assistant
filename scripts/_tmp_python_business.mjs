import fs from "node:fs";
import crypto from "node:crypto";
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
const o = load(".env.local");
const base = (o.PYTHON_SERVICE_URL || o.VITE_SCRAPER_URL || "").replace(/\/$/, "");
const secret = o.DOCUMENT_INTELLIGENCE_AUTH_SECRET;

async function signed(pathName, method, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `biz-${crypto.randomBytes(6).toString("hex")}`;
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  const msg = [method, pathName, ts, rid, digest].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const r = await fetch(base + pathName, {
    method,
    headers: {
      "X-Internal-Timestamp": ts,
      "X-Request-ID": rid,
      "X-Internal-Signature": `sha256=${sig}`,
      "Content-Type": "application/json",
    },
    body: body || undefined,
  });
  const text = await r.text();
  console.log(JSON.stringify({ path: pathName, status: r.status, body: text.slice(0, 500) }));
  return r.status;
}

const token = o.SUPABASE_ACCESS_TOKEN;
const exam = await fetch(
  `https://api.supabase.com/v1/projects/qzgvjrvtkwlzxpmlddkx/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `select e.id as exam_id, s.id as stage_id, e.code
              from gov_exams e
              join gov_exam_stages s on s.exam_id = e.id
              where e.is_public = true
              order by e.code
              limit 1`,
    }),
  },
);
const examText = await exam.text();
console.log("exam_row", exam.status, examText.slice(0, 400));
let examId = null;
let stageId = null;
try {
  const rows = JSON.parse(examText);
  examId = rows[0]?.exam_id;
  stageId = rows[0]?.stage_id;
} catch {
  /* ignore */
}

if (!examId) process.exit(2);

const status = await signed("/internal/gov-exams/availability", "POST", {
  exam_id: examId,
  stage_id: stageId,
  language: "en",
  mode: "custom_mock",
  question_count: 10,
});
process.exit(status === 200 ? 0 : 4);
