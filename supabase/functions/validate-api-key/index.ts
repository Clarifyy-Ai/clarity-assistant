// validate-api-key/index.ts — FIXED & PRODUCTION READY

import { corsHeaders } from "../_shared/cors.ts";
import {
  handleCors,
  requireAuth,
  parseBody,
  errorResponse,
  successResponse,
  log
} from "../_shared/utils.ts";

/* -------------------------------------------------------------------------- */
/*                                SANITIZATION                                */
/* -------------------------------------------------------------------------- */

function safe(text: any, max = 200): string {
  return String(text ?? "")
    .replace(/[^\w\-_.]/g, "") // allow only safe chars for API keys
    .slice(0, max)
    .trim();
}

const VALID_PROVIDERS = ["openai", "anthropic", "gemini"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

interface ValidateRequest {
  provider: Provider;
  api_key: string;
}

/* -------------------------------------------------------------------------- */
/*                          PROVIDER VALIDATION LOGIC                          */
/* -------------------------------------------------------------------------- */

async function validateOpenAI(key: string): Promise<boolean> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 7000);

  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}` }
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function validateAnthropic(key: string): Promise<boolean> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 7000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }]
      })
    });

    // 200 => valid  
    // 429 => key valid but rate limited  
    return res.status === 200 || res.status === 429;
  } catch {
    return false;
  }
}

async function validateGemini(key: string): Promise<boolean> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 7000);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      { signal: ctrl.signal }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*                                MAIN HANDLER                                 */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const FN = "validate-api-key";

  try {
    /* ------------------------------ AUTH ------------------------------ */
    const auth = await requireAuth(req);

    /* ------------------------------ BODY ------------------------------ */
    const body = await parseBody<ValidateRequest>(req);

    if (!body?.provider || !body.api_key) {
      return errorResponse(
        "Missing provider or api_key",
        "VALIDATION_ERROR",
        400
      );
    }

    const provider = safe(body.provider) as Provider;
    const apiKey = safe(body.api_key, 120);

    if (!VALID_PROVIDERS.includes(provider)) {
      return errorResponse(
        `Unknown provider: ${provider}`,
        "INVALID_PROVIDER",
        400
      );
    }

    /* -------------------------- VALIDATION -------------------------- */
    let valid = false;

    if (provider === "openai") valid = await validateOpenAI(apiKey);
    else if (provider === "anthropic") valid = await validateAnthropic(apiKey);
    else if (provider === "gemini") valid = await validateGemini(apiKey);

    /* ---------------------------- LOGGING ---------------------------- */
    log(FN, "info", "API key validated", {
      provider,
      userId: auth.userId,
      valid
    });

    /* ---------------------------- RESPONSE ---------------------------- */
    return successResponse({
      valid,
      error: valid ? null : `Invalid ${provider} API key`
    });

  } catch (err) {
    log(FN, "error", "Unhandled error", err);
    return errorResponse("Internal server error", "INTERNAL", 500);
  }
});
