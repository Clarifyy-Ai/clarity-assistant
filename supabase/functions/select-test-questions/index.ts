import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// select-test-questions
// Verifies JWT, checks free-plan quota and credit balance WITHOUT
// deducting — deduction happens in create-test after questions are
// selected and the test row is committed. Returns question IDs.
//
// Adaptive selection strategy (per topic bucket):
//   1st priority: never-attempted questions (topic not in user_topic_performance)
//   2nd priority (weak): accuracy < 50%, 40% of target
//   3rd priority (medium): 50–80%, 30% of target
//   4th priority (strong): > 80%, 30% of target
//
// If a topic bucket has fewer than 20 questions, lazy-generates via
// generate-practice-questions before the final selection.
// Avoids repeating questions from the last 3 tests.
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert question setter for Indian competitive exams (JEE, NEET, UPSC, SSC).
Generate high-quality, accurate MCQ questions. Always respond with valid JSON only.`;

async function generateThinTopicQuestions(
  db: ReturnType<typeof createServiceClient>,
  topic: string,
  subject: string,
  examType: string | null,
  difficulty: string,
): Promise<void> {
  try {
    const prompt = `Generate exactly 10 multiple-choice questions for:
Topic: ${topic}
Subject: ${subject}
${examType ? `Exam: ${examType}` : ""}
Difficulty: ${difficulty}

