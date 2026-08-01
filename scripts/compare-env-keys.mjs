#!/usr/bin/env node
import fs from "node:fs";

function load(p) {
  const o = {};
  if (!fs.existsSync(p)) return o;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}

function fp(v) {
  if (!v) return { present: false };
  const t = v.trim();
  return {
    present: true,
    prefix: t.slice(0, 8),
    suffix: t.slice(-4),
    len: t.length,
    placeholder: /your|placeholder|_here|xxx|changeme|sk_test_your/i.test(t),
  };
}

const files = [".env.local", ".env.production", ".env", ".env.qa.local"];
const out = {};
for (const f of files) {
  const e = load(f);
  out[f] = {
    exists: fs.existsSync(f),
    GEMINI: fp(e.GEMINI_API_KEY),
    OPENAI: fp(e.OPENAI_API_KEY),
    ANTHROPIC: fp(e.ANTHROPIC_API_KEY),
    DEEPGRAM: fp(e.DEEPGRAM_API_KEY),
  };
}
console.log(JSON.stringify(out, null, 2));
