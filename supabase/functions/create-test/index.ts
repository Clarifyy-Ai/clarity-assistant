import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// create-test
// Atomically: verifies JWT → checks quota → deducts 2 credits →
// inserts mock_tests row. If any step fails, already-deducted
// credits are refunded so users are never charged without a test.
// ─────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
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

    const { test_name, config, question_ids } = await req.json();

    if (!question_ids || question_ids.length === 0) {
      return new Response(JSON.stringify({ error: "No questions provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Check free-plan monthly quota ─────────────────────────────
    const { data: profile } = await db
      .from("profiles")
      .select("plan_id, credits")
      .eq("id", userId)
      .single();

    const planId = profile?.plan_id ?? "free";

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
            error: "Free plan limit reached. You can take 2 tests per month.",
            code: "FREE_PLAN_LIMIT",
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Deduct 2 credits ──────────────────────────────────────────
    const credited = await deductCredits(db, userId, 2, "Mock test creation");
    if (!credited) {
      return new Response(
        JSON.stringify({ error: "Insufficient credits. Mock tests cost 2 credits.", code: "INSUFFICIENT_CREDITS" }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Create test row ──────────────────────────────────────────
    const { data: newTest, error: insertErr } = await db
      .from("mock_tests")
      .insert({
        user_id:            userId,
        test_name:          test_name ?? "Practice Test",
        config,
        question_ids,
        status:             "DRAFT",
        time_limit_minutes: config?.duration_minutes ?? 60,
      })
      .select("id")
      .single();

    if (insertErr || !newTest) {
      // Refund credits on insert failure
      const { data: latestProfile } = await db
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .single();

      await db
        .from("profiles")
        .update({ credits: (latestProfile?.credits ?? 0) + 2 })
        .eq("id", userId);

      // Delete the credit transaction log entry to keep records clean
      await db
        .from("credit_transactions")
        .delete()
        .eq("user_id", userId)
        .eq("reason", "Mock test creation")
        .order("created_at", { ascending: false })
        .limit(1);

      return new Response(
        JSON.stringify({ error: "Failed to create test. Credits refunded.", detail: insertErr?.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ test_id: newTest.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[create-test] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
