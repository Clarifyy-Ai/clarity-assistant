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
const stamp = Date.now().toString(36);
const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
const out = { stamp };

const auth = await sb.auth.signInWithPassword({
  email: qa.QA_ADMIN_EMAIL,
  password: qa.QA_ADMIN_PASSWORD,
});
if (auth.error) throw new Error(auth.error.message);

// Paper approve then revert
{
  const paper = await sb
    .from("gov_generated_papers")
    .select("id,review_state,title")
    .eq("review_state", "machine_validated")
    .limit(1)
    .maybeSingle();
  if (paper.data) {
    const prev = paper.data.review_state;
    const up = await sb
      .from("gov_generated_papers")
      .update({ review_state: "approved" })
      .eq("id", paper.data.id)
      .select("id,review_state")
      .single();
    const reread = await sb
      .from("gov_generated_papers")
      .select("review_state")
      .eq("id", paper.data.id)
      .single();
    // reject then restore machine_validated
    await sb
      .from("gov_generated_papers")
      .update({ review_state: "rejected" })
      .eq("id", paper.data.id);
    const rej = await sb
      .from("gov_generated_papers")
      .select("review_state")
      .eq("id", paper.data.id)
      .single();
    await sb
      .from("gov_generated_papers")
      .update({ review_state: prev })
      .eq("id", paper.data.id);
    out.paperReview = {
      id: paper.data.id.slice(0, 8),
      approved: up.data,
      persistApproved: reread.data,
      rejected: rej.data,
      restored: prev,
    };
  } else {
    out.paperReview = { note: "no machine_validated paper" };
  }
}

// Registry: toggle is_public on a non-critical exam if safe — read only + alias check
{
  const exams = await sb
    .from("gov_exams")
    .select("id,code,name,is_public,review_state,legacy_exam_type")
    .limit(5);
  out.registry = exams.error ? { error: exams.error.message } : exams.data;
  // user-facing search RPC if exists
  const search = await sb.rpc("search_gov_exams", { p_query: "IBPS" }).maybeSingle?.();
  const search2 = await sb.rpc("search_gov_exams", { p_query: "IBPS" });
  out.registrySearch = search2.error
    ? { error: search2.error.message }
    : { count: Array.isArray(search2.data) ? search2.data.length : search2.data };
}

// Learning publish cycle on a dedicated QA course
{
  const slug = `qa-admin-learn-${stamp}`;
  const course = await sb
    .from("learning_courses")
    .insert({
      title: `QA Admin Learn ${stamp}`,
      slug,
      description: "probe",
      publish_status: "draft",
    })
    .select("id,slug,publish_status")
    .single();
  if (course.error) {
    out.learning = { error: course.error.message };
  } else {
    const mod = await sb
      .from("learning_modules")
      .insert({ course_id: course.data.id, title: "M1", sort_order: 0 })
      .select("id")
      .single();
    const lesson = await sb
      .from("learning_lessons")
      .insert({
        module_id: mod.data.id,
        title: "L1",
        content_md: "probe",
        sort_order: 0,
      })
      .select("id")
      .single();
    const pub = await sb
      .from("learning_courses")
      .update({ publish_status: "published" })
      .eq("id", course.data.id)
      .select("publish_status")
      .single();
    // free user visibility
    const free = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await free.auth.signInWithPassword({
      email: qa.QA_FREE_EMAIL,
      password: qa.QA_FREE_PASSWORD,
    });
    const visible = await free
      .from("learning_courses")
      .select("id,slug,publish_status")
      .eq("slug", slug)
      .maybeSingle();
    await free.auth.signOut();
    await sb
      .from("learning_courses")
      .update({ publish_status: "draft" })
      .eq("id", course.data.id);
    out.learning = {
      course: course.data,
      module: mod.error ? mod.error.message : mod.data?.id?.slice(0, 8),
      lesson: lesson.error ? lesson.error.message : lesson.data?.id?.slice(0, 8),
      published: pub.data,
      freeVisible: visible.data,
      freeError: visible.error?.message,
    };
  }
}