Return ONLY valid JSON:
{
  "questions": [
    {
      "question_text": "<question text>",
      "options": [
        {"label": "A", "text": "<option text>"},
        {"label": "B", "text": "<option text>"},
        {"label": "C", "text": "<option text>"},
        {"label": "D", "text": "<option text>"}
      ],
      "correct_answer": "<A|B|C|D>",
      "explanation": "<brief explanation>",
      "difficulty": "<EASY|MEDIUM|HARD>",
      "marks_positive": 4,
      "marks_negative": 1
    }
  ]
}`;

    const raw = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.7, 3000);
    const data = parseJSON(raw, { questions: [] });

    const questions = (data.questions as Array<Record<string, unknown>>).map((q) => ({
      question_text:  q.question_text,
      question_type:  "MCQ",
      options:        q.options,
      correct_answer: q.correct_answer,
      explanation:    q.explanation,
      subject,
      topic,
      difficulty:     q.difficulty ?? difficulty,
      exam_type:      examType,
      source:         "AI_GENERATED",
      marks_positive: q.marks_positive ?? 4,
      marks_negative: q.marks_negative ?? 1,
      is_verified:    false,
      is_public:      true,
      latex_present:  false,
    }));

    if (questions.length > 0) {
      await db.from("questions").insert(questions);
    }
  } catch (err) {
    // Non-blocking: log and continue with existing questions
    console.warn(`[select-test-questions] thin-topic generation failed for "${topic}":`, err);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // ── Verify JWT ────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const db = createServiceClient();

    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = user.id;

    const { config } = await req.json();
    if (!config) {
      return new Response(JSON.stringify({ error: "Missing config" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check free-plan monthly test quota (2 tests/month) ────────
    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, credits")
      .eq("id", userId)
      .single();

    const planId = profile?.plan_id ?? "free";
    const credits = profile?.credits ?? 0;

    if (planId === "free") {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { count: monthlyCount } = await db
        .from("mock_tests")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", startOfMonth.toISOString());

      if ((monthlyCount ?? 0) >= 2) {
        return new Response(
          JSON.stringify({
            error: "Free plan limit reached. You can take 2 tests per month. Upgrade for unlimited access.",
            code: "FREE_PLAN_LIMIT",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Check credit balance (do not deduct yet) ──────────────────
    if (credits < 2) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits. Mock tests cost 2 credits.", code: "INSUFFICIENT_CREDITS" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      exam_type,
      subjects = [],
      topics = [],
      source_types = ["OFFICIAL_PYP", "AI_GENERATED", "USER_UPLOAD"],
      year_range = null,
      question_count = 30,
      difficulty_distribution = { EASY: 30, MEDIUM: 40, HARD: 30 },
    } = config;

    // ── Fetch user topic performance ──────────────────────────────
    const { data: topicPerfData } = await db
      .from("user_topic_performance")
      .select("topic, accuracy, total_attempted")
      .eq("user_id", userId);

    const topicAccuracyMap: Record<string, number> = {};
    const attemptedTopics = new Set<string>();
    for (const tp of (topicPerfData ?? [])) {
      topicAccuracyMap[tp.topic] = tp.accuracy ?? 0;
      if ((tp.total_attempted ?? 0) > 0) attemptedTopics.add(tp.topic);
    }

    // ── Fetch recently used question IDs (last 3 tests) ───────────
    const { data: recentTests } = await db
      .from("mock_tests")
      .select("question_ids")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(3);

    const recentQuestionIds = new Set<string>();
    for (const t of (recentTests ?? [])) {
      for (const qid of (t.question_ids ?? [])) {
        recentQuestionIds.add(qid as string);
      }
    }

    // ── Build question query ──────────────────────────────────────
    let query = db.from("questions").select("id, topic, subject, difficulty, source");

    if (exam_type && exam_type !== "CUSTOM") {
      query = query.eq("exam_type", exam_type);
    }
    if (subjects.length > 0) {
      query = query.in("subject", subjects);
    }
    if (topics.length > 0) {
      query = query.in("topic", topics);
    }
    if (source_types.length > 0) {
      query = query.in("source", source_types);
    }
    if (year_range?.min) {
      query = query.gte("source_year", year_range.min);
    }
    if (year_range?.max) {
      query = query.lte("source_year", year_range.max);
    }
    // If user selected USER_UPLOAD as a source, include their private uploads.
    // Otherwise, only include public questions.
    const includesUserUpload = source_types.includes("USER_UPLOAD");
    if (includesUserUpload) {
      // (is_public=true) OR (source='USER_UPLOAD' AND uploaded_by=userId)
      query = query.or(`is_public.eq.true,and(source.eq.USER_UPLOAD,uploaded_by.eq.${userId})`);
    } else {
      query = query.eq("is_public", true);
    }
    query = query.limit(2000);

    const { data: allQuestions, error: qErr } = await query;

    if (qErr) {
      return new Response(JSON.stringify({ error: "Failed to fetch questions" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let questions = allQuestions ?? [];

    // ── Lazy generation for thin topics (<20 questions) ───────────
    // Group questions by topic, then generate for any thin topic
    const topicQuestionCounts: Record<string, number> = {};
    for (const q of questions) {
      topicQuestionCounts[q.topic] = (topicQuestionCounts[q.topic] ?? 0) + 1;
    }

    // Determine topics in scope (from filter or distinct from results)
    const topicsInScope = topics.length > 0
      ? topics
      : [...new Set(questions.map((q) => q.topic))];

    // Get dominant subject for each thin topic for generation
    const topicSubjectMap: Record<string, string> = {};
    for (const q of questions) {
      if (!topicSubjectMap[q.topic]) topicSubjectMap[q.topic] = q.subject;
    }

    const thinTopics = topicsInScope.filter((t: string) => (topicQuestionCounts[t] ?? 0) < 20);

    if (thinTopics.length > 0 && Deno.env.get("GEMINI_API_KEY")) {
      // Generate concurrently (capped to 5 at a time to avoid rate limits)
      const chunks = [];
      for (let i = 0; i < thinTopics.length; i += 5) chunks.push(thinTopics.slice(i, i + 5));
      for (const chunk of chunks) {
        await Promise.all(
          chunk.map((t: string) =>
            generateThinTopicQuestions(
              db,
              t,
              topicSubjectMap[t] ?? subjects[0] ?? "",
              exam_type ?? null,
              "MEDIUM"
            )
          )
        );
      }

      // Re-query to include newly generated questions
      const { data: refreshed } = await query;
      questions = refreshed ?? questions;
    }

    // ── Classify by difficulty and priority ───────────────────────
    // Priority 1: never-attempted topics (not in user_topic_performance at all)
    // Priority 2–4: weak / medium / strong by accuracy

    const neverAttempted: string[] = [];
    const easyWeak:   string[] = [];
    const easyMed:    string[] = [];
    const easyStrong: string[] = [];
    const medWeak:    string[] = [];
    const medMed:     string[] = [];
    const medStrong:  string[] = [];
    const hardWeak:   string[] = [];
    const hardMed:    string[] = [];
    const hardStrong: string[] = [];

    for (const q of questions) {
      if (recentQuestionIds.has(q.id)) continue;

      const isNeverAttempted = !attemptedTopics.has(q.topic);

      if (isNeverAttempted) {
        neverAttempted.push(q.id);
        continue;
      }

      const acc = topicAccuracyMap[q.topic] ?? 50;
      const isWeak   = acc < 50;
      const isMed    = acc >= 50 && acc <= 80;
      const isStrong = acc > 80;

      if (q.difficulty === "EASY") {
        if (isWeak) easyWeak.push(q.id);
        else if (isMed) easyMed.push(q.id);
        else easyStrong.push(q.id);
      } else if (q.difficulty === "HARD") {
        if (isWeak) hardWeak.push(q.id);
        else if (isMed) hardMed.push(q.id);
        else hardStrong.push(q.id);
      } else {
        if (isWeak) medWeak.push(q.id);
        else if (isMed) medMed.push(q.id);
        else medStrong.push(q.id);
      }
    }

    const shuffle = (arr: string[]): string[] => [...arr].sort(() => Math.random() - 0.5);

    // Calculate targets from difficulty_distribution
    const easyPct   = difficulty_distribution.EASY ?? 30;
    const hardPct   = difficulty_distribution.HARD ?? 30;
    const medPct    = 100 - easyPct - hardPct;
    const easyTarget = Math.round(question_count * easyPct / 100);
    const hardTarget = Math.round(question_count * hardPct / 100);
    const medTarget  = question_count - easyTarget - hardTarget;

    // Reserve ~20% of each difficulty slot for never-attempted questions
    const neverAttemptedShuffled = shuffle(neverAttempted);

    const pickWithNeverAttempted = (
      weak: string[], med: string[], strong: string[], target: number
    ): string[] => {
      if (target <= 0) return [];
      const naSlots = Math.min(Math.round(target * 0.2), neverAttemptedShuffled.length);
      const naSelected = neverAttemptedShuffled.splice(0, naSlots);
      const remaining  = target - naSelected.length;
      const wantWeak   = Math.round(remaining * 0.4);
      const wantMed    = Math.round(remaining * 0.3);
      const wantStrong = remaining - wantWeak - wantMed;

      const selected = [...naSelected];
      const take = (arr: string[], n: number): number => {
        const taken = shuffle(arr).slice(0, n);
        selected.push(...taken);
        return n - taken.length;
      };

      let leftover  = take(weak, wantWeak);
      leftover += take(med, wantMed + leftover);
      take(strong, wantStrong + leftover);

      if (selected.length < target) {
        const usedSet = new Set(selected);
        const rest = shuffle([...weak, ...med, ...strong].filter((id) => !usedSet.has(id)));
        selected.push(...rest.slice(0, target - selected.length));
      }
      return selected.slice(0, target);
    };

    const easySelected   = pickWithNeverAttempted(easyWeak, easyMed, easyStrong, easyTarget);
    const mediumSelected = pickWithNeverAttempted(medWeak, medMed, medStrong, medTarget);
    const hardSelected   = pickWithNeverAttempted(hardWeak, hardMed, hardStrong, hardTarget);

    let finalIds = [...easySelected, ...mediumSelected, ...hardSelected];

    // Fill shortfall from remaining never-attempted or any remaining
    if (finalIds.length < question_count) {
      const usedSet = new Set(finalIds);
      const restNA = neverAttemptedShuffled.filter((id) => !usedSet.has(id));
      finalIds.push(...restNA.slice(0, question_count - finalIds.length));

      if (finalIds.length < question_count) {
        const usedSet2 = new Set(finalIds);
        const rest = shuffle(
          questions.map((q) => q.id).filter((id) => !usedSet2.has(id) && !recentQuestionIds.has(id))
        );
        finalIds.push(...rest.slice(0, question_count - finalIds.length));
      }
    }

    shuffle(finalIds);
    finalIds = finalIds.slice(0, question_count);

    return new Response(
      JSON.stringify({ question_ids: finalIds, count: finalIds.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[select-test-questions] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
