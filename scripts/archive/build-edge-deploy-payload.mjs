import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const fnRoot = path.join(root, "supabase", "functions");
const outDir = path.join(root, ".deploy-payloads");

const FUNCTIONS = [
  "analytics-dashboard",
  "export-user-data",
  "delete-account",
];

function read(rel) {
  return fs.readFileSync(path.join(fnRoot, rel), "utf8");
}

fs.mkdirSync(outDir, { recursive: true });

for (const name of FUNCTIONS) {
  const payload = {
    project_id: "qzgvjrvtkwlzxpmlddkx",
    name,
    entrypoint_path: "index.ts",
    verify_jwt: false,
    files: [
      { name: "index.ts", content: read(`${name}/index.ts`) },
      { name: "_shared/cors.ts", content: read("_shared/cors.ts") },
      { name: "_shared/supabase.ts", content: read("_shared/supabase.ts") },
    ],
  };
  fs.writeFileSync(
    path.join(outDir, `${name}.json`),
    JSON.stringify(payload),
    "utf8"
  );
  console.log(`Wrote ${name}.json (${payload.files.reduce((n, f) => n + f.content.length, 0)} chars)`);
}
