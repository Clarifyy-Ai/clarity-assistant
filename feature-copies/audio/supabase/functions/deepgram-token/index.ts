// supabase/functions/deepgram-token/index.ts
// Returns a short-lived scoped Deepgram key safe for browser use.
// TTL = 60s — enough to establish the WebSocket handshake, too short to abuse.
// NEVER falls back to returning the raw production key.

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import { authenticateRequest } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  enforceSessionRateLimitAsync,
} from "../_shared/rateLimit.ts";

const TOKEN_TTL_SECONDS = 600; // 10 minutes — meaningful lifetime for live sessions
const CACHE_SAFETY_BUFFER_S = 15;

// Simple in-memory cache to reduce temporary key creation calls.
const tokenCache = new Map<
  string,
  { token: string; key_id: string | null; expires_at_ms: number }
>();

const inflightMint = new Map<
  string,
  Promise<{ token: string; key_id: string | null; expires_in: number }>
>();

Deno.serve(async (req: Request) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const headers = getCorsHeaders(req);

  try {
    const auth = await authenticateRequest(req);
    if (auth.error) return auth.error;
    const user = auth.context.user;

    const db = createServiceClient();
    const rateLimited = await enforceSessionRateLimitAsync(db, "deepgram-token", user.id);
    if (rateLimited) return withCorsHeaders(req, rateLimited);

    /* ── ENV VALIDATION ────────────────────────────────────────────────── */
    const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY");
    let DEEPGRAM_PROJECT_ID = (Deno.env.get("DEEPGRAM_PROJECT_ID") ?? "").trim();

    if (!DEEPGRAM_API_KEY) {
      console.error("[deepgram-token] DEEPGRAM_API_KEY secret is not set");
      return new Response(
        JSON.stringify({ error: "Transcription service is not configured", code: "SERVICE_UNAVAILABLE" }),
        { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    if (!DEEPGRAM_PROJECT_ID) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const listRes = await fetch("https://api.deepgram.com/v1/projects", {
          headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, Accept: "application/json" },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        const listText = await listRes.text();
        if (listRes.ok) {
          const parsed = JSON.parse(listText) as {
            projects?: Array<{ project_id?: string; id?: string }>;
          };
          const first = parsed.projects?.[0];
          DEEPGRAM_PROJECT_ID = (first?.project_id ?? first?.id ?? "").trim();
        } else {
          console.error("[deepgram-token] Deepgram project list failed:", listRes.status, listText.slice(0, 200));
        }
      } catch (listErr) {
        console.error("[deepgram-token] Deepgram project lookup error:", listErr);
      }
    }

    if (!DEEPGRAM_PROJECT_ID) {
      console.error("[deepgram-token] DEEPGRAM_PROJECT_ID secret is not set and lookup failed.");
      return new Response(
        JSON.stringify({
          error: "Transcription service misconfigured. Contact support.",
          code: "MISSING_PROJECT_ID",
        }),
        { status: 503, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    /* ── CACHE HIT (avoid unnecessary temp key creation) ───────────────── */
    const cached = tokenCache.get(user.id);
    const now = Date.now();
    if (cached && now + CACHE_SAFETY_BUFFER_S * 1000 < cached.expires_at_ms) {
      const remaining = Math.max(1, Math.round((cached.expires_at_ms - now) / 1000));
      return new Response(
        JSON.stringify({
          token: cached.token,
          expires_in: remaining,
          key_id: cached.key_id,
          type: "scoped",
          cached: true,
        }),
        { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const pending = inflightMint.get(user.id);
    if (pending) {
      try {
        const minted = await pending;
        const remaining = Math.max(1, minted.expires_in);
        return new Response(
          JSON.stringify({
            token: minted.token,
            expires_in: remaining,
            key_id: minted.key_id,
            type: "scoped",
            cached: true,
          }),
          { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
        );
      } catch {
        return new Response(
          JSON.stringify({
            error: "Could not create transcription session. Please retry.",
            code: "SERVICE_UNAVAILABLE",
          }),
          { status: 502, headers: { ...headers, "Content-Type": "application/json" } },
        );
      }
    }

    /* ── CREATE SCOPED TEMPORARY KEY (deduped per user) ──────────────── */
    const mintPromise = (async (): Promise<{ token: string; key_id: string | null; expires_in: number }> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const tempKeyRes = await fetch(
      `https://api.deepgram.com/v1/projects/${DEEPGRAM_PROJECT_ID}/keys`,
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          comment: `session-${user.id.slice(0, 8)}-${Date.now()}`,
          scopes: ["usage:write"],
          time_to_live_in_seconds: TOKEN_TTL_SECONDS,
        }),
        signal: controller.signal,
      },
    ).finally(() => clearTimeout(timeout));

    if (!tempKeyRes.ok) {
      const errBody = await tempKeyRes.text().catch(() => "");
      console.error(
        "[deepgram-token] Deepgram key creation failed:",
        tempKeyRes.status,
        errBody,
      );

      throw new Error(`Deepgram key creation failed: ${tempKeyRes.status}`);
    }

    const keyData = await tempKeyRes.json() as { key_id?: string; key?: string };
    const tempKey = keyData?.key;

    if (!tempKey) {
      console.error(
        "[deepgram-token] Deepgram response missing key field:",
        JSON.stringify(keyData),
      );
      throw new Error("Invalid response from transcription service");
    }

    return {
      token: tempKey,
      key_id: keyData.key_id ?? null,
      expires_in: TOKEN_TTL_SECONDS,
    };
    })();

    inflightMint.set(user.id, mintPromise);

    let minted: { token: string; key_id: string | null; expires_in: number };
    try {
      minted = await mintPromise;
    } catch (mintErr) {
      return new Response(
        JSON.stringify({
          error: "Could not create transcription session. Please retry.",
          code: "SERVICE_UNAVAILABLE",
        }),
        { status: 502, headers: { ...headers, "Content-Type": "application/json" } },
      );
    } finally {
      inflightMint.delete(user.id);
    }

    tokenCache.set(user.id, {
      token: minted.token,
      key_id: minted.key_id,
      expires_at_ms: Date.now() + TOKEN_TTL_SECONDS * 1000,
    });

    /* ── RETURN SCOPED TOKEN ────────────────────────────────────────────── */
    return new Response(
      JSON.stringify({
        token: minted.token,
        expires_in: minted.expires_in,
        key_id: minted.key_id,
        type: "scoped",
        cached: false,
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[deepgram-token] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...headers, "Content-Type": "application/json" } },
    );
  }
});
