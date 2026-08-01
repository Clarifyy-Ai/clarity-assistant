#!/usr/bin/env node
import fs from "node:fs";
import https from "node:https";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF || "qzgvjrvtkwlzxpmlddkx";
const file = process.argv[2];
if (!token || !file) {
  console.error("Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-sql-migration.mjs <migration.sql>");
  process.exit(1);
}
const query = fs.readFileSync(file, "utf8");
const name = file.split(/[/\\]/).pop().replace(/\.sql$/, "").replace(/^\d+_/, "");

const body = JSON.stringify({ name, query });

const req = https.request(
  {
    hostname: "api.supabase.com",
    path: `/v1/projects/${ref}/database/migrations`,
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  },
  (res) => {
    let data = "";
    res.on("data", (c) => (data += c));
    res.on("end", () => {
      console.log(JSON.stringify({ status: res.statusCode, body: data.slice(0, 500) }));
      process.exit(res.statusCode && res.statusCode < 300 ? 0 : 1);
    });
  },
);
req.on("error", (e) => {
  console.error(e.message);
  process.exit(1);
});
req.write(body);
req.end();
