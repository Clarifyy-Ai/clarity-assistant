export const SESSION_ELIGIBILITY_REASONS = [
  "ALLOWED",
  "DAILY_LIMIT_REACHED",
  "CREDITS_EXHAUSTED",
  "CAPABILITY_REQUIRED",
  "ACCOUNT_RESTRICTED",
  "PROVIDER_UNAVAILABLE",
  "AUTHENTICATION_REQUIRED",
] as const;

export type SessionEligibilityReason = (typeof SESSION_ELIGIBILITY_REASONS)[number];

export function httpStatusForEligibilityReason(reason: string): number {
  switch (reason) {
    case "ALLOWED":
      return 200;
    case "AUTHENTICATION_REQUIRED":
      return 401;
    case "ACCOUNT_RESTRICTED":
    case "CAPABILITY_REQUIRED":
      return 403;
    case "DAILY_LIMIT_REACHED":
      return 429;
    case "CREDITS_EXHAUSTED":
      return 422;
    case "PROVIDER_UNAVAILABLE":
      return 503;
    default:
      return 400;
  }
}

export function eligibilityUserMessage(reason: string, extras?: {
  used?: number | null;
  limit?: number | null;
  reset_at?: string | null;
}): string {
  switch (reason) {
    case "DAILY_LIMIT_REACHED": {
      const limit = extras?.limit ?? 3;
      const used = extras?.used ?? limit;
      return `You've reached today's session limit (${used} of ${limit}).`;
    }
    case "CREDITS_EXHAUSTED":
      return "You have no credits remaining. Upgrade to continue practicing.";
    case "CAPABILITY_REQUIRED":
      return "This session type requires a higher plan.";
    case "ACCOUNT_RESTRICTED":
      return "This account cannot start a session right now.";
    case "PROVIDER_UNAVAILABLE":
      return "The coaching service is temporarily unavailable. Please try again shortly.";
    case "AUTHENTICATION_REQUIRED":
      return "Please sign in to start a session.";
    default:
      return "This session cannot be started right now.";
  }
}

export function configuredAiProviders(): {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
} {
  const gemini = Boolean(
    (Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_AI_API_KEY") ?? "").trim(),
  );
  const openai = Boolean((Deno.env.get("OPENAI_API_KEY") ?? "").trim());
  const anthropic = Boolean((Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim());
  return { gemini, openai, anthropic };
}

/** True when any coaching provider in the canonical fallback chain is configured. */
export function isAiProviderConfigured(): boolean {
  try {
    const p = configuredAiProviders();
    return p.gemini || p.openai || p.anthropic;
  } catch {
    return false;
  }
}

export function isSttProviderConfigured(): boolean {
  try {
    return Boolean((Deno.env.get("DEEPGRAM_API_KEY") ?? "").trim());
  } catch {
    return false;
  }
}

/** Operation readiness — never includes secret presence details for public clients. */
export function sessionServiceReadiness(): {
  ai: boolean;
  transcription: boolean;
} {
  return {
    ai: isAiProviderConfigured(),
    transcription: isSttProviderConfigured(),
  };
}

export type EligibilityRpc = {
  allowed?: boolean;
  reason?: string;
  used?: number | null;
  limit?: number | null;
  reset_at?: string | null;
  upgrade_available?: boolean;
  credits?: number | null;
  ok?: boolean;
  session_id?: string;
  reused?: boolean;
  started_at?: string;
  expires_at?: string | null;
  status?: string;
  lifecycle_status?: string;
  terminal_reason?: string | null;
  found?: boolean;
  expired?: boolean;
  already_terminal?: boolean;
  ended_at?: string | null;
  duration_seconds?: number | null;
  type?: string;
  title?: string | null;
};

export function parseJsonbObject(value: unknown): EligibilityRpc {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as EligibilityRpc;
}
