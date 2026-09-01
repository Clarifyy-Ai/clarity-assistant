// supabase/functions/support-chat/index.ts
// Hybrid Live Chat: deterministic account state first, limited AI, human queue.

import { handleCors, getCorsHeaders, withCorsHeaders } from "../_shared/cors.ts";
import {
  authenticateRequest,
  extractBearerToken,
  isAdmin,
} from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  checkRateLimitAsync,
  createRateLimitKey,
  rateLimitResponse,
} from "../_shared/rateLimit.ts";
import {
  ACCOUNT_HOWTO_REPLY,
  classifySupportRequest,
  type SupportCategory,
} from "../_shared/supportClassify.ts";
import {
  chipWelcome,
  formatDeterministicReply,
  loadOwnedSupportSnapshot,
  type SupportSnapshot,
} from "../_shared/supportContext.ts";
import { generateWithFallback } from "../_shared/aiProvider.ts";

const FUNCTION_NAME = "support-chat";
const MAX_BODY = 4000;
const MAX_NAME = 80;
const MAX_SUBJECT = 120;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const MESSAGE_SELECT =
  "id, thread_id, sender_role, sender_type, body, created_at, delivery_status, client_message_id, operation_id";

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

function isAnonOrMissingBearer(req: Request): boolean {
  const token = extractBearerToken(req);
  if (!token) return true;
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const publishable = (Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "").trim();
  if (anon && token === anon) return true;
  if (publishable && token === publishable) return true;
  return false;
}

function parseHint(raw: unknown): { exam_id?: string; job_id?: string; document_id?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const hint: { exam_id?: string; job_id?: string; document_id?: string } = {};
  if (typeof o.exam_id === "string" && o.exam_id.length < 80) hint.exam_id = o.exam_id;
  if (typeof o.job_id === "string" && o.job_id.length < 80) hint.job_id = o.job_id;
  if (typeof o.document_id === "string" && o.document_id.length < 80) hint.document_id = o.document_id;
  return Object.keys(hint).length ? hint : null;
}

