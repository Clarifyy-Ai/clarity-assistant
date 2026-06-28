#!/usr/bin/env node
/**
 * Migrates brand-accent Tailwind violet-* classes to semantic primary tokens.
 * Skips files/patterns where violet is intentional (accent swatch preview, stealth CSS).
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

const ROOT = join(import.meta.dirname, "..", "src");

const SKIP_FILES = new Set([
  "index.css",
]);

const REPLACEMENTS = [
  [/bg-violet-700/g, "bg-primary/90"],
  [/hover:bg-violet-700/g, "hover:bg-primary/90"],
  [/hover:bg-violet-600/g, "hover:bg-primary/90"],
  [/bg-violet-600/g, "bg-primary"],
  [/bg-violet-500/g, "bg-primary"],
  [/text-violet-300/g, "text-primary/80"],
  [/text-violet-400/g, "text-primary"],
  [/text-violet-500/g, "text-primary"],
  [/text-violet-600/g, "text-primary"],
  [/border-violet-500\/30/g, "border-primary/30"],
  [/border-violet-500\/20/g, "border-primary/20"],
  [/border-violet-600\/30/g, "border-primary/30"],
  [/border-violet-600\/20/g, "border-primary/20"],
  [/border-violet-500/g, "border-primary"],
  [/ring-violet-500/g, "ring-primary"],
  [/focus:ring-violet-500/g, "focus:ring-primary"],
  [/focus-visible:ring-violet-500/g, "focus-visible:ring-primary"],
  [/accent-violet-500/g, "accent-primary"],
  [/from-violet-600/g, "from-primary"],
  [/to-violet-600/g, "to-primary"],
  [/from-violet-500/g, "from-primary"],
  [/to-violet-500/g, "to-primary"],
  [/bg-violet-500\/20/g, "bg-primary/20"],
  [/bg-violet-500\/15/g, "bg-primary/15"],
  [/bg-violet-500\/10/g, "bg-primary/10"],
  [/bg-violet-500\/5/g, "bg-primary/5"],
  [/bg-violet-600\/20/g, "bg-primary/20"],
  [/bg-violet-600\/15/g, "bg-primary/15"],
  [/bg-violet-600\/10/g, "bg-primary/10"],
  [/bg-violet-600\/5/g, "bg-primary/5"],
  [/hover:bg-violet-500\/20/g, "hover:bg-primary/20"],
  [/hover:bg-violet-500\/15/g, "hover:bg-primary/15"],
  [/hover:bg-violet-500\/10/g, "hover:bg-primary/10"],
  [/hover:text-violet-300/g, "hover:text-primary/80"],
  [/hover:text-violet-400/g, "hover:text-primary"],
  [/hover:border-violet-500\/40/g, "hover:border-primary/40"],
  [/hover:border-violet-500\/30/g, "hover:border-primary/30"],
  [/shadow-violet-500/g, "shadow-primary"],
  [/divide-violet-500/g, "divide-primary"],
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules") continue;
      walk(p, files);
    } else if ([".tsx", ".ts", ".css"].includes(extname(name))) {
      files.push(p);
    }
  }
  return files;
}

let changed = 0;
let total = 0;

for (const file of walk(ROOT)) {
  const rel = file.replace(/\\/g, "/");
  const base = rel.split("/").pop();
  if (SKIP_FILES.has(base)) continue;

  let content = readFileSync(file, "utf8");
  if (!content.includes("violet-")) continue;

  // Settings appearance: keep literal violet swatch chip
  const isAppearanceSwatch =
    rel.includes("SettingsAppearance.tsx") &&
    content.includes('accent: "violet"');

  let next = content;
  for (const [re, rep] of REPLACEMENTS) {
    next = next.replace(re, rep);
  }

  if (next !== content) {
    // Restore appearance swatch literal if accidentally changed in label only
    if (isAppearanceSwatch) {
      next = next.replace(/name: "Primary"/g, 'name: "Violet"');
    }
    writeFileSync(file, next, "utf8");
    changed++;
    const count = (content.match(/violet-/g) ?? []).length;
    const remain = (next.match(/violet-/g) ?? []).length;
    total += count - remain;
    console.log(`${rel}: ${count - remain} replacements (${remain} violet-* remain)`);
  }
}

console.log(`\nDone: ${changed} files updated, ~${total} replacements.`);
