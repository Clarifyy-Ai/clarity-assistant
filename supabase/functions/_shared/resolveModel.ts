// supabase/functions/_shared/resolveModel.ts
// Maps profile/app model IDs to API model IDs with plan gating.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  APP_TO_API,
  DEFAULT_TEXT_MODEL,
  buildFallbackChain,
  mapAppModelToApi,
  providerForModel,
} from "./modelCatalog.ts";
import {
  configuredProviderKeys,
  getAvailableModels,
} from "./modelAvailability.ts";

const DEFAULT_MODEL = DEFAULT_TEXT_MODEL;

const PRO_PLANS = new Set(["pro", "elite", "enterprise", "max", "team"]);

export { mapAppModelToApi, APP_TO_API };

export function isGeminiModel(model: string): boolean {
  return providerForModel(model) === "gemini";
}

export function isModelAllowedForPlan(apiModel: string, planId: string): boolean {
  if (PRO_PLANS.has(planId)) return true;
  return isGeminiModel(apiModel);
}

export function normalizeApiModel(model: string): string {
  const mapped = mapAppModelToApi(model);
  if (providerForModel(mapped)) return mapped;
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

function fallbackKeys() {
  const keys = configuredProviderKeys();
  return {
    gemini: keys.gemini,
    openai: keys.openai,
    anthropic: keys.anthropic,
  };
}

/** Sync chain from the static catalog + configured keys (no network). */
export function getFallbackModels(primary: string): string[] {
  return buildFallbackChain(primary, fallbackKeys());
}

/** Same chain, filtered to models the project key can actually list. */
export async function getFallbackModelsAsync(primary: string): Promise<string[]> {
  const keys = fallbackKeys();
  try {
    const available = await getAvailableModels();
    return buildFallbackChain(primary, keys, available);
  } catch {
    return buildFallbackChain(primary, keys);
  }
}
