// Admin-only provider diagnostics. JWT required. Never return secret fingerprints.
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";

function present(value: string | undefined) {
  return Boolean((value ?? "").trim());
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = createServiceClient();
  const rateLimited = await enforceSessionRateLimitAsync(
    db,
    "ai-key-check",
    auth.context.user.id,
  );
  if (rateLimited) return rateLimited;

  const { data: isAdmin } = await db.rpc("is_admin");
  if (!isAdmin) {
    const { data: roleRows } = await db
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.context.user.id)
      .eq("role", "admin")
      .limit(1);
    if (!roleRows?.length) {
      return new Response(JSON.stringify({ error: "admin_required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  await db.from("admin_audit_log").insert({
    admin_id: auth.context.user.id,
    action: "ai_key_check",
    target_type: "provider_diagnostics",
    new_value: { present_only: true },
  }).then(() => {}, () => {});

  const result = {
    providers: {
      gemini: present(Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY")),
      openai: present(Deno.env.get("OPENAI_API_KEY")),
      anthropic: present(Deno.env.get("ANTHROPIC_API_KEY")),
      deepgram: present(Deno.env.get("DEEPGRAM_API_KEY")),
      razorpay: present(Deno.env.get("RAZORPAY_KEY_ID")) && present(Deno.env.get("RAZORPAY_KEY_SECRET")),
      resend: present(Deno.env.get("RESEND_API_KEY")),
    },
  };

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
