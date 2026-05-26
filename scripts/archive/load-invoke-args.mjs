import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const name = process.argv[2];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const p = path.join(root, ".deploy-payloads", `invoke-args-${name}.json`);
const args = JSON.parse(fs.readFileSync(p, "utf8"));
for (const f of args.files) f.content = f.content.replace(/\r\n/g, "\n");
// Emit as module export for agent tooling
process.stdout.write(JSON.stringify(args));
