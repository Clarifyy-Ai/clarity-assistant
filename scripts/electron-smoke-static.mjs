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

const main = fs.readFileSync(mainPath, "utf8");
const preload = fs.readFileSync(preloadPath, "utf8");

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
