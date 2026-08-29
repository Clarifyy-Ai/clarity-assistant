import { readFileSync, writeFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function loadEnv(path) {
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const local = loadEnv(".env.local");
const qa = loadEnv(".env.qa.local");
const url = local.VITE_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY || local.VITE_SUPABASE_PUBLISHABLE_KEY;
const sb = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const stamp = Date.now().toString(36);
const out = { stamp };

const auth = await sb.auth.signInWithPassword({
  email: qa.QA_ADMIN_EMAIL,
  password: qa.QA_ADMIN_PASSWORD,
});
if (auth.error) throw new Error(auth.error.message);

// 1) Question review select (fixed — no quality_score required, but column may now exist)
{
  const withScore = await sb
    .from("questions")
    .select(
      "id, question_text, exam_type, topic, subject, difficulty, source, source_type, quality_score, quality_algorithm_version, metadata, is_verified, is_public, created_at",
    )
    .eq("is_public", true)
    .eq("is_verified", false)
    .order("created_at", { ascending: false })
    .limit(5);
  const without = await sb
    .from("questions")
    .select(
      "id, question_text, exam_type, topic, subject, difficulty, source, source_type, quality_algorithm_version, metadata, is_verified, is_public, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(5);
  out.questionReview = {
    withScore: withScore.error
      ? { error: withScore.error.message }
      : { ok: true, count: withScore.data.length },
    withoutScore: without.error
      ? { error: without.error.message }
      : { ok: true, count: without.data.length },
  };
}

// 2) Help duplicates
{
  const help = await sb
    .from("help_articles")
    .select("id,slug,question,published")
    .or("slug.eq.gs-3,slug.eq.gs-4,question.ilike.%free plan%");
  const publishedQs = {};
  for (const h of help.data || []) {
    if (!h.published) continue;
    const k = h.question.trim().toLowerCase();
    publishedQs[k] = (publishedQs[k] || 0) + 1;
  }
  // try publish conflict
  const draft = (help.data || []).find((h) => h.slug === "gs-4");
  let conflict = null;
  if (draft) {
    // temporarily set question back to clash and try publish
    await sb
      .from("help_articles")
      .update({ question: "Is there a free plan?" })
      .eq("id", draft.id);
    const pub = await sb
      .from("help_articles")
      .update({ published: true })
      .eq("id", draft.id)
      .select();
    conflict = pub.error
      ? { blocked: true, message: pub.error.message }
      : { blocked: false, data: pub.data };
    // restore archive title
    await sb
      .from("help_articles")
      .update({
        published: false,
        question: "Is there a free plan? (archived draft — use gs-3)",
      })
      .eq("id", draft.id);
  }
  out.help = { rows: help.data, publishedDupCounts: publishedQs, conflict };
}

// 3) Promo 0100 again
{
  const code = `V0100${stamp}`.toUpperCase().slice(0, 16);
  const bonusNum = Number.parseInt("0100", 10);
  const ins = await sb
    .from("promo_codes")
    .insert({
      code,
      discount_percent: 5,
      bonus_credits: bonusNum,
      applies_to: "all",
      is_active: true,
      max_redemptions: 1,
    })
    .select("id,code,bonus_credits")
    .single();
  const reread = ins.data
    ? await sb
        .from("promo_codes")
        .select("bonus_credits")
        .eq("id", ins.data.id)
        .single()
    : null;
  if (ins.data?.id) {
    await sb.from("promo_codes").update({ is_active: false }).eq("id", ins.data.id);
  }
  out.promo = {
    insert: ins.error ? { error: ins.error.message } : ins.data,
    reread: reread?.data,
    match: reread?.data?.bonus_credits === 100,
  };
}

// 4) Support reply
{
  const threads = await sb
    .from("support_threads")
    .select("id,status")
    .eq("status", "open")
    .limit(1);
  const threadId = threads.data?.[0]?.id;
  if (threadId) {
    const msg = await sb
      .from("support_messages")
      .insert({
        thread_id: threadId,
        sender_id: auth.data.user.id,
        sender_role: "admin",
        body: `QA admin probe reply ${stamp}`,
      })
      .select("id,body,created_at")
      .single();
    const again = msg.data
      ? await sb
          .from("support_messages")
          .select("id,body")
          .eq("id", msg.data.id)
          .single()
      : null;
    out.support = {
      threadId: threadId.slice(0, 8),
      insert: msg.error ? { error: msg.error.message } : { id: msg.data.id },
      persist: again?.data?.body,
    };
  } else {
    out.support = { note: "no open threads" };
  }
}

// 5) Paper approve transition
{
  const papers = await sb
    .from("gov_generated_papers")
    .select("id,title,review_state")
    .limit(5);
  out.papers = papers.error ? { error: papers.error.message } : papers.data;
}

// 6) Auth free blocked
{
  const free = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await free.auth.signInWithPassword({
    email: qa.QA_FREE_EMAIL,
    password: qa.QA_FREE_PASSWORD,
  });
  const adminRpc = await free.rpc("is_admin");
  const roles = await free.from("user_roles").select("user_id,role").limit(20);
  const helpPub = await free
    .from("help_articles")
    .update({ published: true })
    .eq("slug", "gs-4")
    .select();
  out.freeAuth = {
    is_admin: adminRpc.data,
    rolesVisible: roles.data?.length ?? 0,
    rolesError: roles.error?.message,
    helpPublish: helpPub.error
      ? { blocked: true, message: helpPub.error.message }
      : { rows: helpPub.data?.length ?? 0 },
  };
  await free.auth.signOut();
}

// 7) hybrid-health
{
  const { data: session } = await sb.auth.getSession();
  try {
    const r = await fetch(`${url}/functions/v1/hybrid-health`, {
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
        apikey: anon,
      },
      signal: AbortSignal.timeout(25000),
    });
    const body = await r.json();
    out.diagnostics = {
      status: r.status,
      db: body.db,
      storage: body.storage,
      python: {
        configured: body.python?.configured,
        up: body.python?.up,
        status: body.python?.status,
        ready_ok: body.python?.ready?.ok,
        signed_ok: body.python?.signed_internal?.ok,
      },
      razorpay: body.razorpay?.status || body.razorpay,
      ai: body.ai,
    };
  } catch (e) {
    out.diagnostics = { error: String(e.message || e) };
  }
}

await sb.auth.signOut();
writeFileSync("_probe_admin_verify_out.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
