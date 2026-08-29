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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    o[t.slice(0, i).trim()] = v;
  }
  return o;
}
function log(hypothesisId, message, data) {
  fs.appendFileSync(
    "debug-fcd48a.log",
    JSON.stringify({
      sessionId: "fcd48a",
      runId: "prompt05-repro3",
      hypothesisId,
      location: "probe3",
      message,
      data,
      timestamp: Date.now(),
    }) + "\n",
  );
  console.log(hypothesisId, message, JSON.stringify(data));
}

const local = { ...load(".env.local"), ...load(".env") };
const qa = load(".env.qa.local");
const client = createClient(local.VITE_SUPABASE_URL, local.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: auth, error: authErr } = await client.auth.signInWithPassword({
  email: qa.QA_PRO_EMAIL,
  password: qa.QA_PRO_PASSWORD,
});
if (authErr) throw authErr;

const { data: freeHelp, error: fErr } = await client
  .from("help_articles")
  .select("id,slug,question,published")
  .ilike("question", "%free plan%");
log("HELP", "free plan by question", {
  err: fErr?.message ?? null,
  count: freeHelp?.length ?? 0,
  published: (freeHelp ?? []).filter((r) => r.published).length,
  rows: freeHelp ?? [],
});

const { data: allPublished } = await client
  .from("help_articles")
  .select("id,slug,question,published")
  .eq("published", true);
const byQ = new Map();
for (const row of allPublished ?? []) {
  const q = String(row.question ?? "").trim().toLowerCase();
  if (!byQ.has(q)) byQ.set(q, []);
  byQ.get(q).push(row);
}
const dupes = [...byQ.entries()].filter(([, rows]) => rows.length > 1);
log("HELP", "published duplicate questions", {
  publishedCount: allPublished?.length ?? 0,
  duplicateGroups: dupes.length,
  samples: dupes.slice(0, 5).map(([q, rows]) => ({
    question: q,
    slugs: rows.map((r) => r.slug),
  })),
});

const sid = "96370a52-00b3-4c70-aa94-5dcccad01201";
const { data: detail, error: dErr } = await client
  .from("sessions")
  .select("id,status,overall_score,duration_seconds,user_id")
  .eq("id", sid)
  .eq("user_id", auth.user.id)
  .maybeSingle();
log("SES", "session detail ownership fetch", {
  ok: Boolean(detail?.id),
  err: dErr?.message ?? null,
  status: detail?.status ?? null,
  score: detail?.overall_score ?? null,
});

// Cross-user: fetch without user filter should still be blocked by RLS for others' rows
const { data: allSess } = await client.from("sessions").select("id,user_id").limit(20);
const foreign = (allSess ?? []).filter((r) => r.user_id !== auth.user.id);
log("SES", "RLS foreign sessions visible?", { foreignCount: foreign.length });
