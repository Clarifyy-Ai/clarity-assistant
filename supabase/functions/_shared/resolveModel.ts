// supabase/functions/_shared/resolveModel.ts
// Maps profile/app model IDs to API model IDs with plan gating.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DEFAULT_MODEL = "gemini-2.0-flash";

/** App / profile slug → API model id */
const APP_TO_API: Record<string, string> = {
  "gemini-flash": "gemini-2.0-flash",
  "gemini-pro": "gemini-1.5-pro",
  "gemini-2.0-flash": "gemini-2.0-flash",
  "gemini-2.5-flash": "gemini-2.5-flash",
  "gemini-1.5-pro": "gemini-1.5-pro",
  "gemini-1.5-flash": "gemini-1.5-flash",
  "gpt-4o": "gpt-4o",
  "gpt-4o-mini": "gpt-4o-mini",
  "claude": "claude-3-5-sonnet-20241022",
  "claude-3-5-sonnet": "claude-3-5-sonnet-20241022",
  "claude-3-haiku": "claude-3-haiku-20240307",
};

const KNOWN_MODELS = new Set([
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "claude-3-5-sonnet-20241022",
  "claude-3-haiku-20240307",
]);

const PRO_PLANS = new Set(["pro", "starter", "elite", "enterprise"]);

export function mapAppModelToApi(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return DEFAULT_MODEL;
  return APP_TO_API[trimmed] ?? trimmed;
}

export function isGeminiModel(model: string): boolean {
  return model.startsWith("gemini");
}

export function isModelAllowedForPlan(apiModel: string, planId: string): boolean {
  if (PRO_PLANS.has(planId)) return true;
  return isGeminiModel(apiModel);
}

export function normalizeApiModel(model: string): string {
  const mapped = mapAppModelToApi(model);
  if (KNOWN_MODELS.has(mapped)) return mapped;
  if (isGeminiModel(mapped)) return DEFAULT_MODEL;
  return DEFAULT_MODEL;
}

export async function resolveModel(
  admin: SupabaseClient,
  userId: string,
  requestedModel?: string | null,
): Promise<string> {
  let planId = "free";
  let preferred = DEFAULT_MODEL;

  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("plan_id, preferred_model")
      .eq("id", userId)
      .maybeSingle();

    if (profile) {
      planId = String(profile.plan_id ?? "free");
      if (profile.preferred_model) {
        preferred = mapAppModelToApi(String(profile.preferred_model));
      }
    }
  } catch {
    // fall through to defaults
  }

  let candidate = requestedModel?.trim()
    ? mapAppModelToApi(requestedModel.trim())
    : preferred;

  candidate = normalizeApiModel(candidate);

  if (!isModelAllowedForPlan(candidate, planId)) {
    candidate = DEFAULT_MODEL;
  }

  return candidate;
}

export function getFallbackModels(primary: string): string[] {
  const chain = [primary];
  if (primary !== "gemini-2.0-flash") chain.push("gemini-2.0-flash");
  if (primary !== "gemini-1.5-pro") chain.push("gemini-1.5-pro");
  return [...new Set(chain)];
}
