#!/usr/bin/env node
/**
 * Seed two scored + one unscored completed sessions for Compare QA (TC-REP-003).
 *
 * Target user (first match wins):
 *   QA_HISTORY_EMAIL | QA_PRO_EMAIL | qa.pro@clarify.ai.test
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local / env.
 *
 * Usage: node --use-system-ca scripts/seed-compare-sessions.mjs
 *        npm run qa:seed-compare
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

/** Stable UUIDs so re-runs upsert the same fixtures. */
const SESSION_A_ID = "a1111111-1111-4111-8111-111111111111";
const SESSION_B_ID = "a2222222-2222-4222-8222-222222222222";
const SESSION_C_ID = "a3333333-3333-4333-8333-333333333333";

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = {
  ...loadEnvFile(path.join(root, ".env")),
  ...loadEnvFile(path.join(root, ".env.local")),
  ...loadEnvFile(path.join(root, ".env.qa.local")),
  ...process.env,
};

const url = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || env.QA_SUPABASE_URL || "").replace(
  /\/$/,
  "",
);
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.QA_SERVICE_ROLE_KEY;
const targetEmail = (
  env.QA_HISTORY_EMAIL ||
  env.QA_PRO_EMAIL ||
  "qa.history@clarify.ai.test"
).trim();

