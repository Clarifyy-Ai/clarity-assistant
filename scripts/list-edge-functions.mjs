/**
 * List all deployable Supabase edge function slugs (excludes _shared).
 * Usage: node scripts/list-edge-functions.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.join(__dirname, "..", "supabase", "functions");

const slugs = fs
  .readdirSync(fnDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared")
  .map((d) => d.name)
  .sort();

console.log(`Edge functions (${slugs.length}):`);
for (const s of slugs) console.log(`  ${s}`);

const deployCmd = slugs.map((s) => `npx supabase functions deploy ${s}`).join("\n");
const outPath = path.join(__dirname, "..", "docs", "EDGE_DEPLOY_COMMANDS.txt");
fs.writeFileSync(outPath, deployCmd + "\n");
console.log(`\nWrote ${outPath}`);
