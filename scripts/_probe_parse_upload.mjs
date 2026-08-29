import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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

const local = { ...load(".env.local"), ...load(".env") };
const qa = load(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;
const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (error) {
  console.error("auth fail", error.message);
  process.exit(1);
}
const userId = data.user.id;
const tok = data.session.access_token;
console.log("user", userId);

const { data: profile } = await client
  .from("profiles")
  .select("plan_id, credits_balance, credits, credit_balance")
  .eq("id", userId)
  .maybeSingle();
console.log("profile", profile);

// Minimal text resume
const resumeId = randomUUID();
const path = `${userId}/resumes/${resumeId}.txt`;
const text = `Jane Doe
Senior Backend Engineer
Skills: TypeScript, Node.js, PostgreSQL, AWS
Experience:
Acme Corp — Backend Engineer (2020-2024)
Built payment APIs and reduced latency 40%.
Education:
MIT — BS Computer Science
`;
const blob = new Blob([text], { type: "text/plain" });
const up = await client.storage.from("documents").upload(path, blob, {
  contentType: "text/plain",
  upsert: true,
});
console.log("upload", up.error?.message || "ok");

const { error: insErr } = await client.from("resumes").insert({
  id: resumeId,
  user_id: userId,
  title: "probe-txt",
  file_name: "probe.txt",
  file_url: path,
  mime_type: "text/plain",
});
console.log("resume insert", insErr?.message || "ok", resumeId);

const r = await fetch(`${url}/functions/v1/parse-resume`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tok}`,
    apikey: anon,
    "Content-Type": "application/json",
    "x-idempotency-key": `probe-txt-${resumeId}`,
  },
  body: JSON.stringify({
    resume_id: resumeId,
    file_path: path,
    mime_type: "text/plain",
  }),
});
const body = await r.text();
console.log("parse-resume", r.status, body.slice(0, 600));

// Minimal PDF (valid header + text stream is hard; try simple %PDF)
const pdfId = randomUUID();
const pdfPath = `${userId}/resumes/${pdfId}.pdf`;
// Minimal valid-ish PDF with text "John Smith Engineer"
const pdf = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 12 Tf 50 100 Td (John Smith Senior Engineer Skills Python) Tj ET
endstream
endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000392 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
466
%%EOF`;
const pdfUp = await client.storage.from("documents").upload(pdfPath, new Blob([pdf], { type: "application/pdf" }), {
  contentType: "application/pdf",
  upsert: true,
});
console.log("pdf upload", pdfUp.error?.message || "ok");
await client.from("resumes").insert({
  id: pdfId,
  user_id: userId,
  title: "probe-pdf",
  file_name: "probe.pdf",
  file_url: pdfPath,
  mime_type: "application/pdf",
});
const r2 = await fetch(`${url}/functions/v1/parse-resume`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${tok}`,
    apikey: anon,
    "Content-Type": "application/json",
    "x-idempotency-key": `probe-pdf-${pdfId}`,
  },
  body: JSON.stringify({
    resume_id: pdfId,
    file_path: pdfPath,
    mime_type: "application/pdf",
  }),
});
console.log("parse-resume-pdf", r2.status, (await r2.text()).slice(0, 600));
