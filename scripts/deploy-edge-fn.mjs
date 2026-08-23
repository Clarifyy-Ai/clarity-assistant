/**
 * Deploy Edge Function by sending individual source files (not zip).
 * Matches Management API "file: Array" schema; avoids known zip entrypoint bug.
 */
import fs from "node:fs";
import path from "node:path";

const slug = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN;
const projectRef = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
if (!slug || !token) {
  console.error("Need slug + SUPABASE_ACCESS_TOKEN");
  process.exit(1);
}

const fnDir = path.join("supabase", "functions", slug);
const sharedDir = path.join("supabase", "functions", "_shared");
let entry = fs.readFileSync(path.join(fnDir, "index.ts"), "utf8");
entry = entry.replaceAll("../_shared/", "./_shared/");

const form = new FormData();
form.append(
  "metadata",
  JSON.stringify({
    name: slug,
    entrypoint_path: "index.ts",
    verify_jwt: true,
  }),
);

// Primary entrypoint
form.append(
  "file",
  new Blob([entry], { type: "application/typescript" }),
  "index.ts",
);

// Shared modules as ./_shared/...
function walk(dir, prefix) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.posix.join(prefix, name.replaceAll("\\", "/"));
    if (fs.statSync(full).isDirectory()) {
      walk(full, rel);
    } else {
      const body = fs.readFileSync(full);
      form.append("file", new Blob([body]), rel);
    }
  }
}
walk(sharedDir, "_shared");

const url = `https://api.supabase.com/v1/projects/${projectRef}/functions/deploy?slug=${encodeURIComponent(slug)}`;
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const text = await res.text();
console.log("status", res.status);
console.log(text.slice(0, 2500));
if (!res.ok) process.exit(1);
console.log("DEPLOYED", slug);
