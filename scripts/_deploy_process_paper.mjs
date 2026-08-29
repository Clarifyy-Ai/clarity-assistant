import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  process.execPath,
  ["--use-system-ca", path.join("scripts", "deploy-edge-via-management-api.mjs"), "process-paper-generation-job", "--no-verify-jwt"],
  { cwd: ROOT, encoding: "utf8", env: process.env },
);
process.stdout.write(result.stdout || "");
process.stderr.write(result.stderr || "");
process.exit(result.status ?? 1);
