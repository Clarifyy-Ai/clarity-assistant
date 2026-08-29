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
const { data: session } = await sb.auth.getSession();
const token = session.session.access_token;

// Learning full cycle
{
  const slug = `qa-learn-${stamp}`;
  const course = await sb
    .from("learning_courses")
    .insert({
      slug,
      title: `QA Learn ${stamp}`,
      description: "probe",
      duration_hours: 1,
      created_by: auth.data.user.id,
      content_owner: auth.data.user.id,
      source: "ORIGINAL",
      license_type: "ORIGINAL",
      copyright_status: "ORIGINAL",
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
        lesson_type: "text",
        content_text: "Hello lesson",
        sort_order: 0,
        created_by: auth.data.user.id,
        content_owner: auth.data.user.id,
        source: "ORIGINAL",
        license_type: "ORIGINAL",
        copyright_status: "ORIGINAL",
      })
      .select("id")
      .single();
    const pub = await sb
      .from("learning_courses")
      .update({ publish_status: "published" })
      .eq("id", course.data.id)
      .select("publish_status")
      .single();
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
      .eq("publish_status", "published")
      .maybeSingle();
    await free.auth.signOut();
    await sb
      .from("learning_courses")
      .update({ publish_status: "draft" })
      .eq("id", course.data.id);
    out.learning = {
      course: course.data,
      moduleOk: !!mod.data,
      lessonOk: !lesson.error,
      lessonErr: lesson.error?.message,
      published: pub.data,
      freeSees: visible.data,
    };
  }
}

// search-exams edge
{
  try {
    const r = await fetch(`${url}/functions/v1/search-exams`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: "IBPS" }),
      signal: AbortSignal.timeout(20000),
    });
    out.searchExams = { status: r.status, body: (await r.text()).slice(0, 500) };
  } catch (e) {
    out.searchExams = { error: String(e.message || e) };
  }
}

// extract-question-paper with text (no PDF) for one public exam
{
  const exam = await sb
    .from("gov_exams")
    .select("id,code")
    .eq("code", "IBPS_PO")
    .maybeSingle();
  if (exam.data) {
    try {
      const r = await fetch(`${url}/functions/v1/extract-question-paper`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: anon,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          examId: exam.data.id,
          title: `QA extract ${stamp}`,
          year: 2024,
          licenseClass: "user_upload",
          textPayload:
            "Q1. What is 2+2?\nA) 3\nB) 4\nC) 5\nD) 6\nAnswer: B\n\nQ2. Capital of India?\nA) Mumbai\nB) Delhi\nC) Kolkata\nD) Chennai\nAnswer: B",
          createPaper: false,
        }),
        signal: AbortSignal.timeout(90000),
      });
      out.extract = { status: r.status, body: (await r.text()).slice(0, 800) };
    } catch (e) {
      out.extract = { error: String(e.message || e) };
    }
  } else {
    out.extract = { error: "exam missing" };
  }
}

// bulk_update_users credit grant on free user (then note — may be heavy; skip if risky)
{
  const freeId = qa.QA_FREE_USER_ID;
  const before = await sb
    .from("profiles")
    .select("id,credits")
    .eq("id", freeId)
    .maybeSingle();
  out.creditsBefore = before.data;
  // Don't actually mutate free credits in this pass — just verify RPC exists
  const probe = await sb.rpc("bulk_update_users", {
    p_user_ids: [],
    p_patch: {},
  });
  out.bulkUpdateUsers = probe.error
    ? { error: probe.error.message }
    : { ok: true, data: probe.data };
}

// translations list
{
  const t = await sb
    .from("question_translations")
    .select(
      "id, question_id, language, question_text, options, explanation, review_state, reviewer_id, source_version, created_at, updated_at",
    )
    .limit(5);
  out.translations = t.error ? { error: t.error.message } : { count: t.data.length, sample: t.data };
}

// community posts visible
{
  const posts = await sb
    .from("community_posts")
    .select("id,title,status,visibility")
    .limit(5);
  out.community = posts.error
    ? { error: posts.error.message }
    : { count: posts.data.length, sample: posts.data };
}

await sb.auth.signOut();
writeFileSync("_probe_admin_verify3_out.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
