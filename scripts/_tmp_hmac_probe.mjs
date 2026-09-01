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
console.log(JSON.stringify({ host: new URL(base).host }));

async function probe(pathName, method = "GET", body = "") {
  const ts = String(Math.floor(Date.now() / 1000));
  const rid = `probe-${crypto.randomBytes(6).toString("hex")}`;
  const digest = crypto.createHash("sha256").update(body).digest("hex");
  const msg = [method, pathName, ts, rid, digest].join("\n");
  const sig = crypto.createHmac("sha256", secret).update(msg).digest("hex");
  const headers = {
    "X-Internal-Timestamp": ts,
    "X-Request-ID": rid,
    "X-Internal-Signature": `sha256=${sig}`,
  };
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(base + pathName, {
    method,
    headers,
    body: body || undefined,
  });
  const text = await r.text();
  console.log(JSON.stringify({ path: pathName, status: r.status, body: text.slice(0, 220) }));
  return r.status;
}

const pub = await fetch(base + "/health");
console.log(JSON.stringify({ path: "/health", status: pub.status, body: (await pub.text()).slice(0, 140) }));
const ready = await fetch(base + "/ready");
console.log(JSON.stringify({ path: "/ready", status: ready.status, body: (await ready.text()).slice(0, 220) }));
const hmac = await probe("/internal/gov-exams/health");
process.exit(hmac === 200 ? 0 : 3);
