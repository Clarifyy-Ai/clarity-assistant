// Temporary diagnostics — status codes / fingerprints only, never full secrets.
import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";

function fingerprint(value: string | undefined) {
  const v = (value ?? "").trim();
  if (!v) return { present: false, length: 0, prefix: "", suffix: "" };
  return {
    present: true,
    length: v.length,
    prefix: v.slice(0, 8),
    suffix: v.slice(-4),
  };
}

async function probeGeminiModel(key: string, model: string) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": key,
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "Reply with OK" }] }],
      generationConfig: { maxOutputTokens: 8, temperature: 0 },
    }),
  });
  const text = await res.text();
  return {
    model,
    ok: res.ok,
    status: res.status,
    error: res.ok ? null : text.slice(0, 280).replace(/\s+/g, " "),
  };
}

async function probeOpenAIModel(key: string, model: string) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with OK" }],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  const text = await res.text();
  return {
    model,
    ok: res.ok,
    status: res.status,
    error: res.ok ? null : text.slice(0, 280).replace(/\s+/g, " "),
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = createServiceClient();
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

  const gemini = Deno.env.get("GEMINI_API_KEY") ?? "";
  const openai = Deno.env.get("OPENAI_API_KEY") ?? "";
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const deepgram = Deno.env.get("DEEPGRAM_API_KEY") ?? "";

  const geminiModels = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ];
  const openaiModels = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];

  const geminiProbes = [];
  for (const model of geminiModels) {
    if (!gemini) {
      geminiProbes.push({ model, ok: false, status: 0, error: "missing_key" });
      continue;
    }
    geminiProbes.push(await probeGeminiModel(gemini, model));
  }

  const openaiList = openai
    ? await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${openai}` },
    })
    : null;
  const openaiListStatus = openaiList?.status ?? 0;
  const openaiListBody = openaiList
    ? (await openaiList.text()).slice(0, 120).replace(/\s+/g, " ")
    : "missing_key";

  const openaiProbes = [];
  for (const model of openaiModels) {
    if (!openai) {
      openaiProbes.push({ model, ok: false, status: 0, error: "missing_key" });
      continue;
    }
    openaiProbes.push(await probeOpenAIModel(openai, model));
  }

  let deepgramOk = false;
  let deepgramStatus = 0;
  if (deepgram) {
    const dg = await fetch("https://api.deepgram.com/v1/projects", {
      headers: { Authorization: `Token ${deepgram}` },
    });
    deepgramOk = dg.ok;
    deepgramStatus = dg.status;
  }

  const result = {
    note:
      "Compare fingerprints with the keys in your working app. If prefixes differ, Clarify is using different keys.",
    secrets: {
      GEMINI_API_KEY: fingerprint(gemini),
      OPENAI_API_KEY: fingerprint(openai),
      ANTHROPIC_API_KEY: fingerprint(anthropic),
      DEEPGRAM_API_KEY: fingerprint(deepgram),
      STRIPE_SECRET_KEY: fingerprint(Deno.env.get("STRIPE_SECRET_KEY")),
      RESEND_API_KEY: fingerprint(Deno.env.get("RESEND_API_KEY")),
    },
    probes: {
      gemini: geminiProbes,
      openai_list: {
        ok: openaiListStatus === 200,
        status: openaiListStatus,
        body: openaiListBody,
      },
      openai_chat: openaiProbes,
      deepgram: { ok: deepgramOk, status: deepgramStatus },
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