if (!url || !serviceKey) {
  console.error(
    JSON.stringify({
      ok: false,
      reason: "missing_supabase_env",
      need: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"],
    }),
  );
  process.exit(2);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(email) {
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (profile?.id) return profile.id;

  // Fallback: list users (small QA projects)
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  const user = (data?.users ?? []).find(
    (u) => String(u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  return user?.id ?? null;
}

function sessionRow(userId, id, opts) {
  return {
    id,
    user_id: userId,
    title: opts.title,
    type: opts.type,
    session_type: opts.type,
    status: "completed",
    lifecycle_status: "COMPLETED",
    started_at: opts.startedAt,
    ended_at: opts.endedAt,
    created_at: opts.startedAt,
    updated_at: opts.endedAt,
    duration_seconds: opts.durationSeconds,
    questions_asked: opts.questionsAsked,
    answers_generated: opts.answersGenerated,
    avg_wpm: opts.avgWpm,
    filler_words: opts.fillerWords,
    overall_score: opts.overallScore,
    confidence_score: opts.confidence,
    deleted_at: null,
    notes: "qa-seed-compare",
  };
}

function scorecardRow(userId, sessionId, scores) {
  return {
    user_id: userId,
    session_id: sessionId,
    overall_score: scores.overall,
    communication: scores.communication,
    technical: scores.technical,
    problem_solving: scores.problem_solving,
    confidence: scores.confidence,
    details: {
      filler_rate: scores.filler_rate,
      wpm_avg: scores.wpm_avg,
      company: scores.company,
    },
    generated_at: new Date().toISOString(),
    feedback: "QA seed scorecard",
    strengths: ["Clear structure"],
    improvements: ["Tighten examples"],
    is_shared: false,
  };
}

async function upsertSession(row) {
  const { error } = await admin.from("sessions").upsert(row, { onConflict: "id" });
  if (error) throw new Error(`sessions upsert ${row.id}: ${error.message}`);
}

async function upsertScorecard(row) {
  const { data: existing } = await admin
    .from("scorecards")
    .select("id")
    .eq("session_id", row.session_id)
    .eq("user_id", row.user_id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin.from("scorecards").update(row).eq("id", existing.id);
    if (error) throw new Error(`scorecards update ${row.session_id}: ${error.message}`);
    return existing.id;
  }

  const { data, error } = await admin.from("scorecards").insert(row).select("id").maybeSingle();
  if (error) throw new Error(`scorecards insert ${row.session_id}: ${error.message}`);
  return data?.id ?? null;
}

async function replaceAnswers(userId, sessionId, answers) {
  await admin.from("session_answers").delete().eq("session_id", sessionId).eq("user_id", userId);
  if (!answers.length) return;
  const rows = answers.map((a, i) => ({
    user_id: userId,
    session_id: sessionId,
    question: a.question,
    answer: a.answer,
    question_index: i,
    score: a.score ?? null,
  }));
  const { error } = await admin.from("session_answers").insert(rows);
  if (error) throw new Error(`session_answers ${sessionId}: ${error.message}`);
}

async function main() {
  const userId = await findUserIdByEmail(targetEmail);
  if (!userId) {
    console.error(
      JSON.stringify({
        ok: false,
        reason: "user_not_found",
        email: targetEmail,
        hint: "Run npm run qa:seed-accounts first (or set QA_HISTORY_EMAIL).",
      }),
    );
    process.exit(1);
  }

  const sessionA = sessionRow(userId, SESSION_A_ID, {
    title: "Mock — Acme",
    type: "mock",
    startedAt: "2026-08-20T10:00:00.000Z",
    endedAt: "2026-08-20T10:18:00.000Z",
    durationSeconds: 1080,
    questionsAsked: 4,
    answersGenerated: 4,
    avgWpm: 118,
    fillerWords: 8,
    overallScore: 70,
    confidence: 65,
  });

  const sessionB = sessionRow(userId, SESSION_B_ID, {
    title: "Rehearsal — Globex",
    type: "rehearsal",
    startedAt: "2026-08-22T15:00:00.000Z",
    endedAt: "2026-08-22T15:25:00.000Z",
    durationSeconds: 1500,
    questionsAsked: 5,
    answersGenerated: 5,
    avgWpm: 130,
    fillerWords: 3,
    overallScore: 82,
    confidence: 76,
  });

  const sessionC = sessionRow(userId, SESSION_C_ID, {
    title: "Mock — Unscored Co",
    type: "mock",
    startedAt: "2026-08-23T12:00:00.000Z",
    endedAt: "2026-08-23T12:15:00.000Z",
    durationSeconds: 900,
    questionsAsked: 3,
    answersGenerated: 2,
    avgWpm: null,
    fillerWords: null,
    overallScore: null,
    confidence: null,
  });

  await upsertSession(sessionA);
  await upsertSession(sessionB);
  await upsertSession(sessionC);

  await upsertScorecard(
    scorecardRow(userId, SESSION_A_ID, {
      overall: 70,
      communication: 72,
      technical: 68,
      problem_solving: 71,
      confidence: 65,
      filler_rate: 1.2,
      wpm_avg: 118,
      company: "Acme",
    }),
  );
  await upsertScorecard(
    scorecardRow(userId, SESSION_B_ID, {
      overall: 82,
      communication: 80,
      technical: 74,
      problem_solving: 78,
      confidence: 76,
      filler_rate: 0.4,
      wpm_avg: 130,
      company: "Globex",
    }),
  );

  // Ensure session C has no scorecard (unscored comparable=false).
  await admin.from("scorecards").delete().eq("session_id", SESSION_C_ID).eq("user_id", userId);

  await replaceAnswers(userId, SESSION_A_ID, [
    { question: "Tell me about yourself.", answer: "I am a backend engineer…", score: 70 },
    { question: "Describe a hard bug.", answer: "We fixed a race condition…", score: 72 },
  ]);
  await replaceAnswers(userId, SESSION_B_ID, [
    { question: "System design overview.", answer: "I would start with requirements…", score: 80 },
    { question: "Trade-offs?", answer: "Consistency vs latency…", score: 84 },
  ]);
  await replaceAnswers(userId, SESSION_C_ID, [
    { question: "Warm-up question.", answer: "Partial answer without scorecard.", score: null },
  ]);

  console.log(
    JSON.stringify(
      {
        ok: true,
        email: targetEmail,
        user_id: userId,
        scored: [
          { id: SESSION_A_ID, title: "Mock — Acme", company: "Acme" },
          { id: SESSION_B_ID, title: "Rehearsal — Globex", company: "Globex" },
        ],
        unscored: [{ id: SESSION_C_ID, title: "Mock — Unscored Co" }],
        next: [
          "Sign in as the target user",
          "Open /app/analytics → Compare",
          "Select Acme vs Globex to view deltas",
          "Same session twice should disable Compare",
          "Unscored Co must not appear as comparable",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err?.message ?? String(err) }));
  process.exit(1);
});
