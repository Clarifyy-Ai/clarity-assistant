import fs from "fs";
import { Blob } from "buffer";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const files = JSON.parse(fs.readFileSync(process.argv[4] || "tmp_parse_files.json", "utf8"));
const slug = process.argv[2] || "parse-document";
const entry = process.argv[3] || `${slug}/index.ts`;

const form = new FormData();
form.set(
  "metadata",
  JSON.stringify({
    name: slug,
    entrypoint_path: entry,
    verify_jwt: true,
  }),
);
form.set(
  "file",
  new Blob([JSON.stringify(files)], { type: "application/json" }),
  "files.json",
);

const res = await fetch(
  `https://api.supabase.com/v1/projects/qzgvjrvtkwlzxpmlddkx/functions/deploy?slug=${slug}`,
  {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  },
);
const text = await res.text();
console.log(res.status, text.slice(0, 1000));
process.exit(res.ok ? 0 : 1);
