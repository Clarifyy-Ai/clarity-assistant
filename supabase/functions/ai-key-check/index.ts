// Admin-only provider diagnostics. JWT required. Never return secret values.
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { enforceSessionRateLimitAsync } from "../_shared/rateLimit.ts";
import { deepgramKeyLooksValid } from "../_shared/deepgramCost.ts";
import { DEFAULT_TEXT_MODEL } from "../_shared/modelCatalog.ts";
import {
  geminiKeyLooksValid,
  probeGeminiApiKeyDetailed,
  resolveGeminiApiKey,
  resolveGeminiProbeModel,
  type GeminiProbeReason,
} from "../_shared/geminiKey.ts";

function present(value: string | undefined) {
  return Boolean((value ?? "").trim());
}

function openAiKeyLooksValid(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return /^sk-[A-Za-z0-9_-]{20,}$/.test(v);
}

function anthropicKeyLooksValid(value: string | undefined): boolean {
  const v = (value ?? "").trim();
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v) || /^sk-ant-api\d{2}-[A-Za-z0-9_-]{20,}$/.test(v);
}

type ProviderLiveStatus = {
  configured: boolean;
  format_valid: boolean;
  authenticated: boolean;
  available: boolean;
  model?: string;
  latency_ms?: number;
  reason?: GeminiProbeReason | "missing" | "invalid_format" | "auth_failed" | "unavailable" | "timeout";
  status_code?: number;
};

async function probeOpenAi(apiKey: string): Promise<ProviderLiveStatus> {
  const model = "gpt-4o-mini";
  if (!apiKey) {
    return { configured: false, format_valid: false, authenticated: false, available: false, reason: "missing", model };
  }
  if (!openAiKeyLooksValid(apiKey)) {
    return {
      configured: true,
      format_valid: false,
      authenticated: false,
      available: false,
      reason: "invalid_format",
      model,
    };
  }
  const start = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const latency_ms = Date.now() - start;
    if (res.ok) {
      return {
        configured: true,
        format_valid: true,
        authenticated: true,
        available: true,
        model,
        latency_ms,
        status_code: res.status,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        configured: true,
        format_valid: true,
        authenticated: false,
        available: false,
        reason: "auth_failed",
        model,
        latency_ms,
        status_code: res.status,
      };
    }
    return {
      configured: true,
      format_valid: true,
      authenticated: false,
      available: false,
      reason: "unavailable",
      model,
      latency_ms,
      status_code: res.status,
    };
  } catch {
    return {
      configured: true,
      format_valid: true,
      authenticated: false,
      available: false,
      reason: "unavailable",
      model,
      latency_ms: Date.now() - start,
    };
  }
}

async function probeAnthropic(apiKey: string): Promise<ProviderLiveStatus> {
  const model = "claude-3-haiku-20240307";
  if (!apiKey) {
    return { configured: false, format_valid: false, authenticated: false, available: false, reason: "missing", model };
  }
  if (!anthropicKeyLooksValid(apiKey)) {
    return {
      configured: true,
      format_valid: false,
      authenticated: false,
      available: false,
      reason: "invalid_format",
      model,
    };
  }
  const start = Date.now();
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    const latency_ms = Date.now() - start;
    if (res.ok) {
      return {
        configured: true,
        format_valid: true,
        authenticated: true,
        available: true,
        model,
        latency_ms,
        status_code: res.status,
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        configured: true,
        format_valid: true,
        authenticated: false,
        available: false,
        reason: "auth_failed",
        model,
        latency_ms,
        status_code: res.status,
      };
    }
    return {
      configured: true,
      format_valid: true,
      authenticated: false,
      available: false,
      reason: "unavailable",
      model,
      latency_ms,
      status_code: res.status,
    };
  } catch {
    return {
      configured: true,
      format_valid: true,
      authenticated: false,
      available: false,
      reason: "unavailable",
      model,
      latency_ms: Date.now() - start,
    };
  }
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
    new_value: { live_probe: true },
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
  const geminiModel = resolveGeminiProbeModel();
  const geminiProbe = await probeGeminiApiKeyDetailed(geminiKey, geminiModel);
  const geminiLive: ProviderLiveStatus = {
    configured: present(geminiKey),
    format_valid: geminiKeyLooksValid(geminiKey),
    authenticated: geminiProbe.ok,
    available: geminiProbe.ok,
    model: geminiProbe.model ?? geminiModel,
    latency_ms: geminiProbe.latencyMs,
    reason: geminiProbe.ok ? undefined : (geminiProbe.reason ?? "unavailable"),
    status_code: geminiProbe.status,
  };

  const openaiLive = await probeOpenAi((Deno.env.get("OPENAI_API_KEY") ?? "").trim());
  const anthropicLive = await probeAnthropic((Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim());

  const result = {
    default_text_model: DEFAULT_TEXT_MODEL,
    providers: {
      // Legacy boolean fields (Admin / scripts)
      gemini: geminiLive.configured,
      gemini_format_valid: geminiLive.format_valid,
      gemini_api_ok: geminiLive.available,
      openai: openaiLive.configured,
      openai_format_valid: openaiLive.format_valid,
      openai_api_ok: openaiLive.available,
      anthropic: anthropicLive.configured,
      anthropic_format_valid: anthropicLive.format_valid,
      anthropic_api_ok: anthropicLive.available,
      deepgram: present(deepgramKey),
      deepgram_format_valid: deepgramKeyLooksValid(deepgramKey),
      deepgram_api_ok: deepgramApiOk,
      razorpay: present(Deno.env.get("RAZORPAY_KEY_ID")) && present(Deno.env.get("RAZORPAY_KEY_SECRET")),
      resend: present(Deno.env.get("RESEND_API_KEY")),
      hostinger: present(Deno.env.get("HOSTINGER_MAIL_API_TOKEN")),
    },
    live: {
      gemini: geminiLive,
      openai: openaiLive,
      anthropic: anthropicLive,
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
