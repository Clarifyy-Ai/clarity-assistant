import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// ─────────────────────────────────────────────────────────────────
// create-test
// Calls the create_test_atomic DB function which runs the entire
// quota-check + credit-deduction + test-insert in ONE transaction.
// This prevents any race condition or partial-billing scenario.
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

    const body = await req.json() as {
      test_name?: string;
      config?: { duration_minutes?: number; [key: string]: unknown };
      question_ids?: string[];
    };
    const { test_name, config, question_ids } = body;

    if (!question_ids || question_ids.length === 0) {
      return new Response(JSON.stringify({ error: "No questions provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const timeLimitMinutes = config?.duration_minutes ?? 60;

    // ── Single atomic RPC call: quota check + deduct + insert ─────
    const { data: rpcResult, error: rpcErr } = await db.rpc("create_test_atomic", {
      p_user_id:      userId,
      p_test_name:    test_name ?? "Practice Test",
      p_config:       config ?? {},
      p_question_ids: question_ids,
      p_time_limit:   timeLimitMinutes,
      p_credit_cost:  2,
    });

    if (rpcErr) {
      console.error("[create-test] RPC error:", rpcErr);
      return new Response(
        JSON.stringify({ error: "Failed to create test", detail: rpcErr.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = rpcResult as { error?: string; code?: string; test_id?: string };

    if (result.error) {
      const statusCode = result.code === "FREE_PLAN_LIMIT" || result.code === "INSUFFICIENT_CREDITS"
        ? 402 : 500;
      return new Response(
        JSON.stringify({ error: result.error, code: result.code }),
        { status: statusCode, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!result.test_id) {
      return new Response(
        JSON.stringify({ error: "Test creation failed: no ID returned" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ test_id: result.test_id }),
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
