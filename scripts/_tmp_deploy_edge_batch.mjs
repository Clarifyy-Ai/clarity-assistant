/**
 * Deploy a batch of Edge functions via Management API.
 * Usage: node --use-system-ca scripts/_tmp_deploy_edge_batch.mjs
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv(file) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(".env.local");

const NO_JWT = new Set([
  "razorpay-webhook",
  "stripe-webhook",
  "health",
  "ping",
  "billing-catalog",
  "support-chat",
  "contact-sales",
]);

const slugs = [
  "create-exam-paper",
  "check-exam-paper-availability",
  "get-paper-generation-job",
  "process-paper-generation-job",
  "cancel-paper-generation-job",
  "start-exam",
  "save-test-answer",
  "submit-test",
  "search-exams",
  "get-exam-details",
  "get-exam-pattern",
  "get-exam-syllabus",
  "generate-topic-practice",
  "parse-document",
  "parse-resume",
  "create-document-processing-job",
  "get-document-processing-job",
  "retry-document-processing-job",
  "cancel-document-processing-job",
  "razorpay-create-order",
  "razorpay-verify-payment",
  "razorpay-webhook",
  "start-session",
  "end-session",
  "finalize-session",
  "score-coding-submission",
  "hybrid-health",
  "hybrid-ping",
  "delete-account",
  "schedule-interview",
  "prep-tool",
];

function deployOne(slug) {
  return new Promise((resolve) => {
    const args = [
      "--use-system-ca",
      "scripts/deploy-edge-via-management-api.mjs",
      slug,
    ];
    if (NO_JWT.has(slug)) args.push("--no-verify-jwt");
    const child = spawn("node", args, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      const text = out.trim();
      console.log(text || JSON.stringify({ slug, code }));
      let httpOk = false;
      try {
        const line = text.split("\n").find((l) => l.includes('"status"'));
        const parsed = line ? JSON.parse(line) : null;
        httpOk = parsed && parsed.status >= 200 && parsed.status < 300;
      } catch {
        httpOk = false;
      }
      resolve({ slug, code: httpOk ? 0 : code });
    });
  });
}

const results = [];
for (const slug of slugs) {
  results.push(await deployOne(slug));
}
const failed = results.filter((r) => r.code !== 0);
console.log(JSON.stringify({ ok: results.length - failed.length, failed: failed.map((f) => f.slug) }));
process.exit(failed.length ? 1 : 0);
