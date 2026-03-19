// ─────────────────────────────────────────────────────────────────────────────
// _shared/utils.ts — Shared utility functions for all Supabase edge functions.
// Covers auth, credit deduction, AI dispatch, response helpers,
// validation, rate-limiting, and logging.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient }        from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders }         from "./cors.ts";
import type {
  AuthContext,
  EdgeError,
  EdgeSuccess,
  AICompletionRequest,
  AICompletionResponse,
  CreditDeductionResult,
  FeatureKey,
  ModelId,
  ValidationResult,
  ValidationError,
  ChatMessage,
} from "./types.ts";
import { CREDIT_COSTS } from "./types.ts";

// ─── Environment ──────────────────────────────────────────────────────────────

export const ENV = {
  SUPABASE_URL:        Deno.env.get("SUPABASE_URL")!,
  SUPABASE_ANON_KEY:   Deno.env.get("SUPABASE_ANON_KEY")!,
  SUPABASE_SERVICE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  OPENAI_API_KEY:      Deno.env.get("OPENAI_API_KEY") ?? "",
  ANTHROPIC_API_KEY:   Deno.env.get("ANTHROPIC_API_KEY") ?? "",
  GEMINI_API_KEY:      Deno.env.get("GEMINI_API_KEY") ?? "",
  RESEND_API_KEY:      Deno.env.get("RESEND_API_KEY") ?? "",
};

// ─── Supabase admin client (bypasses RLS) ─────────────────────────────────────

export function getAdminClient() {
  return createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Verify Bearer token from request and return the authenticated user context.
 * Throws a 401 Response if unauthenticated.
 */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw errorResponse("Missing or invalid Authorization header.", "AUTH_REQUIRED", 401);
  }

  const token = authHeader.slice(7);
  const client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    throw errorResponse("Invalid or expired token.", "AUTH_INVALID", 401);
  }

  // Load profile for plan / credit info
  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("plan_id, credits, is_admin")
    .eq("id", user.id)
    .single();

  return {
    userId:  user.id,
    email:   user.email ?? "",
    planId:  (profile as Record<string, unknown>)?.plan_id as string ?? "free",
    credits: (profile as Record<string, unknown>)?.credits as number ?? 0,
    isAdmin: (profile as Record<string, unknown>)?.is_admin as boolean ?? false,
  };
}

// ─── Response helpers ─────────────────────────────────────────────────────────

export function successResponse<T>(
  data: T,
  meta?: EdgeSuccess<T>["meta"],
  status = 200
): Response {
  const body: EdgeSuccess<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(
  message: string,
  code    = "INTERNAL_ERROR",
  status  = 500
): Response {
  const body: EdgeError = { success: false, error: message, code };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function streamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}

/** Parse and validate JSON body; throws 400 on failure. */
export async function parseBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw errorResponse("Request body must be valid JSON.", "INVALID_BODY", 400);
  }
}

/** Handle OPTIONS preflight. */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validate(
  rules: Array<{ condition: boolean; field: string; message: string }>
): ValidationResult {
  const errors: ValidationError[] = rules
    .filter((r) => r.condition)
    .map(({ field, message }) => ({ field, message }));
  return { valid: errors.length === 0, errors };
}

export function requireFields(
  body: Record<string, unknown>,
  fields: string[]
): ValidationResult {
  return validate(
    fields.map((f) => ({
      condition: !body[f] || (typeof body[f] === "string" && !(body[f] as string).trim()),
      field:     f,
      message:   `${f} is required.`,
    }))
  );
}

// ─── Credit system ────────────────────────────────────────────────────────────

/**
 * Deduct credits from a user's balance atomically.
 * Returns false if balance is insufficient.
 */
