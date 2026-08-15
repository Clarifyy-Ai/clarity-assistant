// supabase/functions/support-chat/index.ts
// Public Live Chat widget gateway (guest + optional authenticated).
// Writes into support_threads / support_messages for Admin Live Chat.

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import {
  authenticateRequest,
  extractBearerToken,
} from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
} from "../_shared/rateLimit.ts";

const FUNCTION_NAME = "support-chat";
const MAX_BODY = 4000;
const MAX_NAME = 80;
const MAX_SUBJECT = 120;

function json(corsHeaders: HeadersInit, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return null;
  return email;
}

function normalizeText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim().replace(/\s+/g, " ");
  if (!text || text.length > max) return null;
  return text;
}

/** Anon/publishable bearer is expected for guests — skip getUser round-trip. */
function isAnonOrMissingBearer(req: Request): boolean {
  const token = extractBearerToken(req);
  if (!token) return true;
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const publishable = (Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "").trim();
  if (anon && token === anon) return true;
  if (publishable && token === publishable) return true;
  return false;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return json(corsHeaders, { error: "Method not allowed", code: "INVALID_REQUEST" }, 405);
    }

    const db = createServiceClient();
    const ip = clientIp(req);
    const rl = await checkRateLimitAsync(db, {
      key: createRateLimitKey(FUNCTION_NAME, ip),
      limit: 30,
      windowMs: 60_000,
    });
    if (!rl.allowed) {
      return withCorsHeaders(req, rateLimitResponse(rl));
    }

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return json(corsHeaders, { error: "Invalid JSON body", code: "INVALID_REQUEST" }, 400);
    }

    const guestEmailKey = normalizeEmail(body.guest_email);
    const guestTokenRaw =
      typeof body.guest_token === "string" && body.guest_token.length >= 16
        ? body.guest_token
        : null;
    if (guestEmailKey) {
      const emailRl = await checkRateLimitAsync(db, {
        key: createRateLimitKey(FUNCTION_NAME, `email:${guestEmailKey}`),
        limit: 8,
        windowMs: 60_000,
      });
      if (!emailRl.allowed) {
        return withCorsHeaders(req, rateLimitResponse(emailRl));
      }
    }
    if (guestTokenRaw) {
      const tokenRl = await checkRateLimitAsync(db, {
        key: createRateLimitKey(FUNCTION_NAME, `guest:${guestTokenRaw}`),
        limit: 8,
        windowMs: 60_000,
      });
      if (!tokenRl.allowed) {
        return withCorsHeaders(req, rateLimitResponse(tokenRl));
      }
    }

    const action = String(body.action ?? "");
    // Optional auth — guests chat with name/email + token; ignore auth failures.
    let userId: string | null = null;
    if (!isAnonOrMissingBearer(req)) {
      const auth = await authenticateRequest(req);
      userId = auth.context?.user?.id ?? null;
    }

    if (action === "start") {
      const message = normalizeText(body.message, MAX_BODY);
      if (!message) {
        return json(corsHeaders, { error: "Message is required", code: "INVALID_REQUEST" }, 400);
      }

      const guestName = normalizeText(body.guest_name, MAX_NAME);
      const guestEmail = normalizeEmail(body.guest_email);
      const subject =
        normalizeText(body.subject, MAX_SUBJECT) ??
        (message.length > 60 ? `${message.slice(0, 57)}…` : message);

      if (!userId && (!guestEmail || !guestName)) {
        return json(
          corsHeaders,
          { error: "Name and email are required", code: "INVALID_REQUEST" },
          400,
        );
      }

      const guestToken = userId
        ? null
        : (typeof body.guest_token === "string" && body.guest_token.length >= 16
          ? body.guest_token
          : crypto.randomUUID());

      // Reuse an open guest thread for the same token when possible.
      if (!userId && guestToken) {
        const { data: existing } = await db
          .from("support_threads")
          .select("id")
          .eq("guest_token", guestToken)
          .in("status", ["open", "pending"])
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          const { error: msgErr } = await db.from("support_messages").insert({
            thread_id: existing.id,
            sender_id: null,
            sender_role: "user",
            body: message,
          });
          if (msgErr) {
            return json(corsHeaders, { error: msgErr.message, code: "DB_ERROR" }, 500);
          }
          const { data: messages } = await db
            .from("support_messages")
            .select("id, thread_id, sender_role, body, created_at")
            .eq("thread_id", existing.id)
            .order("created_at", { ascending: true });
          return json(corsHeaders, {
            thread_id: existing.id,
            guest_token: guestToken,
            messages: messages ?? [],
          });
        }
      }

      // Reuse open authenticated thread.
      if (userId) {
        const { data: existing } = await db
          .from("support_threads")
          .select("id")
          .eq("user_id", userId)
          .in("status", ["open", "pending"])
          .order("last_message_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          const { error: msgErr } = await db.from("support_messages").insert({
            thread_id: existing.id,
            sender_id: userId,
            sender_role: "user",
            body: message,
          });
          if (msgErr) {
            return json(corsHeaders, { error: msgErr.message, code: "DB_ERROR" }, 500);
          }
          const { data: messages } = await db
            .from("support_messages")
            .select("id, thread_id, sender_role, body, created_at")
            .eq("thread_id", existing.id)
            .order("created_at", { ascending: true });
          return json(corsHeaders, {
            thread_id: existing.id,
            guest_token: null,
            messages: messages ?? [],
          });
        }
      }

      const { data: thread, error: threadErr } = await db
        .from("support_threads")
        .insert({
          user_id: userId,
          subject,
          status: "open",
          priority: "normal",
          guest_email: userId ? null : guestEmail,
          guest_name: userId ? null : guestName,
          guest_token: guestToken,
          unread_for_admin: true,
          unread_for_user: false,
          last_message_preview: message.slice(0, 140),
        })
        .select("id")
        .single();

      if (threadErr || !thread) {
        return json(
          corsHeaders,
          { error: threadErr?.message ?? "Failed to create thread", code: "DB_ERROR" },
          500,
        );
      }

      const { error: msgErr } = await db.from("support_messages").insert({
        thread_id: thread.id,
        sender_id: userId,
        sender_role: "user",
        body: message,
      });
      if (msgErr) {
        return json(corsHeaders, { error: msgErr.message, code: "DB_ERROR" }, 500);
      }

      const { data: messages } = await db
        .from("support_messages")
        .select("id, thread_id, sender_role, body, created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true });

      return json(corsHeaders, {
        thread_id: thread.id,
        guest_token: guestToken,
        messages: messages ?? [],
      });
    }

    if (action === "send" || action === "list") {
      const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
      const guestToken =
        typeof body.guest_token === "string" && body.guest_token.length >= 16
          ? body.guest_token
          : null;

      if (!threadId) {
        return json(corsHeaders, { error: "thread_id required", code: "INVALID_REQUEST" }, 400);
      }

      const { data: thread, error: threadErr } = await db
        .from("support_threads")
        .select("id, user_id, guest_token, status")
        .eq("id", threadId)
        .maybeSingle();

      if (threadErr || !thread) {
        return json(corsHeaders, { error: "Thread not found", code: "NOT_FOUND" }, 404);
      }

      const ownsAsUser = Boolean(userId && thread.user_id === userId);
      const ownsAsGuest = Boolean(
        guestToken && thread.guest_token && thread.guest_token === guestToken,
      );
      if (!ownsAsUser && !ownsAsGuest) {
        return json(corsHeaders, { error: "Forbidden", code: "FORBIDDEN" }, 403);
      }

      if (action === "list") {
        const { data: messages } = await db
          .from("support_messages")
          .select("id, thread_id, sender_role, body, created_at")
          .eq("thread_id", threadId)
          .order("created_at", { ascending: true });

        if (ownsAsUser || ownsAsGuest) {
          await db
            .from("support_threads")
            .update({ unread_for_user: false })
            .eq("id", threadId);
        }

        return json(corsHeaders, {
          thread_id: threadId,
          status: thread.status,
          messages: messages ?? [],
        });
      }

      const message = normalizeText(body.message, MAX_BODY);
      if (!message) {
        return json(corsHeaders, { error: "Message is required", code: "INVALID_REQUEST" }, 400);
      }
      if (thread.status === "resolved" || thread.status === "snoozed") {
        await db.from("support_threads").update({ status: "open" }).eq("id", threadId);
      }

      const { error: msgErr } = await db.from("support_messages").insert({
        thread_id: threadId,
        sender_id: ownsAsUser ? userId : null,
        sender_role: "user",
        body: message,
      });
      if (msgErr) {
        return json(corsHeaders, { error: msgErr.message, code: "DB_ERROR" }, 500);
      }

      const { data: messages } = await db
        .from("support_messages")
        .select("id, thread_id, sender_role, body, created_at")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      return json(corsHeaders, {
        thread_id: threadId,
        messages: messages ?? [],
      });
    }

    return json(corsHeaders, { error: `Unknown action: ${action}`, code: "INVALID_REQUEST" }, 400);
  } catch (err) {
    console.error("[support-chat] unhandled", err instanceof Error ? err.message : err);
    return json(
      corsHeaders,
      { error: "Live chat is temporarily unavailable. Please try again.", code: "INTERNAL" },
      500,
    );
  }
});
