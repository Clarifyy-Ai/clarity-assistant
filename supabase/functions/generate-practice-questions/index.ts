import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";
import { requirePlan } from "../_shared/requirePlan.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { mapExamType } from "../_shared/examTypeMap.ts";
import {
  buildPracticeBatchPrompt,
  type WeakTopicStat,
} from "../_shared/examAIPrompts.ts";

const SYSTEM_PROMPT = `
You are an expert Indian competitive exam MCQ author.
Create syllabus-aligned, error-free MCQs matching official exam patterns.
Always return strictly valid JSON.
`;

function sanitize(str: string): string {
  return String(str)
    .replace(/[^\w\s.,()+\-\/]/g, "")
    .slice(0, 120);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;
    const db = createServiceClient();

    const { data: profile } = await db
      .from("profiles")
      .select("plan_id")
      .eq("id", user.id)
      .single();

    const planGate = requirePlan(profile?.plan_id, "pro", req);
    if (planGate) return planGate;

    const capabilityGate = requireCapabilityForFunction(
      profile?.plan_id,
      "generate-practice-questions",
      req,
    );
    if (capabilityGate) return capabilityGate;

    const body = await req.json().catch(() => null);
    const rawTopic = sanitize(body?.topic ?? "");
    const rawSubject = sanitize(body?.subject ?? "");
    const rawExamType = mapExamType(sanitize(body?.exam_type ?? ""));
    const difficulty = sanitize(body?.difficulty ?? "MEDIUM");

    if (!rawTopic || !rawSubject) {
      return new Response(
        JSON.stringify({ error: "Missing valid topic or subject" }),
        { status: 400, headers: getCorsHeaders(req) },
      );
    }

    const credit = await deductCredits(
      user.id,
      "generate_practice_questions",
      creditCost("generate_practice_questions"),
    );
    if (!credit.success) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits" }),
        { status: 402, headers: getCorsHeaders(req) },
      );
    }

    const { count } = await db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("topic", rawTopic)
      .eq("subject", rawSubject)
      .eq("is_public", true);

    if ((count ?? 0) >= 20) {
      return new Response(
        JSON.stringify({
          success: true,
          generated: 0,
          message: "Topic already has sufficient questions",
        }),
        { headers: getCorsHeaders(req) },
      );
    }

    let perfQuery = db
      .from("user_topic_performance")
      .select("topic, subject, accuracy")
      .eq("user_id", user.id)
      .lt("accuracy", 60)
      .order("accuracy", { ascending: true })
      .limit(10);

    if (rawExamType) {
      perfQuery = perfQuery.eq("exam_type", rawExamType);
    }

    const { data: perfRows } = await perfQuery;
    const weakTopics: WeakTopicStat[] = (perfRows ?? []).map((row) => ({
      topic: row.topic as string,
      subject: (row.subject as string) ?? undefined,
      accuracy: Math.round((row.accuracy as number) ?? 0),
    }));

    const prompt = buildPracticeBatchPrompt({
      examType: rawExamType || "General",
      subject: rawSubject,
      topic: rawTopic,
      difficulty,
      weakTopics,
      count: 10,
    });

    let raw: string;
    try {
      raw = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.7, 3000);
    } catch (genErr) {
      console.error("[generate-practice-questions] Gemini failed:", genErr);
      try {
        await deductCredits(user.id, "refund_practice_questions", -creditCost("generate_practice_questions"));
      } catch (refundErr) {
        console.error("[generate-practice-questions] Refund failed:", refundErr);
      }
      return new Response(
        JSON.stringify({ error: "AI service unavailable. Your credits have been refunded." }),
        { status: 502, headers: getCorsHeaders(req) },
      );
    }
    const generated = parseJSON(raw, { questions: [] });

    if (!Array.isArray(generated.questions) || generated.questions.length === 0) {
      try {
        await deductCredits(user.id, "refund_practice_questions", -creditCost("generate_practice_questions"));
      } catch (refundErr) {
        console.error("[generate-practice-questions] Refund failed:", refundErr);
      }
      return new Response(
        JSON.stringify({ error: "AI failed to generate questions. Your credits have been refunded." }),
        { status: 500, headers: getCorsHeaders(req) },
      );
    }

    const systemUserId = Deno.env.get("SYSTEM_USER_ID") ?? null;

    const cleaned = generated.questions
      .filter((q: Record<string, unknown>) =>
        q?.question_text &&
        Array.isArray(q?.options) &&
        (q.options as unknown[]).length === 4 &&
        /^[A-D]$/.test(String(q.correct_answer)),
      )
      .map((q: Record<string, unknown>) => ({
        question_text: String(q.question_text).slice(0, 500),
        question_type: "MCQ",
        options: (q.options as Array<{ label: string; text: string }>).map((opt) => ({
          label: opt.label,
          text: String(opt.text).slice(0, 200),
        })),
        correct_answer: q.correct_answer,
        explanation: String(q.explanation || "").slice(0, 500),
        subject: rawSubject,
        topic: rawTopic,
        difficulty: q.difficulty || difficulty,
        exam_type: rawExamType || null,
        source: "AI_GENERATED",
        marks_positive: q.marks_positive ?? 4,
        marks_negative: q.marks_negative ?? 1,
        is_verified: false,
        is_public: false,
        uploaded_by: systemUserId,
        latex_present: /[=+\-*/]/.test(String(q.question_text)),
      }));

    if (cleaned.length === 0) {
      return new Response(
        JSON.stringify({ error: "Validation failed: No valid questions" }),
        { status: 500, headers: getCorsHeaders(req) },
      );
    }

    const seen = new Set<string>();
    const inBatchUnique = cleaned.filter((q: { question_text: string }) => {
      const key = String(q.question_text).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const { data: existingRows } = await db
      .from("questions")
      .select("question_text")
      .eq("subject", rawSubject)
      .in(
        "question_text",
        inBatchUnique.map((q: { question_text: string }) => q.question_text),
      );

    const existingSet = new Set(
      (existingRows ?? []).map((r: { question_text: string }) =>
        String(r.question_text).trim().toLowerCase(),
      ),
    );

    const finalRows = inBatchUnique.filter(
      (q: { question_text: string }) =>
        !existingSet.has(String(q.question_text).trim().toLowerCase()),
    );

    if (finalRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          generated: 0,
          duplicates_skipped: cleaned.length,
          message: "All generated questions were duplicates of existing questions",
        }),
        { headers: getCorsHeaders(req) },
      );
    }

    const { error: insertErr } = await db.from("questions").insert(finalRows);
    if (insertErr) {
      console.error("[generate-practice-questions] DB insert error:", insertErr);
      return new Response(
        JSON.stringify({ error: "Failed to save questions" }),
        { status: 500, headers: getCorsHeaders(req) },
      );
    }

    return new Response(
      JSON.stringify({ success: true, generated: finalRows.length }),
      { headers: getCorsHeaders(req) },
    );
  } catch (err) {
    console.error("[generate-practice-questions] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
});
