// create-test/index.ts — Creates a mock test from config

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    /* ── AUTH ── */
    const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── PARSE BODY ── */
    const body = await req.json().catch(() => null);
    if (!body) {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      test_name = "Mock Test",
      exam_type = "CUSTOM",
      subjects = [],
      difficulty_level = "INTERMEDIATE",
      question_count = 30,
      time_limit_minutes = 60,
      shuffle_questions = true,
      shuffle_options = true,
      difficulty_distribution = { easy: 20, medium: 60, hard: 20 },
      question_ids = [],
    } = body;

    const safeTestName = String(test_name).slice(0, 200);
    const safeCount = Math.min(Math.max(Number(question_count) || 30, 1), 200);
    const safeTime = Math.min(Math.max(Number(time_limit_minutes) || 60, 0), 360);

    /* ── SELECT QUESTIONS ── */
    let selectedIds: string[] = [];

    if (Array.isArray(question_ids) && question_ids.length > 0) {
      // Use provided question IDs directly
      selectedIds = question_ids.map(String).slice(0, safeCount);
    } else {
      // Query questions from the bank
      let query = db.from("questions").select("id, difficulty, subject");

      if (Array.isArray(subjects) && subjects.length > 0) {
        query = query.in("subject", subjects);
      }
      if (exam_type && exam_type !== "CUSTOM") {
        query = query.eq("exam_type", exam_type);
      }

      const { data: allQuestions, error: qErr } = await query.limit(1000);

      if (qErr) {
        return new Response(JSON.stringify({ error: "Failed to fetch questions" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!allQuestions || allQuestions.length === 0) {
        return new Response(JSON.stringify({ error: "No questions found matching criteria" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Split by difficulty
      const easy = allQuestions.filter((q: any) => q.difficulty === "EASY");
      const medium = allQuestions.filter((q: any) => q.difficulty === "MEDIUM");
      const hard = allQuestions.filter((q: any) => q.difficulty === "HARD");

      const dist = difficulty_distribution || { easy: 20, medium: 60, hard: 20 };
      const total = (dist.easy || 0) + (dist.medium || 0) + (dist.hard || 0);
      const easyPct = total > 0 ? (dist.easy || 0) / total : 0.33;
      const medPct = total > 0 ? (dist.medium || 0) / total : 0.34;
      const hardPct = total > 0 ? (dist.hard || 0) / total : 0.33;

      const easyCount = Math.round(safeCount * easyPct);
      const hardCount = Math.round(safeCount * hardPct);
      const medCount = safeCount - easyCount - hardCount;

      const pick = (arr: any[], n: number) => {
        const shuffled = [...arr].sort(() => Math.random() - 0.5);
        return shuffled.slice(0, n);
      };

      const picked = [
        ...pick(easy, easyCount),
        ...pick(medium, medCount),
        ...pick(hard, hardCount),
      ];

      // If not enough from difficulty pools, fill from remaining
      if (picked.length < safeCount) {
        const pickedSet = new Set(picked.map((q: any) => q.id));
        const remaining = allQuestions.filter((q: any) => !pickedSet.has(q.id));
        const fill = pick(remaining, safeCount - picked.length);
        picked.push(...fill);
      }

      // Shuffle final order
      if (shuffle_questions) {
        picked.sort(() => Math.random() - 0.5);
      }

      selectedIds = picked.map((q: any) => q.id);
    }

    if (selectedIds.length === 0) {
      return new Response(JSON.stringify({ error: "Could not select any questions" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    /* ── CREATE TEST ── */
    const config = {
      exam_type,
      subjects,
      difficulty_level,
      shuffle_questions,
      shuffle_options,
      difficulty_distribution,
    };

    const { data: test, error: insertErr } = await db
      .from("mock_tests")
      .insert({
        user_id: user.id,
        test_name: safeTestName,
        question_ids: selectedIds,
        time_limit_minutes: safeTime || null,
        config,
        status: "created",
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[create-test] Insert error:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to create test" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ test, question_count: selectedIds.length }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[create-test] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