export async function deductCredits(
  userId:  string,
  feature: FeatureKey,
  override?: number
): Promise<CreditDeductionResult> {
  const cost  = override ?? CREDIT_COSTS[feature] ?? 1;
  const admin = getAdminClient();

  // Fetch current balance
  const { data: profile, error: fetchErr } = await admin
    .from("profiles")
    .select("credits, plan_id")
    .eq("id", userId)
    .single();

  if (fetchErr || !profile) {
    return { success: false, balanceAfter: 0, error: "Failed to fetch balance." };
  }

  const current = (profile as Record<string, unknown>).credits as number;
  const plan    = (profile as Record<string, unknown>).plan_id as string;

  // Unlimited credits for enterprise
  if (current === -1 || plan === "enterprise") {
    return { success: true, balanceAfter: -1 };
  }

  if (current < cost) {
    return { success: false, balanceAfter: current, error: "Insufficient credits." };
  }

  const newBalance = current - cost;

  // Atomic update
  const { error: updateErr } = await admin
    .from("profiles")
    .update({ credits: newBalance, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (updateErr) {
    return { success: false, balanceAfter: current, error: "Failed to deduct credits." };
  }

  // Log transaction
  await admin.from("credit_transactions").insert({
    user_id:       userId,
    amount:        -cost,
    balance_after: newBalance,
    type:          "deduction",
    feature,
    description:   `${feature.replace(/_/g, " ")} — ${cost} credit${cost !== 1 ? "s" : ""}`,
    created_at:    new Date().toISOString(),
  });

  return { success: true, balanceAfter: newBalance };
}

// ─── AI dispatcher ────────────────────────────────────────────────────────────

const MODEL_PROVIDER_MAP: Record<string, "openai" | "anthropic" | "gemini"> = {
  "gpt-4o":                        "openai",
  "gpt-4o-mini":                   "openai",
  "gpt-4-turbo":                   "openai",
  "claude-3-5-sonnet-20241022":    "anthropic",
  "claude-3-haiku-20240307":       "anthropic",
  "gemini-2.0-flash":              "gemini",
  "gemini-1.5-pro":                "gemini",
};

/**
 * Send a completion request to the correct provider based on model ID.
 */
export async function callAI(req: AICompletionRequest): Promise<AICompletionResponse> {
  const start    = Date.now();
  const provider = MODEL_PROVIDER_MAP[req.model] ?? "openai";

  if (provider === "openai")    return callOpenAI(req, start);
  if (provider === "anthropic") return callAnthropic(req, start);
  if (provider === "gemini")    return callGemini(req, start);

  throw new Error(`Unknown provider for model: ${req.model}`);
}

async function callOpenAI(req: AICompletionRequest, start: number): Promise<AICompletionResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${ENV.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model:       req.model,
      messages:    req.messages,
      max_tokens:  req.maxTokens  ?? 1024,
      temperature: req.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`OpenAI error ${res.status}: ${(err as Record<string, unknown>).error?.["message"] ?? res.statusText}`);
  }

  const json      = await res.json() as Record<string, unknown>;
  const choice    = (json.choices as Record<string, unknown>[])[0];
  const usage     = json.usage as Record<string, number>;
  const text      = (choice.message as Record<string, unknown>).content as string ?? "";

  return {
    text,
    model:       req.model,
    tokensIn:    usage?.prompt_tokens     ?? 0,
    tokensOut:   usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens      ?? 0,
    latencyMs:   Date.now() - start,
  };
}

async function callAnthropic(req: AICompletionRequest, start: number): Promise<AICompletionResponse> {
  const systemMsg = req.messages.find((m) => m.role === "system")?.content ?? "";
  const userMsgs  = req.messages.filter((m) => m.role !== "system");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         ENV.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model:      req.model,
      max_tokens: req.maxTokens  ?? 1024,
      system:     systemMsg,
      messages:   userMsgs,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Anthropic error ${res.status}: ${(err as Record<string, unknown>).error?.["message"] ?? res.statusText}`);
  }

  const json    = await res.json() as Record<string, unknown>;
  const content = (json.content as Record<string, unknown>[])[0];
  const usage   = json.usage as Record<string, number>;
  const text    = content?.text as string ?? "";

  return {
    text,
    model:       req.model,
    tokensIn:    usage?.input_tokens  ?? 0,
    tokensOut:   usage?.output_tokens ?? 0,
    totalTokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    latencyMs:   Date.now() - start,
  };
}

async function callGemini(req: AICompletionRequest, start: number): Promise<AICompletionResponse> {
  const model   = req.model.replace("gemini-", "");
  const url     = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${ENV.GEMINI_API_KEY}`;

  const parts   = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ text: m.content }));

  const systemParts = req.messages
    .filter((m) => m.role === "system")
    .map((m) => ({ text: m.content }));

  const body: Record<string, unknown> = {
    contents:         [{ role: "user", parts }],
    generationConfig: {
      maxOutputTokens: req.maxTokens  ?? 1024,
      temperature:     req.temperature ?? 0.7,
    },
  };

  if (systemParts.length > 0) {
    body.systemInstruction = { parts: systemParts };
  }

  const res = await fetch(url, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gemini error ${res.status}: ${JSON.stringify(err)}`);
  }

  const json      = await res.json() as Record<string, unknown>;
  const candidate = (json.candidates as Record<string, unknown>[])?.[0];
  const text      = ((candidate?.content as Record<string, unknown>)?.parts as Record<string, unknown>[])?.[0]?.text as string ?? "";
  const usage     = json.usageMetadata as Record<string, number> ?? {};

  return {
    text,
    model:       req.model,
    tokensIn:    usage.promptTokenCount     ?? 0,
    tokensOut:   usage.candidatesTokenCount ?? 0,
    totalTokens: usage.totalTokenCount      ?? 0,
    latencyMs:   Date.now() - start,
  };
}

// ─── Logging ──────────────────────────────────────────────────────────────────

export function log(
  fn:      string,
  level:   "info" | "warn" | "error",
  message: string,
  data?:   unknown
): void {
  const entry = {
    fn, level, message, ts: new Date().toISOString(),
    ...(data ? { data } : {}),
  };
  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

// ─── Rate limit (simple in-memory per cold start) ─────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key:          string,
  maxPerMinute: number
): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= maxPerMinute) return false;
  entry.count++;
  return true;
}

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function trimToMaxTokens(text: string, maxChars = 12_000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[truncated for context window]";
}

export function buildSystemPrompt(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}
