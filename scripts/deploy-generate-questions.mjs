/**
 * Deploy generate-questions via Supabase Management API (no Docker required).
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const projectRef = "qzgvjrvtkwlzxpmlddkx";
const files = JSON.parse(fs.readFileSync(path.join(root, "tmp-gq-deploy-files.json"), "utf8"));

function readToken() {
  for (const f of [".env.local", ".env.example", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, "utf8");
    const m = text.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  throw new Error("SUPABASE_ACCESS_TOKEN not found");
}

const token = readToken();
const form = new FormData();
form.append(
  "metadata",
  JSON.stringify({
    name: "generate-questions",
    entrypoint_path: "generate-questions/index.ts",
    verify_jwt: true,
  }),
);

for (const file of files) {
  form.append("file", new Blob([file.content], { type: "application/typescript" }), file.name);
}

const url = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=generate-questions`;
const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
  },
  body: form,
});

const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 2000));
if (!res.ok) process.exit(1);
