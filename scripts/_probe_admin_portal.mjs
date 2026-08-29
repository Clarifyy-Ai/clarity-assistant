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

function client() {
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`TIMEOUT ${label} after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(t);
  }
}

async function probeUser(label, email, password) {
  const sb = client();
  const out = { label };
  console.error(`[${label}] signing in…`);
  const auth = await withTimeout(
    sb.auth.signInWithPassword({ email, password }),
    20000,
    "signIn",
  );
  if (auth.error) {
    out.error = auth.error.message;
    return out;
  }
  out.userId = auth.data.user.id.slice(0, 8);
  console.error(`[${label}] signed in ${out.userId}`);

  async function q(name, fn) {
    try {
      const res = await withTimeout(fn(), 20000, name);
      out[name] = res;
      console.error(`[${label}] ${name} done`);
    } catch (e) {
      out[name] = { error: String(e.message || e) };
      console.error(`[${label}] ${name} fail`, e.message || e);
    }
  }

  await q("is_admin", async () => {
    const r = await sb.rpc("is_admin");
    return r.error ? { error: r.error.message } : { data: r.data };
  });

  await q("own_roles", async () => {
    const r = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.data.user.id);
    return r.error ? { error: r.error.message } : r.data;
  });

  await q("all_roles_sample", async () => {
    const r = await sb.from("user_roles").select("user_id,role").limit(30);
    if (r.error) return { error: r.error.message, code: r.error.code };
    return {
      count: r.data.length,
      otherUsers: r.data.some((x) => x.user_id !== auth.data.user.id),
      roles: [...new Set(r.data.map((x) => x.role))],
    };
  });

  await q("profiles_list", async () => {
    const r = await sb
      .from("profiles")
      .select("id,email,plan_id,credits,is_banned")
      .limit(5);
    return r.error
      ? { error: r.error.message, code: r.error.code }
      : { count: r.data.length };
  });

  await q("promo_codes", async () => {
    const r = await sb
      .from("promo_codes")
      .select("code,bonus_credits,discount_percent,is_active")
      .order("created_at", { ascending: false })
      .limit(8);
    return r.error ? { error: r.error.message } : r.data;
  });

  await q("help_articles", async () => {
    const r = await sb
      .from("help_articles")
      .select("id,slug,question,published");
    if (r.error) return { error: r.error.message };
    const byQ = {};
    for (const h of r.data) {
      const k = (h.question || "").trim().toLowerCase();
      byQ[k] = (byQ[k] || 0) + 1;
    }
    const dups = Object.entries(byQ)
      .filter(([, c]) => c > 1)
      .map(([qtext, c]) => ({ q: qtext.slice(0, 70), c }));
    const focus = r.data.filter(
      (h) =>
        /free plan|extra credits/i.test(h.question || "") ||
        /free-plan|extra-credits/i.test(h.slug || ""),
    );
    return { total: r.data.length, dups, focus };
  });

  await q("blog_posts", async () => {
    let r = await sb
      .from("blog_posts")
      .select("id,slug,title,status,published_at")
      .limit(5);
    if (r.error) {
      r = await sb.from("blog_posts").select("*").limit(1);
      return r.error
        ? { error: r.error.message }
        : { keys: Object.keys(r.data?.[0] || {}) };
    }
    return {
      count: r.data.length,
      sample: r.data.map((x) => ({
        slug: x.slug,
        status: x.status,
        title: (x.title || "").slice(0, 40),
      })),
    };
  });

  await q("questions_public_unverified", async () => {
    const r = await sb
      .from("questions")
      .select("id,exam_type,source,is_public,is_verified")
      .eq("is_public", true)
      .eq("is_verified", false)
      .limit(5);
    return r.error
      ? { error: r.error.message, code: r.error.code, details: r.error.details }
      : { count: r.data.length, sample: r.data };
  });

  await q("questions_filter_exam_types", async () => {
    const { data } = await sb
      .from("questions")
      .select("exam_type")
      .not("exam_type", "is", null)
      .limit(100);
    const types = [...new Set((data || []).map((x) => x.exam_type))];
    const probes = {};
    for (const et of ["UPSC", "ssc_cgl", "IBPS_PO", "custom", types[0]].filter(
      Boolean,
    )) {
      const r = await sb
        .from("questions")
        .select("id", { count: "exact", head: true })
        .eq("exam_type", et);
      probes[et] = r.error
        ? { error: r.error.message, code: r.error.code }
        : { count: r.count };
    }
    return { types: types.slice(0, 20), probes };
  });

  await q("profile_column_probes", async () => {
    const cols = [
      "id,plan_id,subscription_status",
      "id,stripe_subscription_id",
      "id,subscription_id",
    ];
    const res = {};
    for (const c of cols) {
      const r = await sb.from("profiles").select(c).limit(1);
      res[c] = r.error ? r.error.message.slice(0, 140) : "ok";
    }
    return res;
  });

  await q("feature_flags", async () => {
    const r = await sb.from("feature_flags").select("key,is_enabled").limit(15);
    return r.error ? { error: r.error.message } : r.data;
  });

  await q("admin_audit_log", async () => {
    const r = await sb
      .from("admin_audit_log")
      .select("action,target_type,created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    return r.error ? { error: r.error.message } : r.data;
  });

  await q("tables", async () => {
    const names = [
      "gov_sources",
      "gov_exams",
      "ingestion_jobs",
      "gov_ingestion_jobs",
      "support_tickets",
      "support_threads",
      "billing_settings",
      "app_settings",
      "promo_redemptions",
      "official_paper_sources",
      "gov_exam_papers",
    ];
    const res = {};
    for (const t of names) {
      const r = await sb.from(t).select("*").limit(1);
      res[t] = r.error
        ? r.error.message.slice(0, 90)
        : { keys: Object.keys(r.data?.[0] || {}).slice(0, 12), n: r.data.length };
    }
    return res;
  });

  await sb.auth.signOut();
  return out;
}

const result = {
  host: new URL(url).host,
  admin: await probeUser("ADMIN", qa.QA_ADMIN_EMAIL, qa.QA_ADMIN_PASSWORD),
  free: await probeUser("FREE", qa.QA_FREE_EMAIL, qa.QA_FREE_PASSWORD),
};

writeFileSync("_probe_admin_portal_out.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
