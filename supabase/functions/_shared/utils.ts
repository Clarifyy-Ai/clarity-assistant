// supabase/functions/_shared/utils.ts — FIXED + PRODUCTION READY// supabase/functions// - Updates Gemini provider mapping to 2.5 family (recommended) 【1-c30e89】
// - Uses x-goog-api-key header for Gemini auth 【2-a9b3ed】
// - Supports GEMINI_API_VERSION v1 (stable) / v1beta 【3-96ce52】
// - Joins Gemini parts reliably

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors as _handleCorsFn } from "./cors.ts";

import type {
  AuthContext, EdgeSuccess,
  AICompletionRequest, AICompletionResponse,
  CreditDeductionResult, FeatureKey,
  ValidationResult, ValidationError
} from "./types.ts";
import { CREDIT_COSTS } from "./types.ts";

/* -------------------------------------------------------------------------- */
/*                              CORS SAFE HEADERS                              */
/* -------------------------------------------------------------------------- */

function safeCorsHeaders(req?: Request): Record<string, string> {
  if (req) return getCorsHeaders(req);
  return {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-app-name, x-app-version, x-byok-openai, x-byok-anthropic, x-byok-gemini",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

/* -------------------------------------------------------------------------- */
/*                              ENVIRONMENT                                    */
/* -------------------------------------------------------------------------- */

const REQUIRED = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;

for (const key of REQUIRED) {
  if (!Deno.env.get(key)) {
    console.error(
      `[utils] CRITICAL: Missing required env var "${key}". ` +
      `Set in Supabase Dashboard → Settings → Edge Functions → Secrets and redeploy.`
    );
  }
}

export const ENV = {
  SUPABASE_URL:         Deno.env.get("SUPABASE_URL") ?? "",
  SUPABASE_ANON_KEY:    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  SUPABASE_SERVICE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  OPENAI_API_KEY:       Deno.env.get("OPENAI_API_KEY") ?? "",
  ANTHROPIC_API_KEY:    Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  GEMINI_API_KEY:       Deno.env.get("GEMINI_API_KEY") ?? "",
  GEMINI_API_VERSION:   Deno.env.get("GEMINI_API_VERSION") ?? "v1beta", // set "v1" for stable 【3-96ce52】
  RESEND_API_KEY:       Deno.env.get("RESEND_API_KEY") ?? "",
};

/* -------------------------------------------------------------------------- */
/*                         SUPABASE ADMIN CLIENT (RLS BYPASS)                  */
/* -------------------------------------------------------------------------- */

export function getAdminClient(): SupabaseClient {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_SERVICE_KEY) {
    throw new Error("[utils] Cannot create admin client: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });
}

/* -------------------------------------------------------------------------- */
/*                         AUTH + BYOK EXTRACTION                              */
/* -------------------------------------------------------------------------- */

export interface BYOK {
  openai?: string;
  anthropic?: string;
  gemini?: string;
}

export function extractBYOK(req: Request): BYOK {
  const out: BYOK = {};
  const o = req.headers.get("x-byok-openai");
  const a = req.headers.get("x-byok-anthropic");
  const g = req.headers.get("x-byok-gemini");
  if (o && o.trim()) out.openai = o.trim();
  if (a && a.trim()) out.anthropic = a.trim();
  if (g && g.trim()) out.gemini = g.trim();
  return out;
}

export async function requireAuth(req: Request): Promise<AuthContext & { byok: BYOK }> {
  if (!ENV.SUPABASE_URL || !ENV.SUPABASE_ANON_KEY) {
    throw errorResponse(
      "Server misconfiguration: missing Supabase credentials.",
      "INTERNAL_ERROR",
      500,
      req
    );
  }

  const header = req.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw errorResponse("Missing or invalid Authorization header", "AUTH_REQUIRED", 401, req);
  }

  const token = header.slice(7);

  const client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false }
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    throw errorResponse("Invalid or expired token", "AUTH_INVALID", 401, req);
  }

  const admin = getAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("plan_id, credits")
    .eq("id", user.id)
    .maybeSingle();

  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    planId: profile?.plan_id ?? "free",
    credits: profile?.credits ?? 0,
    isAdmin: !!roleRow,
    byok: extractBYOK(req),
  };
}

/* -------------------------------------------------------------------------- */
/*                            RESPONSE HELPERS                                 */
/* -------------------------------------------------------------------------- */

export function successResponse<T>(
  data: T,
  meta?: EdgeSuccess<T>["meta"],
  status = 200,
  req?: Request
): Response {
  return new Response(JSON.stringify({ success: true, data, ...(meta ? { meta } : {}) }), {
    status,
    headers: { ...safeCorsHeaders(req), "Content-Type": "application/json" }
  });
}

