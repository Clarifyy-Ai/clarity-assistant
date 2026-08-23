/**
 * Server-side feature kill-switch checks.
 * Loads disabled keys from feature_flags via service role (cached briefly).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "./utils.ts";
import type { Capability } from "./requireCapability.ts";

const CACHE_TTL_MS = 30_000;
let cache: { at: number; disabled: Set<string> } | null = null;

/** Capability → feature_flags.key used as kill switch. */
export const CAPABILITY_KILL_FLAG: Partial<Record<Capability, string>> = {
  live_rehearsal: "live_assist",
  advanced_hints: "live_assist",
  mock_interview: "mock_sessions",
  mock_test: "mock_sessions",
  prep_star: "star_builder",
  detailed_debrief: "session_debrief",
  desktop_overlay: "overlay",
  analytics: "analytics",
  company_research: "company_research",
  calendar_sync: "calendar_sync",
  gov_exam_ai_fill: "mock_sessions",
};

/** Edge function name → feature_flags.key (when not derived from capability). */
export const FUNCTION_KILL_FLAG: Record<string, string> = {
  "generate-hint": "live_assist",
  "generate-answer": "live_assist",
  "ai-coach-chat": "live_assist",
  "generate-questions": "mock_sessions",
  "generate-star-answer": "star_builder",
  "polish-star-section": "star_builder",
  "prep-tool": "star_builder",
  "generate-debrief": "session_debrief",
  "generate-scorecard": "session_debrief",
  "gap-analysis": "analytics",
  "company-research": "company_research",
  "sync-calendar": "calendar_sync",
  "parse-resume": "resume_analysis",
  "parse-document": "resume_analysis",
  "create-exam-paper": "mock_sessions",
  "select-test-questions": "mock_sessions",
  "assemble-assessment": "mock_sessions",
  "analyze-test-performance": "mock_sessions",
  "parse-question-pdf": "mock_sessions",
};

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getDisabledFeatureKeys(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.disabled;

  const supabase = serviceClient();
  if (!supabase) {
    return cache?.disabled ?? new Set();
  }

  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, is_enabled")
    .eq("is_enabled", false);

  if (error) {
    console.error("[featureKillSwitch] load failed:", error.message);
    return cache?.disabled ?? new Set();
  }

  const disabled = new Set<string>();
  for (const row of data ?? []) {
    if (row.key) disabled.add(String(row.key));
  }
  cache = { at: now, disabled };
  return disabled;
}

export async function isFeatureKilled(flagKey: string | null | undefined): Promise<boolean> {
  if (!flagKey) return false;
  const disabled = await getDisabledFeatureKeys();
  return disabled.has(flagKey);
}

export function killSwitchResponse(req?: Request): Response {
  return errorResponse(
    "This feature is temporarily unavailable.",
    "FEATURE_DISABLED",
    403,
    req,
  );
}
