// Admin-only provider diagnostics. JWT required. Never return secret fingerprints.
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import { deepgramKeyLooksValid } from "../_shared/deepgramCost.ts";
import {
  geminiKeyLooksValid,
  probeGeminiApiKey,
  resolveGeminiApiKey,
} from "../_shared/geminiKey.ts";

function present(value: string | undefined) {
  return Boolean((value ?? "").trim());
}

function openAiKeyLooksValid(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(v);
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

  const deepgramKey = (Deno.env.get("DEEPGRAM_API_KEY") ?? "").trim();
  let deepgramApiOk = false;
  if (deepgramKeyLooksValid(deepgramKey)) {
    try {
      const probe = await fetch("https://api.deepgram.com/v1/projects", {
        headers: {
          Authorization: `Token ${deepgramKey}`,
          Accept: "application/json",
        },
      });
      deepgramApiOk = probe.ok;
    } catch {
      deepgramApiOk = false;
    }
  }

  const geminiKey = resolveGeminiApiKey();
  let geminiApiOk = false;
  if (geminiKeyLooksValid(geminiKey)) {
    geminiApiOk = await probeGeminiApiKey(geminiKey);
  }

  const result = {
    providers: {
      gemini: present(geminiKey),
      gemini_format_valid: geminiKeyLooksValid(geminiKey),
      gemini_api_ok: geminiApiOk,
      openai: present(Deno.env.get("OPENAI_API_KEY")),
      openai_format_valid: openAiKeyLooksValid(Deno.env.get("OPENAI_API_KEY")),
      anthropic: present(Deno.env.get("ANTHROPIC_API_KEY")),
      deepgram: present(deepgramKey),
      deepgram_format_valid: deepgramKeyLooksValid(deepgramKey),
      deepgram_api_ok: deepgramApiOk,
      razorpay: present(Deno.env.get("RAZORPAY_KEY_ID")) && present(Deno.env.get("RAZORPAY_KEY_SECRET")),
      resend: present(Deno.env.get("RESEND_API_KEY")),
      hostinger: present(Deno.env.get("HOSTINGER_MAIL_API_TOKEN")),
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