async function loadMessages(db: ReturnType<typeof createServiceClient>, threadId: string) {
  const { data } = await db
    .from("support_messages")
    .select(MESSAGE_SELECT)
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

async function insertEvent(
  db: ReturnType<typeof createServiceClient>,
  row: {
    thread_id: string;
    actor_id?: string | null;
    event_type: string;
    visibility?: "internal" | "user";
    body?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.from("support_events").insert({
    thread_id: row.thread_id,
    actor_id: row.actor_id ?? null,
    event_type: row.event_type,
    visibility: row.visibility ?? "internal",
    body: row.body ?? null,
    metadata: row.metadata ?? {},
  });
}

function roleForSenderType(senderType: string): "user" | "admin" | "system" {
  if (senderType === "agent") return "admin";
  if (senderType === "user") return "user";
  return "system";
}

async function insertMessage(
  db: ReturnType<typeof createServiceClient>,
  row: {
    thread_id: string;
    sender_id: string | null;
    sender_type: "user" | "ai" | "agent" | "system";
    body: string;
    client_message_id?: string | null;
    operation_id?: string | null;
  },
) {
  const { data, error } = await db
    .from("support_messages")
    .insert({
      thread_id: row.thread_id,
      sender_id: row.sender_id,
      sender_role: roleForSenderType(row.sender_type),
      sender_type: row.sender_type,
      body: row.body,
      client_message_id: row.client_message_id ?? null,
      operation_id: row.operation_id ?? null,
      delivery_status: "sent",
    })
    .select(MESSAGE_SELECT)
    .maybeSingle();
  return { data, error };
}

async function findOpenThread(
  db: ReturnType<typeof createServiceClient>,
  userId: string | null,
  guestToken: string | null,
) {
  let q = db
    .from("support_threads")
    .select(
      "id, user_id, guest_token, status, mode, category, public_ref, source_path, context_snapshot, summary, assigned_admin_id, last_message_preview",
    )
    .in("status", ["open", "pending"])
    .order("last_message_at", { ascending: false })
    .limit(1);
  if (userId) q = q.eq("user_id", userId);
  else if (guestToken) q = q.eq("guest_token", guestToken);
  else return null;
  const { data } = await q.maybeSingle();
  return data;
}

function threadPayload(thread: Record<string, unknown>, messages: unknown[]) {
  return {
    thread_id: thread.id,
    public_ref: thread.public_ref ?? null,
    status: thread.status,
    mode: thread.mode,
    category: thread.category,
    assigned_admin_id: thread.assigned_admin_id ?? null,
    messages,
  };
}

async function produceReply(opts: {
  db: ReturnType<typeof createServiceClient>;
  threadId: string;
  ownerUserId: string | null;
  message: string;
  category: string | null;
  sourcePath: string | null;
  resourceHint: { exam_id?: string; job_id?: string; document_id?: string } | null;
  escalateRequested: boolean;
  summary: string | null;
}): Promise<{ mode: string; snapshot: SupportSnapshot; usedAi: boolean }> {
  const classified = classifySupportRequest({
    message: opts.message,
    category: opts.category,
    sourcePath: opts.sourcePath,
    resourceHint: opts.resourceHint,
    escalateRequested: opts.escalateRequested,
  });

  await opts.db
    .from("support_threads")
    .update({ category: classified.category })
    .eq("id", opts.threadId);

  if (classified.intent === "escalate") {
    await insertMessage(opts.db, {
      thread_id: opts.threadId,
      sender_id: null,
      sender_type: "system",
      body: "A support agent will join this conversation. You do not need to repeat the details already in this chat.",
    });
    await opts.db
      .from("support_threads")
      .update({ mode: "waiting_agent", status: "pending" })
      .eq("id", opts.threadId);
    await insertEvent(opts.db, {
      thread_id: opts.threadId,
      event_type: "escalate",
      visibility: "user",
      body: "Escalated to human support",
    });
    return { mode: "waiting_agent", snapshot: {}, usedAi: false };
  }

  const snapshot = await loadOwnedSupportSnapshot(
    opts.db,
    opts.ownerUserId,
    classified.intent,
    opts.resourceHint,
  );
  await opts.db
    .from("support_threads")
    .update({ context_snapshot: snapshot })
    .eq("id", opts.threadId);

  const deterministic =
    classified.intent === "account_howto"
      ? ACCOUNT_HOWTO_REPLY
      : classified.intent === "faq"
        ? chipWelcome(classified.category)
        : formatDeterministicReply(classified.intent, snapshot);

  if (deterministic && !classified.useAi) {
    await insertMessage(opts.db, {
      thread_id: opts.threadId,
      sender_id: null,
      sender_type: "system",
      body: deterministic,
    });
    return { mode: "ai", snapshot, usedAi: false };
  }

  if (!classified.useAi && !deterministic) {
    await insertMessage(opts.db, {
      thread_id: opts.threadId,
      sender_id: null,
      sender_type: "system",
      body: chipWelcome(classified.category),
    });
    return { mode: "ai", snapshot, usedAi: false };
  }

  const aiLimit = await checkRateLimitAsync(opts.db, {
    key: createRateLimitKey(FUNCTION_NAME, `ai:${opts.ownerUserId ?? opts.threadId}`),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!aiLimit.allowed) {
    await insertMessage(opts.db, {
      thread_id: opts.threadId,
      sender_id: null,
      sender_type: "system",
      body: deterministic
        ?? "I could not generate an AI explanation right now because of a support-chat limit. Choose Talk to Support and an agent will pick this up.",
    });
    return { mode: "ai", snapshot, usedAi: false };
  }

  const operationId = crypto.randomUUID();
  const idempotencyKey = `${opts.threadId}:${opts.message.slice(0, 80)}`;
  const { data: existingOp } = await opts.db
    .from("support_ai_operations")
    .select("operation_id, status")
    .eq("thread_id", opts.threadId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existingOp?.status === "running" || existingOp?.status === "succeeded") {
    return { mode: "ai", snapshot, usedAi: true };
  }

  await opts.db.from("support_ai_operations").insert({
    operation_id: operationId,
    thread_id: opts.threadId,
    user_id: opts.ownerUserId,
    status: "running",
    prompt_version: "support-v1",
    idempotency_key: idempotencyKey,
  });

  const recent = await opts.db
    .from("support_messages")
    .select("sender_type, body")
    .eq("thread_id", opts.threadId)
    .order("created_at", { ascending: false })
    .limit(6);
  const recentLines = (recent.data ?? [])
    .reverse()
    .map((m: { sender_type?: string; body?: string }) => `${m.sender_type ?? "user"}: ${String(m.body ?? "").slice(0, 240)}`)
    .join("\n");

  const prompt = [
    `Summary: ${opts.summary || "Support conversation on Career Pilot."}`,
    `Current context: ${JSON.stringify(snapshot).slice(0, 800)}`,
    `Recent:\n${recentLines}`,
    `User: ${opts.message}`,
    "Answer as Career Pilot Support. Do not invent payment, credit, or exam job facts. If unsure, tell the user to Talk to Support.",
  ].join("\n\n");

  try {
    const ai = await generateWithFallback({
      prompt,
      systemPrompt:
        "You are Career Pilot support. Ordinary support chat does not consume the user's practice credits. Be concise.",
      maxTokens: 400,
      temperature: 0.3,
      action: "support_chat",
      userId: opts.ownerUserId ?? undefined,
    });
    await insertMessage(opts.db, {
      thread_id: opts.threadId,
      sender_id: null,
      sender_type: "ai",
      body: ai.text.trim().slice(0, MAX_BODY),
      operation_id: operationId,
    });
    await opts.db
      .from("support_ai_operations")
      .update({
        status: "succeeded",
        provider: ai.provider,
        model: ai.model,
        input_tokens: ai.inputTokens ?? null,
        output_tokens: ai.outputTokens ?? null,
        total_tokens: (ai.inputTokens ?? 0) + (ai.outputTokens ?? 0),
        completed_at: new Date().toISOString(),
      })
      .eq("operation_id", operationId);
    return { mode: "ai", snapshot, usedAi: true };
  } catch (err) {
    const fallback =
      deterministic ??
      "I could not complete an AI explanation. Here is what I can see from your account, or choose Talk to Support.";
    await insertMessage(opts.db, {
      thread_id: opts.threadId,
      sender_id: null,
      sender_type: "system",
      body: fallback,
    });
    await opts.db
      .from("support_ai_operations")
      .update({
        status: "failed",
        error_code: err instanceof Error ? err.message.slice(0, 120) : "AI_FAILED",
        completed_at: new Date().toISOString(),
      })
      .eq("operation_id", operationId);
    return { mode: "ai", snapshot, usedAi: false };
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  try {
    if (req.method !== "POST") {
      return json(corsHeaders, { error: "Method is not allowed", code: "INVALID_REQUEST" }, 405);
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
      if (!emailRl.allowed) return withCorsHeaders(req, rateLimitResponse(emailRl));
    }
    if (guestTokenRaw) {
      const tokenRl = await checkRateLimitAsync(db, {
        key: createRateLimitKey(FUNCTION_NAME, `guest:${guestTokenRaw}`),
        limit: 8,
        windowMs: 60_000,
      });
      if (!tokenRl.allowed) return withCorsHeaders(req, rateLimitResponse(tokenRl));
    }

    const action = String(body.action ?? "");
    let userId: string | null = null;
    if (!isAnonOrMissingBearer(req)) {
      const auth = await authenticateRequest(req);
      userId = auth.context?.user?.id ?? null;
    }
    const admin = userId ? await isAdmin(userId) : false;

    const guestTokenForAuth =
      typeof body.guest_token === "string" && body.guest_token.length >= 16
        ? body.guest_token
        : null;

    async function loadOwnedThread(threadId: string) {
      const { data: thread, error } = await db
        .from("support_threads")
        .select(
          "id, user_id, guest_token, status, mode, category, public_ref, source_path, context_snapshot, summary, assigned_admin_id",
        )
        .eq("id", threadId)
        .maybeSingle();
      if (error || !thread) return { thread: null, forbidden: false as const };
      const ownsAsUser = Boolean(userId && thread.user_id === userId);
      const ownsAsGuest = Boolean(
        guestTokenForAuth && thread.guest_token && thread.guest_token === guestTokenForAuth,
      );
      if (!ownsAsUser && !ownsAsGuest && !admin) return { thread: null, forbidden: true as const };
      return { thread, forbidden: false as const };
    }

    if (action === "bootstrap") {
      const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
      if (threadId) {
        const loaded = await loadOwnedThread(threadId);
        if (loaded.forbidden) {
          return json(corsHeaders, { error: "Forbidden", code: "FORBIDDEN" }, 403);
        }
        if (loaded.thread) {
          const messages = await loadMessages(db, loaded.thread.id);
          if (userId || guestTokenForAuth) {
            await db.from("support_threads").update({ unread_for_user: false }).eq("id", loaded.thread.id);
          }
          return json(corsHeaders, {
            ...threadPayload(loaded.thread, messages),
            guest_token: loaded.thread.guest_token,
          });
        }
      }
      const existing = await findOpenThread(db, userId, userId ? null : guestTokenForAuth);
      if (!existing) {
        return json(corsHeaders, { thread_id: null, messages: [], mode: "ai", status: null });
      }
      const messages = await loadMessages(db, existing.id);
      return json(corsHeaders, {
        ...threadPayload(existing, messages),
        guest_token: existing.guest_token,
      });
    }

    if (action === "list_threads") {
      if (!userId) {
        return json(corsHeaders, { error: "Sign in to view previous conversations", code: "AUTH_REQUIRED" }, 401);
      }
      const { data } = await db
        .from("support_threads")
        .select("id, public_ref, subject, status, mode, category, last_message_at, last_message_preview")
        .eq("user_id", userId)
        .order("last_message_at", { ascending: false })
        .limit(20);
      return json(corsHeaders, { threads: data ?? [] });
    }

    if (action === "escalate") {
      const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
      if (!threadId) return json(corsHeaders, { error: "thread_id required", code: "INVALID_REQUEST" }, 400);
      const loaded = await loadOwnedThread(threadId);
      if (loaded.forbidden) return json(corsHeaders, { error: "Forbidden", code: "FORBIDDEN" }, 403);
      if (!loaded.thread) return json(corsHeaders, { error: "Thread not found", code: "NOT_FOUND" }, 404);
      await produceReply({
        db,
        threadId,
        ownerUserId: loaded.thread.user_id,
        message: "Talk to Support",
        category: loaded.thread.category,
        sourcePath: loaded.thread.source_path,
        resourceHint: null,
        escalateRequested: true,
        summary: loaded.thread.summary,
      });
      const messages = await loadMessages(db, threadId);
      const { data: refreshed } = await db
        .from("support_threads")
        .select("id, status, mode, category, public_ref, assigned_admin_id")
        .eq("id", threadId)
        .single();
      return json(corsHeaders, threadPayload(refreshed ?? loaded.thread, messages));
    }

    if (action === "attachment_url") {
      const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
      const contentType = typeof body.content_type === "string" ? body.content_type : "";
      const byteSize = Number(body.byte_size);
      const filename = typeof body.filename === "string" ? body.filename.replace(/[^\w.\-]+/g, "_").slice(0, 80) : "file";
      if (!threadId) return json(corsHeaders, { error: "thread_id required", code: "INVALID_REQUEST" }, 400);
      if (!ALLOWED_ATTACHMENT_TYPES.has(contentType) || !Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_ATTACHMENT_BYTES) {
        return json(corsHeaders, { error: "Unsupported file type or size (max 5 MB, PNG/JPEG/WebP/PDF).", code: "INVALID_REQUEST" }, 400);
      }
      const loaded = await loadOwnedThread(threadId);
      if (loaded.forbidden) return json(corsHeaders, { error: "Forbidden", code: "FORBIDDEN" }, 403);
      if (!loaded.thread) return json(corsHeaders, { error: "Thread not found", code: "NOT_FOUND" }, 404);
      const ownerFolder = loaded.thread.user_id ?? `guest-${(loaded.thread.guest_token ?? "x").slice(0, 8)}`;
      const objectPath = `${ownerFolder}/${threadId}/${crypto.randomUUID()}-${filename}`;
      const { data: signed, error: signErr } = await db.storage
        .from("support-attachments")
        .createSignedUploadUrl(objectPath);
      if (signErr || !signed) {
        return json(corsHeaders, { error: "Could not create upload URL", code: "STORAGE_ERROR" }, 500);
      }
      const { data: att, error: attErr } = await db
        .from("support_attachments")
        .insert({
          thread_id: threadId,
          storage_path: objectPath,
          content_type: contentType,
          byte_size: byteSize,
          uploaded_by: userId,
          scanned_status: "pending",
        })
        .select("id, storage_path")
        .single();
      if (attErr || !att) {
        return json(corsHeaders, { error: attErr?.message ?? "Could not record attachment", code: "DB_ERROR" }, 500);
      }
      return json(corsHeaders, {
        attachment_id: att.id,
        path: objectPath,
        token: signed.token,
        signed_url: signed.signedUrl,
      });
    }

    if (action === "attachment_confirm") {
      const attachmentId = typeof body.attachment_id === "string" ? body.attachment_id : "";
      const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
      if (!attachmentId || !threadId) {
        return json(corsHeaders, { error: "attachment_id and thread_id required", code: "INVALID_REQUEST" }, 400);
      }
      const loaded = await loadOwnedThread(threadId);
      if (loaded.forbidden) return json(corsHeaders, { error: "Forbidden", code: "FORBIDDEN" }, 403);
      if (!loaded.thread) return json(corsHeaders, { error: "Thread not found", code: "NOT_FOUND" }, 404);
      await db
        .from("support_attachments")
        .update({ scanned_status: "accepted" })
        .eq("id", attachmentId)
        .eq("thread_id", threadId);
      await insertMessage(db, {
        thread_id: threadId,
        sender_id: userId,
        sender_type: "user",
        body: "Attached a file for this support issue (not sent to AI automatically).",
      });
      const messages = await loadMessages(db, threadId);
      return json(corsHeaders, { ...threadPayload(loaded.thread, messages) });
    }

    if (action === "admin_reply" || action === "admin_note" || action === "admin_assign" || action === "admin_resolve" || action === "admin_reopen") {
      if (!userId || !admin) {
        return json(corsHeaders, { error: "Admin only", code: "FORBIDDEN" }, 403);
      }
      const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
      if (!threadId) return json(corsHeaders, { error: "thread_id required", code: "INVALID_REQUEST" }, 400);
      const { data: thread } = await db.from("support_threads").select("id, status, mode").eq("id", threadId).maybeSingle();
      if (!thread) return json(corsHeaders, { error: "Thread not found", code: "NOT_FOUND" }, 404);

      if (action === "admin_reply") {
        const message = normalizeText(body.message, MAX_BODY);
        if (!message) return json(corsHeaders, { error: "Message is required", code: "INVALID_REQUEST" }, 400);
        await insertMessage(db, {
          thread_id: threadId,
          sender_id: userId,
          sender_type: "agent",
          body: message,
        });
        await db
          .from("support_threads")
          .update({ mode: "agent", status: "open", assigned_admin_id: userId })
          .eq("id", threadId);
      } else if (action === "admin_note") {
        const note = normalizeText(body.message, MAX_BODY);
        if (!note) return json(corsHeaders, { error: "Note is required", code: "INVALID_REQUEST" }, 400);
        await insertEvent(db, {
          thread_id: threadId,
          actor_id: userId,
          event_type: "internal_note",
          visibility: "internal",
          body: note,
        });
      } else if (action === "admin_assign") {
        const assignee = typeof body.admin_id === "string" ? body.admin_id : userId;
        await db.from("support_threads").update({ assigned_admin_id: assignee, mode: "agent" }).eq("id", threadId);
        await db.from("support_assignments").insert({
          thread_id: threadId,
          admin_id: assignee,
          assigned_by: userId,
          action: "assign",
        });
        await insertEvent(db, {
          thread_id: threadId,
          actor_id: userId,
          event_type: "assign",
          body: `Assigned to ${assignee}`,
        });
      } else if (action === "admin_resolve") {
        await db.from("support_threads").update({ status: "resolved", mode: "resolved" }).eq("id", threadId);
        await insertEvent(db, { thread_id: threadId, actor_id: userId, event_type: "resolve", visibility: "user", body: "Marked resolved" });
        await insertMessage(db, {
          thread_id: threadId,
          sender_id: userId,
          sender_type: "system",
          body: "This conversation was marked resolved. Send a new message if you still need help.",
        });
      } else if (action === "admin_reopen") {
        await db.from("support_threads").update({ status: "open", mode: "agent" }).eq("id", threadId);
        await insertEvent(db, { thread_id: threadId, actor_id: userId, event_type: "reopen", visibility: "user", body: "Reopened" });
      }

      const messages = await loadMessages(db, threadId);
      const { data: events } = await db
        .from("support_events")
        .select("id, event_type, visibility, body, created_at, actor_id")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });
      const { data: refreshed } = await db.from("support_threads").select("*").eq("id", threadId).single();
      return json(corsHeaders, { ...threadPayload(refreshed ?? thread, messages), events: events ?? [] });
    }

    if (action === "start" || action === "send" || action === "list") {
      if (action === "list") {
        const threadId = typeof body.thread_id === "string" ? body.thread_id : "";
        if (!threadId) return json(corsHeaders, { error: "thread_id required", code: "INVALID_REQUEST" }, 400);
        const loaded = await loadOwnedThread(threadId);
        if (loaded.forbidden) return json(corsHeaders, { error: "Forbidden", code: "FORBIDDEN" }, 403);
        if (!loaded.thread) return json(corsHeaders, { error: "Thread not found", code: "NOT_FOUND" }, 404);
        const messages = await loadMessages(db, threadId);
        await db.from("support_threads").update({ unread_for_user: false }).eq("id", threadId);
        return json(corsHeaders, {
          ...threadPayload(loaded.thread, messages),
          guest_token: loaded.thread.guest_token,
        });
      }

      const message = normalizeText(body.message, MAX_BODY);
      if (!message) {
        return json(corsHeaders, { error: "Message is required", code: "INVALID_REQUEST" }, 400);
      }
      const clientMessageId =
        typeof body.client_message_id === "string" && body.client_message_id.length >= 8
          ? body.client_message_id
          : crypto.randomUUID();
      const category = typeof body.category === "string" ? body.category : null;
      const sourcePath = typeof body.page_path === "string" ? body.page_path.slice(0, 200) : null;
      const resourceHint = parseHint(body.resource_hint);
      const escalateRequested = body.escalate === true || /talk to support/i.test(message);
      const guestName = normalizeText(body.guest_name, MAX_NAME);
      const guestEmail = normalizeEmail(body.guest_email);

      let threadId = typeof body.thread_id === "string" ? body.thread_id : "";
      if (!threadId && action === "start") {
        if (!userId && (!guestEmail || !guestName)) {
          return json(corsHeaders, { error: "Name and email are required", code: "INVALID_REQUEST" }, 400);
        }
        const guestToken = userId
          ? null
          : (guestTokenForAuth ?? crypto.randomUUID());
        const existing = await findOpenThread(db, userId, guestToken);
        if (existing?.id) {
          threadId = existing.id;
        } else {
          const subject =
            normalizeText(body.subject, MAX_SUBJECT) ??
            (message.length > 60 ? `${message.slice(0, 57)}…` : message);
          const { data: thread, error: threadErr } = await db
            .from("support_threads")
            .insert({
              user_id: userId,
              subject,
              status: "open",
              mode: escalateRequested ? "waiting_agent" : "ai",
              category: (category as SupportCategory) || "general",
              source_path: sourcePath,
              priority: "normal",
              guest_email: userId ? null : guestEmail,
              guest_name: userId ? null : guestName,
              guest_token: guestToken,
              unread_for_admin: true,
              unread_for_user: false,
              last_message_preview: message.slice(0, 140),
            })
            .select("id, guest_token, user_id, status, mode, category, public_ref, summary, assigned_admin_id")
            .single();
          if (threadErr || !thread) {
            return json(corsHeaders, { error: threadErr?.message ?? "Failed to create thread", code: "DB_ERROR" }, 500);
          }
          threadId = thread.id;
          const inserted = await insertMessage(db, {
            thread_id: threadId,
            sender_id: userId,
            sender_type: "user",
            body: message,
            client_message_id: clientMessageId,
          });
          if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) {
            return json(corsHeaders, { error: inserted.error.message, code: "DB_ERROR" }, 500);
          }
          await produceReply({
            db,
            threadId,
            ownerUserId: userId,
            message,
            category,
            sourcePath,
            resourceHint,
            escalateRequested,
            summary: null,
          });
          const messages = await loadMessages(db, threadId);
          const { data: refreshed } = await db.from("support_threads").select("*").eq("id", threadId).single();
          return json(corsHeaders, {
            ...threadPayload(refreshed ?? thread, messages),
            guest_token: thread.guest_token,
          });
        }
      }

      if (!threadId) {
        return json(corsHeaders, { error: "thread_id required", code: "INVALID_REQUEST" }, 400);
      }

      const loaded = await loadOwnedThread(threadId);
      if (loaded.forbidden) return json(corsHeaders, { error: "Forbidden", code: "FORBIDDEN" }, 403);
      if (!loaded.thread) return json(corsHeaders, { error: "Thread not found", code: "NOT_FOUND" }, 404);

      if (loaded.thread.status === "resolved" || loaded.thread.status === "snoozed") {
        await db.from("support_threads").update({ status: "open", mode: "ai" }).eq("id", threadId);
      }

      const inserted = await insertMessage(db, {
        thread_id: threadId,
        sender_id: userId && loaded.thread.user_id === userId ? userId : null,
        sender_type: "user",
        body: message,
        client_message_id: clientMessageId,
      });
      if (inserted.error && /duplicate|unique/i.test(inserted.error.message)) {
        const messages = await loadMessages(db, threadId);
        return json(corsHeaders, {
          ...threadPayload(loaded.thread, messages),
          guest_token: loaded.thread.guest_token,
          reused: true,
        });
      }
      if (inserted.error) {
        return json(corsHeaders, { error: inserted.error.message, code: "DB_ERROR" }, 500);
      }

      if (sourcePath) {
        await db.from("support_threads").update({ source_path: sourcePath }).eq("id", threadId);
      }

      await produceReply({
        db,
        threadId,
        ownerUserId: loaded.thread.user_id,
        message,
        category: category ?? loaded.thread.category,
        sourcePath: sourcePath ?? loaded.thread.source_path,
        resourceHint,
        escalateRequested,
        summary: loaded.thread.summary,
      });

      const messages = await loadMessages(db, threadId);
      const { data: refreshed } = await db.from("support_threads").select("*").eq("id", threadId).single();
      return json(corsHeaders, {
        ...threadPayload(refreshed ?? loaded.thread, messages),
        guest_token: loaded.thread.guest_token,
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
