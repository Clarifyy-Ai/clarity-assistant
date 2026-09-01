import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}
const local = load(".env.local");
const qa = load(".env.qa.local");
const sign = await fetch(`${local.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: local.VITE_SUPABASE_ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: qa.QA_USER_A_EMAIL, password: qa.QA_USER_A_PASSWORD }),
});
const session = await sign.json();
const exam = { examId: "4da8db79-b9b2-4611-a037-b283b19f0cdf", stageId: "e8938418-7b6d-45ab-9d5f-dc7ecc080746" };
const create = await fetch(`${local.VITE_SUPABASE_URL}/functions/v1/create-exam-paper`, {
  method: "POST",
  headers: {
    apikey: local.VITE_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    examId: exam.examId,
    stageId: exam.stageId,
    mode: "custom_mock",
    language: "en",
    questionCount: 10,
    idempotencyKey: crypto.randomUUID(),
    generator: "python",
  }),
});
const text = await create.text();
console.log("create", create.status, text.slice(0, 700));
