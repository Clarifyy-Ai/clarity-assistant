import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

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

const local = load(".env.local");
const qa = load(".env.qa.local");
const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN;
const ref = "qzgvjrvtkwlzxpmlddkx";
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY;

const sql =
  "select key, enabled, coalesce(description,'') as description from feature_flags order by key";
const fr = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);
console.log("FLAGS", fr.status, await fr.text());

const client = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: pro, error } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
console.log("auth", error?.message || "ok", !!pro?.session);

const tok = pro?.session?.access_token;
const headers = {
  Authorization: `Bearer ${tok}`,
  apikey: anon,
  "Content-Type": "application/json",
};

const probes = [
  ["ai-coach-chat", { message: "Say hi briefly.", mode: "practice" }],
  [
    "generate-hint",
    {
      question: "Tell me about a time you failed.",
      answer_so_far: "I missed a deadline once",
    },
  ],
  [
    "generate-answer",
    { question: "Tell me about yourself", context: "backend engineer" },
  ],
  ["company-research", { company: "Google" }],
  [
    "generate-star-answer",
    {
      questionText: "Tell me about a challenge you faced.",
      context: "software engineer",
    },
  ],
  ["hybrid-ping", {}],
  [
    "prep-tool",
    { tool: "system_design", prompt: "Design a URL shortener" },
  ],
  [
    "generate-questions",
    { role: "backend", count: 3, topics: ["apis"] },
  ],
];

for (const [fn, body] of probes) {
  const r = await fetch(`${url}/functions/v1/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const t = await r.text();
  console.log(
    JSON.stringify({
      fn,
      status: r.status,
      body: t.slice(0, 220),
    }),
  );
}