export function errorResponse(
  message: string,
  code = "INTERNAL_ERROR",
  status = 500,
  req?: Request
): Response {
  return new Response(JSON.stringify({ success: false, error: message, code }), {
    status,
    headers: { ...safeCorsHeaders(req), "Content-Type": "application/json" }
  });
}

export function streamResponse(stream: ReadableStream, req?: Request): Response {
  return new Response(stream, {
    headers: {
      ...safeCorsHeaders(req),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

/* -------------------------------------------------------------------------- */
/*                              JSON BODY PARSER                               */
/* -------------------------------------------------------------------------- */

export async function parseBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return await req.json() as T;
  } catch {
    throw errorResponse("Invalid JSON body", "INVALID_BODY", 400, req);
  }
}

/* -------------------------------------------------------------------------- */
/*                              CORS HANDLER                                   */
/* -------------------------------------------------------------------------- */

export function handleCors(req: Request): Response | null {
  return _handleCorsFn(req);
}

/* -------------------------------------------------------------------------- */
/*                             VALIDATION UTILITIES                            */
/* -------------------------------------------------------------------------- */

export function validate(
  rules: { condition: boolean; field: string; message: string }[]
): ValidationResult {
  const errors: ValidationError[] = rules
    .filter(r => r.condition)
    .map(r => ({ field: r.field, message: r.message }));
  return { valid: errors.length === 0, errors };
}

export function requireFields(body: Record<string, unknown>, fields: string[]): ValidationResult {
  return validate(fields.map(f => ({
    condition:
      body[f] === undefined ||
      (typeof body[f] === "string" && !String(body[f]).trim()),
    field: f,
    message: `${f} is required.`
  })));
}

/* -------------------------------------------------------------------------- */
/*                      ATOMIC CREDIT DEDUCTION (RPC + FALLBACK)               */
/* -------------------------------------------------------------------------- */

export async function deductCredits(
  userId: string,
  feature: FeatureKey,
  overrideCost?: number
): Promise<CreditDeductionResult> {
  const admin = getAdminClient();
  const cost = overrideCost ?? CREDIT_COSTS[feature] ?? 1;

  // 1) Try atomic RPC (if installed)
  const { data: rpcData, error: rpcError } = await admin.rpc(
    "deduct_credits_atomic",
    { p_user_id: userId, p_amount: cost, p_action: feature }
  );

  if (rpcError) {
    // RPC missing or failed: fall back (keep behavior consistent)
    console.warn("[credits] deduct_credits_atomic RPC failed, falling back:", rpcError.message);
  }

  if (rpcData?.success) {
    return { success: true, balanceAfter: rpcData.balance_after ?? -1 };
  }

  // 2) Fallback (safe but not fully atomic)
  const { data: profile } = await admin
    .from("profiles")
    .select("credits, plan_id, credits_used_this_month")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return { success: false, balanceAfter: 0, error: "Profile not found" };

  const { credits, plan_id, credits_used_this_month } = profile;

  if (credits === -1 || plan_id === "enterprise") {
    return { success: true, balanceAfter: -1 };
  }

  if ((credits ?? 0) < cost) {
    return { success: false, balanceAfter: credits ?? 0, error: "Insufficient credits" };
  }

  const newBal = (credits ?? 0) - cost;

  const { error: updateErr } = await admin
    .from("profiles")
    .update({
      credits: newBal,
      credits_used_this_month: (credits_used_this_month ?? 0) + cost,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (updateErr) {
    return { success: false, balanceAfter: credits ?? 0, error: "Failed to deduct credits" };
  }

  await admin.from("credit_transactions").insert({
    user_id: userId,
    amount: -cost,
    balance_after: newBal,
    action: feature,
    description: `${feature} — ${cost} credit${cost !== 1 ? "s" : ""}`,
    created_at: new Date().toISOString()
  });

  return { success: true, balanceAfter: newBal };
}

/* -------------------------------------------------------------------------- */
/*                         AI DISPATCHER — OpenAI / Anthropic / Gemini         */
/* -------------------------------------------------------------------------- */

// Updated provider map with modern Gemini 2.5 models (recommended) 【1-c30e89】
const PROVIDER_MAP: Record<string, "openai" | "anthropic" | "gemini"> = {
  // OpenAI
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4-turbo": "openai",

  // Anthropic
  "claude-3-5-sonnet-20241022": "anthropic",
  "claude-3-haiku-20240307": "anthropic",

  // Gemini (modern + legacy)
  "gemini-2.5-flash": "gemini",
  "gemini-2.5-pro": "gemini",
  "gemini-2.5-flash-lite": "gemini",
  "gemini-2.0-flash": "gemini",
  "gemini-1.5-flash": "gemini",
  "gemini-1.5-pro": "gemini",
};

export async function callAI(
  req: AICompletionRequest,
  byok?: BYOK,
): Promise<AICompletionResponse> {
  const start = Date.now();
  const provider = PROVIDER_MAP[req.model];

  if (provider === "openai") return callOpenAI(req, start, byok?.openai);
  if (provider === "anthropic") return callAnthropic(req, start, byok?.anthropic);
  if (provider === "gemini") return callGemini(req, start, byok?.gemini);

  throw new Error(
    `Unknown model provider for "${req.model}". Add it to PROVIDER_MAP in utils.ts.`
  );
}

const AI_TIMEOUT_MS = 50_000;

/* ------------------------------- OpenAI ----------------------------------- */

async function callOpenAI(
  req: AICompletionRequest,
  start: number,
  byokKey?: string,
): Promise<AICompletionResponse> {
  const apiKey = byokKey?.trim() || ENV.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI API key not available. Set OPENAI_API_KEY or provide x-byok-openai.");
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages,
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.7,
        stream: req.stream ?? false
      })
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown OpenAI error");
    throw new Error(`OpenAI error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const choice = json.choices?.[0];
  const text = choice?.message?.content ?? "";
  const usage = json.usage ?? {};

  return {
    text,
    model: req.model,
    tokensIn: usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
    latencyMs: Date.now() - start
  };
}

/* ------------------------------ Anthropic --------------------------------- */

async function callAnthropic(
  req: AICompletionRequest,
  start: number,
  byokKey?: string,
): Promise<AICompletionResponse> {
  const apiKey = byokKey?.trim() || ENV.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key not available. Set ANTHROPIC_API_KEY or provide x-byok-anthropic.");
  }

  const system = req.messages.find(m => m.role === "system")?.content ?? "";
  const userMessages = req.messages.filter(m => m.role !== "system");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? 1024,
        system,
        messages: userMessages
      })
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown Anthropic error");
    throw new Error(`Anthropic error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const content = json.content?.[0]?.text ?? "";
  const usage = json.usage ?? {};

  return {
    text: content,
    model: req.model,
    tokensIn: usage.input_tokens ?? 0,
    tokensOut: usage.output_tokens ?? 0,
    totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
    latencyMs: Date.now() - start
  };
}

/* -------------------------------- Gemini ---------------------------------- */

function extractGeminiText(json: any): string {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  if (!Array.isArray(parts)) return "";
  return parts.map((p: any) => p?.text ?? "").join("");
}

async function callGemini(
  req: AICompletionRequest,
  start: number,
  byokKey?: string,
): Promise<AICompletionResponse> {
  const apiKey = byokKey?.trim() || ENV.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key not available. Set GEMINI_API_KEY or provide x-byok-gemini.");
  }

  const base = `https://generativelanguage.googleapis.com/${ENV.GEMINI_API_VERSION}`;

  // Convert OpenAI-style messages to Gemini contents.
  // Gemini supports "user" and "model" roles; keep system separate.
  const system = req.messages.filter(m => m.role === "system").map(m => ({ text: m.content }));
  const contents = req.messages
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: req.maxTokens ?? 1024,
      temperature: req.temperature ?? 0.7
    }
  };

  if (system.length > 0) {
    body.systemInstruction = { parts: system };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    // Use header-based key auth (recommended in streaming examples too) 【2-a9b3ed】
    res = await fetch(`${base}/models/${req.model}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body)
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown Gemini error");
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const text = extractGeminiText(json);
  const usage = json.usageMetadata ?? {};

  return {
    text,
    model: req.model,
    tokensIn: usage.promptTokenCount ?? 0,
    tokensOut: usage.candidatesTokenCount ?? 0,
    totalTokens: usage.totalTokenCount ?? 0,
    latencyMs: Date.now() - start
  };
}

/* -------------------------------------------------------------------------- */
/*                                  LOGGING                                   */
/* -------------------------------------------------------------------------- */

export function log(
  fn: string,
  level: "info" | "warn" | "error",
  message: string,
  data?: unknown
): void {
  const entry = { fn, level, message, data, ts: new Date().toISOString() };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

/* -------------------------------------------------------------------------- */
/*                            SIMPLE RATE LIMIT (PER INSTANCE)                 */
/* -------------------------------------------------------------------------- */

const RL = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, perMinute: number): boolean {
  const now = Date.now();
  const row = RL.get(key);

  if (!row || now > row.resetAt) {
    RL.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (row.count >= perMinute) return false;
  row.count++;
  return true;
}

/* -------------------------------------------------------------------------- */
/*                               TEXT UTILITIES                                */
/* -------------------------------------------------------------------------- */

export function trimToMaxTokens(text: string, max = 12_000): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n\n[truncated]";
}

export function buildSystemPrompt(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}
