#!/usr/bin/env node
/**
 * scripts/verify-dist-env.mjs
 *
 * Dist bake-in gate — run immediately after `vite build`.
 *
 * Vite inlines VITE_* env vars into the built JS at compile time. If a
 * production build runs without VITE_SUPABASE_URL set (e.g. a Lovable
 * deploy where the dashboard env var was never configured), `dist/` still
 * builds "successfully" but ships a bundle that throws at runtime with
 * "Missing required environment variable: VITE_SUPABASE_URL" — and the app
 * gets stuck on the boot splash for real users.
 *
 * This script scans the built JS for the Supabase project hostname so a bad
 * deploy fails the build instead of shipping silently.
 *
 * Usage:
 *   npm run build && node scripts/verify-dist-env.mjs
 *   (wired as `npm run build:check`)
 *
 * The expected hostname is resolved from, in order:
 *   1. VITE_SUPABASE_URL in the current process env (what the build actually used)
 *   2. VITE_SUPABASE_URL in .env.production
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const DIST_ASSETS_DIR = path.join(ROOT_DIR, "dist", "assets");

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readSupabaseUrlFromEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== "VITE_SUPABASE_URL") continue;
    return stripQuotes(trimmed.slice(eq + 1).replace(/\s+#.*$/, ""));
  }
  return null;
}

function resolveExpectedSupabaseUrl() {
  if (process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_URL.trim()) {
    return { url: process.env.VITE_SUPABASE_URL.trim(), source: "process.env.VITE_SUPABASE_URL" };
  }

  const fromEnvProduction = readSupabaseUrlFromEnvFile(path.join(ROOT_DIR, ".env.production"));
  if (fromEnvProduction) {
    return { url: fromEnvProduction, source: ".env.production" };
  }

  return null;
}

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function collectDistJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => path.join(dir, entry.name));
}

function main() {
  console.log("\n🔎 Verifying VITE_SUPABASE_URL is baked into the dist build...");

  const expected = resolveExpectedSupabaseUrl();
  if (!expected) {
    console.error(
      "\n❌ Could not determine the expected Supabase URL. " +
        "Set VITE_SUPABASE_URL in the environment or .env.production before building.",
    );
    process.exit(1);
  }

  const hostname = getHostname(expected.url);
  if (!hostname) {
    console.error(`\n❌ VITE_SUPABASE_URL (from ${expected.source}) is not a valid URL: "${expected.url}"`);
    process.exit(1);
  }

  if (!fs.existsSync(path.join(ROOT_DIR, "dist"))) {
    console.error(
      '\n❌ dist/ does not exist. Run "npm run build" before verify-dist-env.',
    );
    process.exit(1);
  }

  const jsFiles = collectDistJsFiles(DIST_ASSETS_DIR);
  if (jsFiles.length === 0) {
    console.error(`\n❌ No JS files found in ${path.relative(ROOT_DIR, DIST_ASSETS_DIR)}. Did the build produce output?`);
    process.exit(1);
  }

  const forbiddenPatterns = [
    { label: "localhost debug ingest", pattern: /127\.0\.0\.1:7572\/ingest|localhost:7572\/ingest/ },
    { label: "agent debug sink path", pattern: /__agent_debug_/ },
  ];

  const violations = [];
  for (const file of jsFiles) {
    const contents = fs.readFileSync(file, "utf8");
    for (const rule of forbiddenPatterns) {
      if (rule.pattern.test(contents)) {
        violations.push({ file: path.relative(ROOT_DIR, file), rule: rule.label });
      }
    }
  }

  if (violations.length > 0) {
    console.error("\n❌ Production bundle contains forbidden dev debug telemetry artifacts:\n");
    for (const violation of violations) {
      console.error(`   - ${violation.file}: ${violation.rule}`);
    }
    console.error(
      "\n   Client bundles must not call localhost ingest or ship __agent_debug_ sinks.\n" +
        "   Use src/lib/debug/debugIngest.ts (dev-only same-origin sink) instead.\n",
    );
    process.exit(1);
  }

  let found = false;
  for (const file of jsFiles) {
    const contents = fs.readFileSync(file, "utf8");
    if (contents.includes(hostname)) {
      found = true;
      console.log(`  OK     ${path.relative(ROOT_DIR, file)} contains "${hostname}"`);
      break;
    }
  }

  if (!found) {
    console.error(
      `\n❌ Missing required environment variable: VITE_SUPABASE_URL was NOT baked into the build.\n` +
        `   Expected to find the Supabase project hostname "${hostname}" (from ${expected.source})\n` +
        `   inside one of the ${jsFiles.length} JS file(s) in ${path.relative(ROOT_DIR, DIST_ASSETS_DIR)}, but it was not present.\n\n` +
        "   This almost always means the build ran WITHOUT VITE_SUPABASE_URL set, so the shipped bundle\n" +
        "   will throw \"Missing required environment variable: VITE_SUPABASE_URL\" for every real user\n" +
        "   and get stuck on the boot splash.\n\n" +
        "   Fix: set VITE_SUPABASE_URL (and the Supabase key vars) in the hosting dashboard's environment\n" +
        "   variables, then trigger a full rebuild — do not just redeploy the same cached bundle.\n",
    );
    process.exit(1);
  }

  console.log("\n✅ dist bundle bake-in check passed — VITE_SUPABASE_URL is present.\n");
}

main();
