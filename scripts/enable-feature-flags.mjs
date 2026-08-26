import fs from "node:fs";

function load(p) {
  const o = {};
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
const token = process.env.SUPABASE_ACCESS_TOKEN || local.SUPABASE_ACCESS_TOKEN;
const ref = "qzgvjrvtkwlzxpmlddkx";

async function q(sql) {
  const r = await fetch(
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
  const text = await r.text();
  console.log(r.status, text.slice(0, 2000));
  return { status: r.status, text };
}

await q(
  "select key, is_enabled from feature_flags order by key",
);

// Enable all product-critical flags used as kill-switches
const keys = [
  "live_assist",
  "mock_sessions",
  "star_builder",
  "session_debrief",
  "overlay",
  "analytics",
  "company_research",
  "calendar_sync",
  "gov_exam_ai_fill",
  "resume_analysis",
  "practice_coach",
  "documents",
  "billing",
];

await q(
  `update feature_flags set is_enabled = true where key = any(array[${keys
    .map((k) => `'${k}'`)
    .join(",")}]) returning key, is_enabled`,
);

await q(
  "select key, is_enabled from feature_flags where is_enabled = false order by key",
);
