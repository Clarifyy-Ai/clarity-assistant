#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const migDir = path.join(process.cwd(), "supabase", "migrations");

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/migrations`, {
  headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
});
if (!res.ok) {
  console.error(await res.text());
  process.exit(1);
}
const remote = await res.json();
const byVersion = new Set(remote.map((m) => String(m.version)));
const byName = new Set(remote.map((m) => m.name).filter(Boolean));

const files = fs.readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
const pending = [];
for (const file of files) {
  const base = file.replace(/\.sql$/, "");
  const m = base.match(/^(\d+)_(.+)$/);
  if (m) {
    const [, ver, name] = m;
    if (!byVersion.has(ver) && !byName.has(name)) {
      pending.push({ file, ver, name });
    }
  } else if (!byVersion.has(base)) {
    pending.push({ file, ver: base, name: "" });
  }
}

console.log(JSON.stringify({ remote: remote.length, local: files.length, pendingCount: pending.length, pending }, null, 2));
