// supabase/functions/ai-hub-router/index.ts
// Admin AI Hub gateway: status | estimate | run | route | test-connection | settings
//
// COST POLICY (documented):
// - Free-tier eligible Hub calls meter ai_free_tier_usage and do NOT debit credits ledger.
// - Paid Hub Lab/ops calls use USD ops budgets in ai_hub_settings only — do NOT debit credits.
// - Product AI (Practice Coach / Prep / etc.) is unchanged and still uses credits.

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest, enforceAdmin } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  AI_HUB_MODELS,
  AI_HUB_MODE_OUTPUT_CAPS,
  estimateCostMicroUsd,
  estimateInputTokens,
  getHubModel,
  microUsdToDisplay,
  type AIHubProvider,
} from "../_shared/aiHub/registry.ts";
import { decideRoute } from "../_shared/aiHub/analyzer.ts";
import {
  cheapConnectionTest,
  hubGenerate,
  providerConfigured,
} from "../_shared/aiHub/providers.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
} from "../_shared/rateLimit.ts";

type LabMode = "quick" | "normal" | "deep" | "benchmark" | "routed";
const FUNCTION_NAME = "ai-hub-router";

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(corsHeaders: HeadersInit, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clampOutput(
  mode: LabMode,
  modelId: string,
  requested: number | undefined,
  accelCeiling: number,
): number {
  const model = getHubModel(modelId);
  const modeCap = AI_HUB_MODE_OUTPUT_CAPS[mode] ?? 2000;
  const modelCap = model?.maxOutputTokens ?? 2048;
  const req = requested ?? modeCap;
  return Math.max(1, Math.min(req, modeCap, modelCap, accelCeiling));
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return json(corsHeaders, { error: "Method not allowed", code: "INVALID_REQUEST" }, 405);
  }

  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) {
    return json(corsHeaders, { error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const adminGate = await enforceAdmin(auth.context.user.id);
  if (adminGate) return withCorsHeaders(req, adminGate);

  const userId = auth.context.user.id;
  const db = createServiceClient();

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json(corsHeaders, { error: "Invalid JSON body", code: "INVALID_REQUEST" }, 400);
  }

  const action = String(body.action ?? "status");

  // Load settings
  const { data: settingRows } = await db.from("ai_hub_settings").select("key, value");
  const settings: Record<string, unknown> = {};
  for (const row of settingRows ?? []) {
    settings[row.key] = row.value;
  }
  const budgets = (settings.budgets ?? {}) as Record<string, number>;
  const cacheCfg = (settings.cache ?? { enabled: true, ttl_seconds: 86400 }) as {
    enabled?: boolean;
    ttl_seconds?: number;
  };
  const freeTierCfg = (settings.free_tier ?? {
    enabled: true,
    daily_tokens: 250000,
  }) as { enabled?: boolean; daily_tokens?: number };
  const accelRow = await db
    .from("ai_acceleration_settings")
    .select("*")
    .eq("scope", "platform")
    .is("scope_id", null)
    .maybeSingle();
  const accelCeiling = Number(
    accelRow.data?.max_output_tokens_ceiling ?? 5000,
  );
  const priorityTier = String(accelRow.data?.priority_tier ?? "standard");

  // ── STATUS ──────────────────────────────────────────────────────────────
  if (action === "status") {
    const utcDay = new Date().toISOString().slice(0, 10);
    const { data: freeRow } = await db
      .from("ai_free_tier_usage")
      .select("*")
      .eq("user_id", userId)
      .eq("usage_date", utcDay)
      .eq("model_class", "flash_equivalent")
      .maybeSingle();

    const dayStart = `${utcDay}T00:00:00.000Z`;
    const { data: daySpend } = await db
      .from("ai_test_results")
      .select("actual_cost_micro_usd")
      .gte("created_at", dayStart);

    const spentToday = (daySpend ?? []).reduce(
      (s, r) => s + Number(r.actual_cost_micro_usd ?? 0),
      0,
    );

    return json(corsHeaders, {
      providers: {
        openai: { configured: providerConfigured("openai") },
        gemini: { configured: providerConfigured("gemini") },
        anthropic: { configured: providerConfigured("anthropic") },
      },
      providerMode: Deno.env.get("AI_PROVIDER_MODE") ?? "mock",
      models: AI_HUB_MODELS.filter((m) => m.enabled),
      budgets,
      cache: cacheCfg,
      freeTier: {
        enabled: freeTierCfg.enabled !== false,
        dailyTokens: Number(freeTierCfg.daily_tokens ?? 250000),
        usedToday: Number(freeRow?.tokens_used ?? 0),
        remainingToday: Math.max(
          0,
          Number(freeTierCfg.daily_tokens ?? 250000) -
            Number(freeRow?.tokens_used ?? 0),
        ),
      },
      acceleration: {
        priorityTier,
        maxOutputTokensCeiling: accelCeiling,
        concurrentRequestCeiling: Number(
          accelRow.data?.concurrent_request_ceiling ?? 5,
        ),
      },
      spentTodayMicroUsd: spentToday,
      dailyBudgetMicroUsd: Number(budgets.daily_budget_micro_usd ?? 2_000_000),
    });
  }

  // ── TEST CONNECTION ─────────────────────────────────────────────────────
  if (action === "test-connection") {
    const provider = String(body.provider ?? "") as AIHubProvider;
    if (!["openai", "gemini", "anthropic"].includes(provider)) {
      return json(corsHeaders, { error: "Invalid provider", code: "INVALID_REQUEST" }, 400);
    }
    const result = await cheapConnectionTest(provider);
    return json(corsHeaders, { provider, ...result });
  }

  // ── UPDATE SETTINGS (admin) ─────────────────────────────────────────────
  if (action === "update-settings") {
    const patch = body.patch as Record<string, unknown> | undefined;
    if (!patch || typeof patch !== "object") {
      return json(corsHeaders, { error: "patch required", code: "INVALID_REQUEST" }, 400);
    }
    for (const key of ["budgets", "cache", "free_tier", "routing", "acceleration", "provider_mode"]) {
      if (key in patch) {
        await db.from("ai_hub_settings").upsert({
          key,
          value: patch[key],
          updated_by: userId,
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (patch.acceleration && typeof patch.acceleration === "object") {
      const a = patch.acceleration as Record<string, unknown>;
      const payload = {
        priority_tier: a.priority_tier ?? priorityTier,
        max_output_tokens_ceiling: Number(a.max_output_tokens_ceiling ?? accelCeiling),
        concurrent_request_ceiling: Number(a.concurrent_request_ceiling ?? 5),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      };
      if (accelRow.data?.id) {
        await db.from("ai_acceleration_settings").update(payload).eq("id", accelRow.data.id);
      } else {
        await db.from("ai_acceleration_settings").insert({
          scope: "platform",
          scope_id: null,
          ...payload,
        });
      }
    }
    return json(corsHeaders, { ok: true });
  }

  // ── HISTORY ─────────────────────────────────────────────────────────────
  if (action === "history") {
    const limit = Math.min(100, Number(body.limit ?? 30));
    const { data: runs } = await db
      .from("ai_test_runs")
      .select("*, ai_test_results(*)")
      .order("created_at", { ascending: false })
      .limit(limit);
    return json(corsHeaders, { runs: runs ?? [] });
  }

  // Shared fields for estimate / run / route
  const prompt = String(body.prompt ?? "").trim();
  const systemPrompt = body.systemPrompt ? String(body.systemPrompt) : undefined;
  const mode = (String(body.mode ?? "normal") as LabMode);
  const taskHint = body.taskHint ? String(body.taskHint) : undefined;

  // ── ESTIMATE / RUN / ROUTE need a prompt ────────────────────────────────
  if (action === "estimate" || action === "run" || action === "route") {
    if (!prompt || prompt.length > 100_000) {
      return json(
        corsHeaders,
        { error: "Prompt required (max 100k chars)", code: "INVALID_REQUEST" },
        400,
      );
    }
  }

  // Build selection list
  type Selection = { provider: AIHubProvider; model: string };
  let selections: Selection[] = [];
  let routingReason: string | undefined;
  let routeFallbackChain: string[] = [];

  if (action === "route") {
    const decision = decideRoute({ prompt, systemPrompt, taskHint });
    selections = [{ provider: decision.provider, model: decision.model }];
    routingReason = decision.reason;
    routeFallbackChain = decision.fallbackChain;
  } else if (action === "estimate" || action === "run") {
    const models = Array.isArray(body.models) ? body.models : [];
    for (const m of models) {
      const modelId = String((m as { model?: string }).model ?? "");
      const provider = String((m as { provider?: string }).provider ?? "") as AIHubProvider;
      const info = getHubModel(modelId);
      if (!info || info.provider !== provider) {
        return json(
          corsHeaders,
          { error: `Invalid model selection: ${provider}/${modelId}`, code: "MODEL_NOT_AVAILABLE" },
          400,
        );
      }
      selections.push({ provider, model: modelId });
    }
    if (!selections.length) {
      return json(
        corsHeaders,
        { error: "Select at least one model", code: "INVALID_REQUEST" },
        400,
      );
    }
    if (mode === "quick" && selections.length > 1) {
      return json(
        corsHeaders,
        { error: "Quick mode allows only 1 model", code: "INVALID_REQUEST" },
        400,
      );
    }
    if (mode === "normal" && selections.length > 3) {
      return json(
        corsHeaders,
        { error: "Normal mode allows at most 3 models", code: "INVALID_REQUEST" },
        400,
      );
    }
  }

  if (action === "estimate" || action === "run" || action === "route") {
    const inputEst = estimateInputTokens(`${systemPrompt ?? ""}\n${prompt}`);
    const estimates = selections.map((sel) => {
      const maxOut = clampOutput(mode === "route" ? "routed" : mode, sel.model, Number(body.maxOutputTokens) || undefined, accelCeiling);
      const maxCost = estimateCostMicroUsd(sel.model, inputEst, maxOut);
      return {
        ...sel,
        estimatedInputTokens: inputEst,
        maxOutputTokens: maxOut,
        estimatedMaxCostMicroUsd: maxCost,
        estimatedMaxCostDisplay: microUsdToDisplay(maxCost),
      };
    });
    const totalMax = estimates.reduce((s, e) => s + e.estimatedMaxCostMicroUsd, 0);

    if (action === "estimate") {
      return json(corsHeaders, {
        estimates,
        totalEstimatedMaxCostMicroUsd: totalMax,
        totalEstimatedMaxCostDisplay: microUsdToDisplay(totalMax),
        routingReason,
        note: "Token and cost figures are Estimated maximums unless labeled Actual after execution.",
      });
    }

    // Rate limit (Hub run/route) — free-tier does not bypass abuse protection
    const perMin = Number(budgets.rate_limit_per_minute ?? 10);
    const rateLimitResult = await checkRateLimitAsync(db, {
      key: createRateLimitKey(FUNCTION_NAME, userId),
      limit: priorityTier === "throttled" ? Math.max(1, Math.floor(perMin / 2)) : perMin,
      windowMs: 60_000,
    });
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Budget pre-check
    const maxRequest = Number(budgets.max_request_cost_micro_usd ?? 100_000);
    if (totalMax > maxRequest) {
      return json(corsHeaders, {
        error: "Request blocked by cost protection. Estimated cost exceeds the configured limit.",
        code: "BUDGET_EXCEEDED",
        totalEstimatedMaxCostMicroUsd: totalMax,
        maxRequestCostMicroUsd: maxRequest,
      }, 402);
    }

    const utcDay = new Date().toISOString().slice(0, 10);
    const dayStart = `${utcDay}T00:00:00.000Z`;
    const { data: daySpend } = await db
      .from("ai_test_results")
      .select("actual_cost_micro_usd")
      .gte("created_at", dayStart);
    const spentToday = (daySpend ?? []).reduce(
      (s, r) => s + Number(r.actual_cost_micro_usd ?? 0),
      0,
    );
    const dailyBudget = Number(budgets.daily_budget_micro_usd ?? 2_000_000);
    if (spentToday + totalMax > dailyBudget) {
      return json(corsHeaders, {
        error: "Request blocked by cost protection. Estimated cost exceeds the configured limit.",
        code: "BUDGET_EXCEEDED",
        spentTodayMicroUsd: spentToday,
        dailyBudgetMicroUsd: dailyBudget,
      }, 402);
    }

    // Create run
    const promptHash = await sha256Hex(
      JSON.stringify({ prompt, systemPrompt, selections, mode }),
    );
    const { data: run, error: runErr } = await db
      .from("ai_test_runs")
      .insert({
        user_id: userId,
        mode: action === "route" ? "routed" : mode,
        prompt_hash: promptHash,
        prompt_preview: prompt.slice(0, 240),
        system_prompt_preview: systemPrompt?.slice(0, 120) ?? null,
        status: "running",
        estimated_cost_micro_usd: totalMax,
        routing_reason: routingReason ?? null,
      })
      .select("*")
      .single();

    if (runErr || !run) {
      return json(corsHeaders, {
        error: "Failed to create test run",
        code: "UNKNOWN_ERROR",
      }, 500);
    }

    const results = [];
    const concurrency = priorityTier === "throttled" ? 1 : 3;

    // Sequential batches
    for (let i = 0; i < selections.length; i += concurrency) {
      const batch = selections.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (sel) => {
          const maxOut = clampOutput(
            action === "route" ? "routed" : mode,
            sel.model,
            Number(body.maxOutputTokens) || undefined,
            accelCeiling,
          );

          // Cache
          const cacheKey = await sha256Hex(
            JSON.stringify({
              provider: sel.provider,
              model: sel.model,
              systemPrompt: systemPrompt ?? "",
              prompt,
              maxOut,
            }),
          );

          if (cacheCfg.enabled !== false) {
            const { data: cached } = await db
              .from("ai_test_cache")
              .select("*")
              .eq("cache_key", cacheKey)
              .gt("expires_at", new Date().toISOString())
              .maybeSingle();
            if (cached?.response_payload) {
              const payload = cached.response_payload as Record<string, unknown>;
              const row = {
                test_id: run.id,
                provider: sel.provider,
                model: sel.model,
                response_text: String(payload.responseText ?? ""),
                input_tokens: Number(payload.inputTokens ?? 0),
                output_tokens: Number(payload.outputTokens ?? 0),
                total_tokens: Number(payload.totalTokens ?? 0),
                latency_ms: Number(payload.latencyMs ?? 0),
                estimated_cost_micro_usd: Number(payload.actualCostMicroUsd ?? 0),
                actual_cost_micro_usd: 0,
                finish_reason: "cached",
                cached: true,
                free_tier_used: false,
                routing_reason: routingReason ?? null,
                success: true,
              };
              const { data: inserted } = await db
                .from("ai_test_results")
                .insert(row)
                .select("*")
                .single();
              return inserted;
            }
          }

          // Free tier eligibility + generate (with route fallback walk)
          const tryModels: Selection[] =
            action === "route"
              ? [
                  sel,
                  ...routeFallbackChain
                    .filter((id) => id !== sel.model)
                    .map((id) => {
                      const info = getHubModel(id);
                      return info
                        ? { provider: info.provider, model: info.id }
                        : null;
                    })
                    .filter((x): x is Selection => Boolean(x)),
                ]
              : [sel];

          let gen: Awaited<ReturnType<typeof hubGenerate>> | null = null;
          let usedSel = sel;
          let freeTierUsed = false;
          let exhausted = false;

          for (const candidate of tryModels) {
            const candidateInfo = getHubModel(candidate.model);
            if (!candidateInfo) continue;
            // Never silently escalate to a pricier tier without budget re-check
            const estCost = estimateCostMicroUsd(
              candidate.model,
              estimateInputTokens(`${systemPrompt ?? ""}\n${prompt}`),
              maxOut,
            );
            if (estCost > Number(budgets.max_request_cost_micro_usd ?? 100_000)) {
              continue;
            }

            const estTokens = estimateInputTokens(prompt) + maxOut;
            freeTierUsed = false;
            if (freeTierCfg.enabled !== false && candidateInfo.freeTierEligible) {
              const { data: freeRow } = await db
                .from("ai_free_tier_usage")
                .select("*")
                .eq("user_id", userId)
                .eq("usage_date", utcDay)
                .eq("model_class", "flash_equivalent")
                .maybeSingle();
              const used = Number(freeRow?.tokens_used ?? 0);
              const limit = Number(
                freeRow?.tokens_limit ?? freeTierCfg.daily_tokens ?? 250000,
              );
              if (used + estTokens <= limit) freeTierUsed = true;
            }

            const attempt = await hubGenerate({
              provider: candidate.provider,
              model: candidate.model,
              prompt,
              systemPrompt,
              maxOutputTokens: maxOut,
            });
            gen = attempt;
            usedSel = candidate;
            if (attempt.success) break;
          }

          if (!gen) {
            exhausted = true;
            gen = {
              provider: sel.provider,
              model: sel.model,
              responseText: "",
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              latencyMs: 0,
              estimatedCostMicroUsd: 0,
              actualCostMicroUsd: 0,
              finishReason: "error",
              success: false,
              errorCode: "ROUTING_EXHAUSTED",
              errorMessage:
                "No eligible model could complete this request within budget.",
            };
          }

          const estTokens = estimateInputTokens(prompt) + maxOut;

          // Charge free tier tokens only when success + freeTierUsed
          // USD ops cost only when NOT free tier (no credits ledger debit)
          const billableCost =
            freeTierUsed || exhausted ? 0 : gen.actualCostMicroUsd;

          if (freeTierUsed && gen.success) {
            const tokens = gen.totalTokens || estTokens;
            const { data: fr } = await db
              .from("ai_free_tier_usage")
              .select("tokens_used")
              .eq("user_id", userId)
              .eq("usage_date", utcDay)
              .eq("model_class", "flash_equivalent")
              .maybeSingle();
            const nextUsed = Number(fr?.tokens_used ?? 0) + tokens;
            await db.from("ai_free_tier_usage").upsert(
              {
                user_id: userId,
                usage_date: utcDay,
                model_class: "flash_equivalent",
                tokens_used: nextUsed,
                tokens_limit: Number(freeTierCfg.daily_tokens ?? 250000),
                last_reset_at: new Date().toISOString(),
              },
              { onConflict: "user_id,usage_date,model_class" },
            );
          }

          if (cacheCfg.enabled !== false && gen.success) {
            const ttl = Number(cacheCfg.ttl_seconds ?? 86400);
            await db.from("ai_test_cache").upsert({
              cache_key: cacheKey,
              provider: usedSel.provider,
              model: usedSel.model,
              response_payload: gen,
              expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
            });
          }

          // Also log to ai_usage_logs for AdminModelCosts compatibility
          try {
            await db.from("ai_usage_logs").insert({
              user_id: userId,
              action: "ai_hub",
              model: usedSel.model,
              input_tokens: gen.inputTokens,
              output_tokens: gen.outputTokens,
              latency_ms: gen.latencyMs,
              was_fallback: usedSel.model !== sel.model,
              cost_microcents: Math.round(billableCost / 10),
            });
          } catch {
            // non-fatal
          }

          const row = {
            test_id: run.id,
            provider: gen.provider,
            model: gen.model,
            response_text: gen.responseText,
            input_tokens: gen.inputTokens,
            output_tokens: gen.outputTokens,
            total_tokens: gen.totalTokens,
            latency_ms: gen.latencyMs,
            estimated_cost_micro_usd: gen.estimatedCostMicroUsd,
            actual_cost_micro_usd: billableCost,
            finish_reason: gen.finishReason,
            cached: false,
            free_tier_used: freeTierUsed && gen.success,
            routing_reason: routingReason ?? null,
            success: gen.success,
            error_code: gen.errorCode ?? null,
            error_message: gen.errorMessage ?? null,
          };
          const { data: inserted } = await db
            .from("ai_test_results")
            .insert(row)
            .select("*")
            .single();
          return inserted;
        }),
      );
      results.push(...batchResults);
    }

    const actualTotal = results.reduce(
      (s, r) => s + Number(r?.actual_cost_micro_usd ?? 0),
      0,
    );
    const anyFail = results.some((r) => r && r.success === false);
    await db
      .from("ai_test_runs")
      .update({
        status: anyFail ? "failed" : "completed",
        actual_cost_micro_usd: actualTotal,
        free_tier_used: results.some((r) => r?.free_tier_used),
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    return json(corsHeaders, {
      testId: run.id,
      routingReason,
      results,
      note:
        "Free-tier calls do not debit the credits ledger. Paid Hub ops use the ops budget only (not credits).",
    });
  }

  return json(corsHeaders, { error: `Unknown action: ${action}`, code: "INVALID_REQUEST" }, 400);
});
