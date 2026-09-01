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
const url = local.VITE_SUPABASE_URL || qa.QA_SUPABASE_URL;
const anon = local.VITE_SUPABASE_ANON_KEY || local.VITE_SUPABASE_PUBLISHABLE_KEY;
const stamp = Date.now().toString(36);

function client() {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`TIMEOUT ${label}`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

const sb = client();
const out = { stamp };

console.error("sign in admin…");
const auth = await withTimeout(
  sb.auth.signInWithPassword({
    email: qa.QA_ADMIN_EMAIL,
    password: qa.QA_ADMIN_PASSWORD,
  }),
  20000,
  "signin",
);
if (auth.error) throw new Error(auth.error.message);
out.adminId = auth.data.user.id.slice(0, 8);

async function step(name, fn) {
  try {
    out[name] = await withTimeout(fn(), 30000, name);
    console.error("ok", name);
  } catch (e) {
    out[name] = { error: String(e.message || e) };
    console.error("fail", name, e.message || e);
  }
}

await step("gov_official_sources", async () => {
  const r = await sb
    .from("gov_official_sources")
    .select("id,title,review_state,source_url")
    .limit(5);
  return r.error
    ? { error: r.error.message }
    : { count: r.data.length, sample: r.data };
});

await step("source_ingestion_jobs", async () => {
  const r = await sb.from("source_ingestion_jobs").select("*").limit(2);
  return r.error
    ? { error: r.error.message }
    : { keys: Object.keys(r.data?.[0] || {}), n: r.data.length };
});

await step("get_gov_exam_bank_readiness", async () => {
  const r = await sb.rpc("get_gov_exam_bank_readiness");
  return r.error
    ? { error: r.error.message, code: r.error.code, details: r.error.details, hint: r.error.hint }
    : { rows: Array.isArray(r.data) ? r.data.length : r.data };
});

await step("listQuestionsLikeUI", async () => {
  // mimics AdminGovQuestionReview default: public_unverified
  const r = await sb
    .from("questions")
    .select(
      "id, question_text, exam_type, topic, subject, difficulty, source, source_type, quality_score, metadata, is_verified, is_public, created_at",
    )
    .eq("is_public", true)
    .eq("is_verified", false)
    .order("created_at", { ascending: false })
    .limit(200);
  return r.error
    ? { error: r.error.message, code: r.error.code, details: r.error.details }
    : { count: r.data.length };
});

await step("questionFilterWithSourceMissing", async () => {
  // common buggy patterns
  const probes = {};
  {
    const r = await sb
      .from("questions")
      .select("id")
      .is("source", null)
      .limit(5);
    probes.source_is_null = r.error
      ? { error: r.error.message, code: r.error.code }
      : { count: r.data.length };
  }
  {
    const r = await sb
      .from("questions")
      .select("id,source")
      .eq("source", "")
      .limit(5);
    probes.source_empty = r.error
      ? { error: r.error.message, code: r.error.code }
      : { count: r.data.length };
  }
  {
    // filter by exam_type using config id (wrong) vs storage label
    const r = await sb
      .from("questions")
      .select("id")
      .eq("exam_type", "UPSC")
      .limit(5);
    probes.exam_type_UPSC_id = r.error
      ? { error: r.error.message }
      : { count: r.data.length };
  }
  {
    const r = await sb
      .from("questions")
      .select("id")
      .eq("exam_type", "UPSC CSE")
      .limit(5);
    probes.exam_type_UPSC_label = r.error
      ? { error: r.error.message }
      : { count: r.data.length };
  }
  return probes;
});

await step("createPromo0100", async () => {
  const code = `QA0100${stamp}`.toUpperCase().slice(0, 20);
  const bonusRaw = "0100";
  const bonusNum = Number.parseInt(bonusRaw, 10); // expect 100
  const r = await sb
    .from("promo_codes")
    .insert({
      code,
      discount_percent: 10,
      bonus_credits: bonusNum,
      applies_to: "all",
      is_active: true,
      max_redemptions: 1,
    })
    .select("id,code,bonus_credits,discount_percent")
    .single();
  if (r.error) return { error: r.error.message, code: r.error.code };
  // re-read
  const again = await sb
    .from("promo_codes")
    .select("id,code,bonus_credits")
    .eq("id", r.data.id)
    .single();
  // deactivate to avoid leaving junk active (keep row for evidence)
  await sb
    .from("promo_codes")
    .update({ is_active: false })
    .eq("id", r.data.id);
  return {
    inserted: r.data,
    reread: again.data,
    parsedBonus: bonusNum,
    match: again.data?.bonus_credits === 100,
  };
});

await step("blogCrud", async () => {
  const slug = `qa-admin-blog-${stamp}`;
  const insert = await sb
    .from("blog_posts")
    .insert({
      slug,
      title: `QA Admin Blog ${stamp}`,
      excerpt: "probe",
      content: "probe body",
      category: "Product",
      author: "Career Pilot",
      published: false,
      published_at: new Date().toISOString(),
      read_time: "1 min",
    })
    .select("id,slug,published")
    .single();
  if (insert.error) return { error: insert.error.message };
  const publish = await sb
    .from("blog_posts")
    .update({ published: true, published_at: new Date().toISOString() })
    .eq("id", insert.data.id)
    .select("id,published")
    .single();
  // public-style read as admin still ok; we'll check anon later
  const publicRead = await sb
    .from("blog_posts")
    .select("id,slug,title,published")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  const unpub = await sb
    .from("blog_posts")
    .update({ published: false })
    .eq("id", insert.data.id)
    .select("published")
    .single();
  // duplicate slug
  const dup = await sb.from("blog_posts").insert({
    slug,
    title: "dup",
    excerpt: "x",
    content: "x",
    category: "Product",
    author: "Career Pilot",
    published: false,
    published_at: new Date().toISOString(),
  });
  return {
    created: insert.data,
    published: publish.data,
    publicRead: publicRead.data,
    unpublished: unpub.data,
    duplicateSlug: dup.error
      ? { rejected: true, message: dup.error.message }
      : { rejected: false, data: dup.data },
  };
});

await step("helpDuplicatePublishGuard", async () => {
  // try publish second "Is there a free plan?" if draft exists
  const rows = await sb
    .from("help_articles")
    .select("id,slug,question,published")
    .ilike("question", "%free plan%");
  const published = (rows.data || []).filter((r) => r.published);
  const drafts = (rows.data || []).filter((r) => !r.published);
  let publishDraft = null;
  if (drafts[0]) {
    const r = await sb
      .from("help_articles")
      .update({ published: true })
      .eq("id", drafts[0].id)
      .select("id,published")
      .single();
    publishDraft = r.error
      ? { error: r.error.message }
      : { published: r.data, note: "NO uniqueness guard — draft published" };
    // revert
    if (!r.error) {
      await sb
        .from("help_articles")
        .update({ published: false })
        .eq("id", drafts[0].id);
    }
  }
  // create unique test article
  const slug = `qa-help-${stamp}`;
  const ins = await sb
    .from("help_articles")
    .insert({
      slug,
      category_slug: "getting-started",
      category_title: "Getting started",
      question: `QA unique help ${stamp}?`,
      answer: "probe answer",
      body_md: "probe",
      sort_order: 9999,
      published: false,
    })
    .select("id,slug,published")
    .single();
  let pub = null;
  let anonSee = null;
  if (!ins.error) {
    pub = await sb
      .from("help_articles")
      .update({ published: true })
      .eq("id", ins.data.id)
      .select("id,published")
      .single();
    // unpublish after
    await sb
      .from("help_articles")
      .update({ published: false })
      .eq("id", ins.data.id);
  }
  return {
    existing: rows.data,
    publishDraft,
    created: ins.error ? { error: ins.error.message } : ins.data,
    publishedOk: pub?.data || pub?.error,
  };
});

await step("supportReply", async () => {
  const threads = await sb
    .from("support_threads")
    .select("id,subject,status,priority")
    .order("updated_at", { ascending: false })
    .limit(3);
  if (threads.error) return { error: threads.error.message };
  // discover messages table
  const tables = {};
  for (const t of [
    "support_messages",
    "support_thread_messages",
    "support_replies",
  ]) {
    const r = await sb.from(t).select("*").limit(1);
    tables[t] = r.error
      ? r.error.message.slice(0, 80)
      : { keys: Object.keys(r.data?.[0] || {}), n: r.data.length };
  }
  return { threads: threads.data, tables };
});

await step("billing_settings_update", async () => {
  const cur = await sb.from("billing_settings").select("*").limit(1).single();
  if (cur.error) return { error: cur.error.message };
  const prev = cur.data.referral_discount_percent;
  const next = prev === 10 ? 11 : 10;
  const upd = await sb
    .from("billing_settings")
    .update({
      referral_discount_percent: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", cur.data.id)
    .select("id,referral_discount_percent")
    .single();
  // revert
  await sb
    .from("billing_settings")
    .update({ referral_discount_percent: prev })
    .eq("id", cur.data.id);
  return {
    before: prev,
    afterWrite: upd.error ? { error: upd.error.message } : upd.data,
    revertedTo: prev,
  };
});

await step("gov_generated_papers", async () => {
  const r = await sb.from("gov_generated_papers").select("*").limit(2);
  return r.error
    ? { error: r.error.message }
    : { keys: Object.keys(r.data?.[0] || {}).slice(0, 20), n: r.data.length };
});

await step("question_translations", async () => {
  const r = await sb
    .from("question_translations")
    .select("id,language,review_state,is_published")
    .limit(5);
  return r.error ? { error: r.error.message } : r.data;
});

await step("hybrid_health_edge", async () => {
  const { data: session } = await sb.auth.getSession();
  const token = session.session?.access_token;
  const endpoints = [
    "hybrid-health",
    "admin-diagnostics",
    "system-health",
    "health-check",
  ];
  const res = {};
  for (const ep of endpoints) {
    try {
      const r = await fetch(`${url}/functions/v1/${ep}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anon,
        },
        signal: AbortSignal.timeout(15000),
      });
      const text = await r.text();
      res[ep] = {
        status: r.status,
        body: text.slice(0, 300),
      };
    } catch (e) {
      res[ep] = { error: String(e.message || e) };
    }
  }
  return res;
});

await sb.auth.signOut();

// anon public blog/help visibility
const anonSb = client();
await step("anon_public_help", async () => {
  const r = await anonSb
    .from("help_articles")
    .select("slug,question,published")
    .eq("published", true)
    .ilike("question", "%free plan%");
  return r.error ? { error: r.error.message } : r.data;
});

await step("anon_public_blog", async () => {
  const r = await anonSb
    .from("blog_posts")
    .select("slug,title,published")
    .eq("published", true)
    .limit(5);
  return r.error ? { error: r.error.message } : r.data;
});

// free user privilege escalation attempts
const free = client();
const freeAuth = await withTimeout(
  free.auth.signInWithPassword({
    email: qa.QA_FREE_EMAIL,
    password: qa.QA_FREE_PASSWORD,
  }),
  20000,
  "freeSignin",
);
out.freeSignin = freeAuth.error
  ? { error: freeAuth.error.message }
  : { ok: true, id: freeAuth.data.user.id.slice(0, 8) };

if (!freeAuth.error) {
  await step("free_cannot_make_admin", async () => {
    const r = await free.from("user_roles").insert({
      user_id: freeAuth.data.user.id,
      role: "admin",
    });
    return r.error
      ? { blocked: true, message: r.error.message }
      : { blocked: false, leaked: true };
  });
  await step("free_cannot_create_promo", async () => {
    const r = await free.from("promo_codes").insert({
      code: `FREEHACK${stamp}`.slice(0, 12),
      discount_percent: 99,
      bonus_credits: 9999,
      applies_to: "all",
      is_active: true,
    });
    return r.error
      ? { blocked: true, message: r.error.message }
      : { blocked: false, leaked: true };
  });
  await step("free_cannot_update_billing", async () => {
    const r = await free
      .from("billing_settings")
      .update({ referral_discount_percent: 99 })
      .neq("id", "00000000-0000-0000-0000-000000000000");
    return r.error
      ? { blocked: true, message: r.error.message }
      : { blocked: false, count: r.count, data: r.data };
  });
  await step("free_cannot_publish_help", async () => {
    const r = await free
      .from("help_articles")
      .update({ published: true })
      .eq("slug", "gs-4");
    return r.error
      ? { blocked: true, message: r.error.message }
      : { blocked: false, data: r.data };
  });
  await free.auth.signOut();
}

writeFileSync("_probe_admin_writes_out.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