// Feature flag roundtrip (toggle a non-critical flag if present)
{
  const key = "offline_mode";
  const cur = await sb
    .from("feature_flags")
    .select("key,is_enabled")
    .eq("key", key)
    .maybeSingle();
  if (cur.data) {
    const next = !cur.data.is_enabled;
    const up = await sb
      .from("feature_flags")
      .update({ is_enabled: next, updated_at: new Date().toISOString() })
      .eq("key", key)
      .select("is_enabled")
      .single();
    const publicFlags = await sb.rpc("get_public_feature_flags");
    const row = (publicFlags.data || []).find((f) => f.key === key);
    // restore
    await sb
      .from("feature_flags")
      .update({ is_enabled: cur.data.is_enabled })
      .eq("key", key);
    out.featureFlags = {
      key,
      before: cur.data.is_enabled,
      afterWrite: up.data,
      publicSees: row,
      restored: cur.data.is_enabled,
    };
  } else {
    out.featureFlags = { error: cur.error?.message || "flag missing" };
  }
}

// Blog public propagation
{
  const slug = `qa-blog-pub-${stamp}`;
  const ins = await sb
    .from("blog_posts")
    .insert({
      slug,
      title: `QA Blog ${stamp}`,
      excerpt: "e",
      content: "c",
      category: "Product",
      author: "Career Pilot",
      published: true,
      published_at: new Date().toISOString(),
      read_time: "1 min",
    })
    .select("id,slug,published")
    .single();
  const anonC = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pub = await anonC
    .from("blog_posts")
    .select("slug,title,published")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (ins.data?.id) {
    await sb.from("blog_posts").update({ published: false }).eq("id", ins.data.id);
  }
  const after = await anonC
    .from("blog_posts")
    .select("slug")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  out.blog = {
    created: ins.error ? ins.error.message : ins.data,
    anonSeesPublished: pub.data,
    anonSeesAfterUnpublish: after.data,
  };
}

// Gov source register
{
  const title = `QA Source ${stamp}`;
  const ins = await sb
    .from("gov_official_sources")
    .insert({
      title,
      source_url: "https://ssc.gov.in/",
      document_type: "notification",
      license_class: "official_public",
      review_state: "draft",
      metadata: { registered_via: "admin_probe" },
    })
    .select("id,title,review_state")
    .single();
  const reread = ins.data
    ? await sb
        .from("gov_official_sources")
        .select("id,title,review_state")
        .eq("id", ins.data.id)
        .single()
    : null;
  out.govSource = {
    insert: ins.error ? ins.error.message : ins.data,
    persist: reread?.data,
  };
}

// Promo redemption edge
{
  const { data: session } = await sb.auth.getSession();
  try {
    const r = await fetch(`${url}/functions/v1/redeem-promo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.session.access_token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code: "DOES-NOT-EXIST-XYZ" }),
      signal: AbortSignal.timeout(20000),
    });
    out.promoRedeem = { status: r.status, body: (await r.text()).slice(0, 300) };
  } catch (e) {
    // try alternate names
    const alts = ["apply-promo-code", "promo-redeem", "validate-promo"];
    out.promoRedeem = { error: String(e.message || e), tried: "redeem-promo" };
    for (const ep of alts) {
      try {
        const r = await fetch(`${url}/functions/v1/${ep}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session.session.access_token}`,
            apikey: anon,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code: "X" }),
          signal: AbortSignal.timeout(10000),
        });
        out.promoRedeem[ep] = { status: r.status, body: (await r.text()).slice(0, 200) };
      } catch (err) {
        out.promoRedeem[ep] = { error: String(err.message || err) };
      }
    }
  }
}

await sb.auth.signOut();
writeFileSync("_probe_admin_verify2_out.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
