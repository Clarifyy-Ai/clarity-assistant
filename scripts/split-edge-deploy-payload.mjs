import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const inDir = path.join(root, ".deploy-payloads");

for (const file of fs.readdirSync(inDir).filter((f) => f.endsWith(".json"))) {
  const name = file.replace(".json", "");
  const j = JSON.parse(fs.readFileSync(path.join(inDir, file), "utf8"));
  const out = path.join(inDir, name);
  fs.mkdirSync(out, { recursive: true });
  for (const f of j.files) {
    const p = path.join(out, f.name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, f.content, "utf8");
  }
  fs.writeFileSync(
    path.join(out, "meta.json"),
    JSON.stringify({
      project_id: j.project_id,
      name: j.name,
      entrypoint_path: j.entrypoint_path,
      verify_jwt: j.verify_jwt,
    }),
    "utf8"
  );
  console.log("split", name);
}
