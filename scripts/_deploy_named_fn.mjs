import fs from "node:fs";
import { spawnSync } from "node:child_process";

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

const envFile = { ...load(".env.local"), ...load(".env") };
const token = envFile.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing");
  process.exit(1);
}
const slug = process.argv[2] || "start-session";
const r = spawnSync(
  process.execPath,
  ["--use-system-ca", "scripts/deploy-edge-fn.mjs", slug],
  {
    env: {
      ...process.env,
      SUPABASE_ACCESS_TOKEN: token,
      SUPABASE_PROJECT_REF: envFile.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
    },
    stdio: "inherit",
  },
);
process.exit(r.status ?? 1);
