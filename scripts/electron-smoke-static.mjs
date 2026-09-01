#!/usr/bin/env node
/**
 * Static Electron / overlay smoke checks (no interactive GUI).
 * Exit 0 if secure defaults and IPC wiring are present in source.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mainPath = path.join(root, "electron", "main.cjs");
const preloadPath = path.join(root, "electron", "preload.cjs");
const corsPath = path.join(root, "supabase", "functions", "_shared", "cors.ts");
const envExamplePath = path.join(root, ".env.example");
const syncSecretsPath = path.join(root, "scripts", "sync-edge-secrets-from-env.mjs");
const validateEnvPath = path.join(root, "scripts", "validate-env.js");

const main = fs.readFileSync(mainPath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");
const corsSrc = fs.readFileSync(corsPath, "utf8");
const envExample = fs.readFileSync(envExamplePath, "utf8");
const syncSecrets = fs.readFileSync(syncSecretsPath, "utf8");
const validateEnv = fs.existsSync(validateEnvPath)
  ? fs.readFileSync(validateEnvPath, "utf8")
  : "";

const checks = [
  {
    name: "contextIsolation enabled",
    ok: /contextIsolation:\s*true/.test(main),
  },
  {
    name: "nodeIntegration disabled",
    ok: /nodeIntegration:\s*false/.test(main),
  },
  {
    name: "sandbox enabled",
    ok: /sandbox:\s*true/.test(main),
  },
  {
    name: "alwaysOnTop default false",
    ok: /alwaysOnTop:\s*false/.test(main),
  },
  {
    name: "setContentProtection default false on ready",
    ok: /setContentProtection\(false\)/.test(main),
  },
  {
    name: "unregisterAll on will-quit",
    ok: /will-quit[\s\S]*unregisterAll/.test(main),
  },
  {
    name: "sync-global-shortcuts IPC",
    ok: /overlay:sync-global-shortcuts/.test(main) &&
      /syncGlobalShortcuts/.test(preload),
  },
  {
    name: "unsafe-eval only gated behind isDev",
    ok:
      /unsafe-eval/.test(main) &&
      /isDev \? .*unsafe-eval/.test(main.replace(/\n/g, " ")),
  },
  {
    name: "dist electron overlay chunk exists (build artifact)",
    ok: fs.existsSync(path.join(root, "dist")) &&
      fs.readdirSync(path.join(root, "dist", "assets")).some((f) =>
        f.startsWith("chunk-overlay"),
      ),
  },
  {
    name: "preload exposes desktop and electronAPI",
    ok:
      /exposeInMainWorld\(\s*["']desktop["']/.test(preload) &&
      /exposeInMainWorld\(\s*["']electronAPI["']/.test(preload),
  },
  {
    name: "cors.ts mentions ALLOW_ELECTRON_NULL_ORIGIN",
    ok: corsSrc.includes("ALLOW_ELECTRON_NULL_ORIGIN"),
  },
  {
    name: "cors.ts electron null origin defaults true",
    ok: /envFlag\(\s*["']ALLOW_ELECTRON_NULL_ORIGIN["']\s*,\s*true\s*\)/.test(
      corsSrc,
    ),
  },
  {
    name: ".env.example contains ALLOW_ELECTRON_NULL_ORIGIN",
    ok: envExample.includes("ALLOW_ELECTRON_NULL_ORIGIN"),
  },
  {
    name: "sync-edge-secrets maps ALLOW_ELECTRON_NULL_ORIGIN",
    ok: syncSecrets.includes("ALLOW_ELECTRON_NULL_ORIGIN"),
  },
  {
    name: "validate-env.js contains BUILD_TARGET",
    ok: validateEnv.includes("BUILD_TARGET"),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}: ${c.name}`);
  if (!c.ok) failed += 1;
}

if (failed) {
  console.error(`\nStatic Electron smoke: ${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: static Electron smoke checks passed");
