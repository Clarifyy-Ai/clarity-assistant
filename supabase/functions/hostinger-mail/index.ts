/**
 * hostinger-mail — admin-only proxy to Hostinger Mail API.
 * Token stays on the Edge. Never returned in JSON.
 */

import { handleCors, withCorsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  errorResponse,
  successResponse,
  getAdminClient,
} from "../_shared/utils.ts";
import { enforceAdmin } from "../_shared/auth.ts";
import { enforceEmailRateLimitAsync } from "../_shared/rateLimit.ts";
import {
  encodeFolder,
  ensureTrackingFolders,
  hostingerFetch,
  hostingerMailAddress,
  hostingerMailToken,
  isHostingerMailConfigured,
  listHostingerFolders,
  resolveMailbox,
  sendHostingerEmail,
} from "../_shared/hostingerMail.ts";

const ACTIONS = new Set(["status", "folders", "list", "get", "text", "send", "flags", "ensure-folders"]);

type ActionBody = {
  action?: unknown;
  folder?: unknown;
  page?: unknown;
  uid?: unknown;
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  html?: unknown;
  inReplyTo?: unknown;
  addFlags?: unknown;
  removeFlags?: unknown;
  uids?: unknown;
  ensure?: unknown;
};

function sanitizeFolder(raw: unknown): string {
  const folder = typeof raw === "string" ? raw.trim() : "INBOX";
  if (!folder || folder.length > 100) return "INBOX";
  if (!/^[\w .@+-]+$/.test(folder)) return "INBOX";
  return folder;
}

function parseUid(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

function parseEmailList(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  return list
    .map((addr) => String(addr ?? "").trim())
    .filter((addr) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr))
    .slice(0, 20);
}

function assertNoTokenLeak(payload: unknown): void {
  const token = hostingerMailToken();
  if (!token) return;
  if (JSON.stringify(payload).includes(token)) {
    throw new Error("Refusing to serialize a secret.");
  }
}

async function parseHostingerJson(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 200) };
  }
}

function hostingerErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    if (typeof rec.error === "string" && rec.error.trim()) return rec.error.slice(0, 300);
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message.slice(0, 300);
  }
  return fallback;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const auth = await requireAuth(req);
    const denied = await enforceAdmin(auth.userId, req);
    if (denied) return denied;

    const body = (await req.json().catch(() => ({}))) as ActionBody;
    const action = typeof body.action === "string" ? body.action.trim() : "";
    if (!ACTIONS.has(action)) {
      return errorResponse("Unknown mail action", "VALIDATION_ERROR", 400, req);
    }

    if (!isHostingerMailConfigured()) {
      if (action === "status") {
        const payload = {
          configured: false,
          address: hostingerMailAddress(),
          quotaPercent: null,
          quota: null,
          lastError: "HOSTINGER_MAIL_API_TOKEN is not set.",
          fetchedAt: new Date().toISOString(),
        };
        assertNoTokenLeak(payload);
        return successResponse(payload, undefined, 200, req);
      }
      return errorResponse(
        "Hostinger Mail is not configured.",
        "PROVIDER_UNAVAILABLE",
        503,
        req,
      );
    }

    if (action === "status") {
      try {
        const mailbox = await resolveMailbox();
        const quotaRes = await hostingerFetch(`/api/v1/mailboxes/${mailbox.resourceId}/quota`);
        const quotaBody = await parseHostingerJson(quotaRes);
        const quotaData =
          quotaBody && typeof quotaBody === "object"
            ? ((quotaBody as { data?: Record<string, unknown> }).data ?? null)
            : null;
        const quotaPercent =
          quotaData && typeof quotaData.totalPercentage === "number"
            ? quotaData.totalPercentage
            : null;
        const payload = {
          configured: true,
          address: mailbox.address,
          quotaPercent,
          quota: quotaData
            ? {
                totalUsage: quotaData.totalUsage ?? null,
                totalLimit: quotaData.totalLimit ?? null,
                totalPercentage: quotaData.totalPercentage ?? null,
                supported: quotaData.supported ?? null,
              }
            : null,
          lastError: quotaRes.ok ? null : hostingerErrorMessage(quotaBody, "Quota lookup failed."),
          fetchedAt: new Date().toISOString(),
        };
        assertNoTokenLeak(payload);
        return successResponse(payload, undefined, 200, req);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not reach Hostinger Mail.";
        const payload = {
          configured: true,
          address: hostingerMailAddress(),
          quotaPercent: null,
          quota: null,
          lastError: message.slice(0, 300),
          fetchedAt: new Date().toISOString(),
        };
        assertNoTokenLeak(payload);
        return successResponse(payload, undefined, 200, req);
      }
    }

    const mailbox = await resolveMailbox();
    const folder = sanitizeFolder(body.folder);
    const folderEnc = encodeFolder(folder);

    if (action === "folders" || action === "ensure-folders") {
      const ensure = action === "ensure-folders" || body.ensure === true;
      const result = ensure
        ? await ensureTrackingFolders(mailbox.resourceId)
        : { created: [] as string[], existing: [] as string[], folders: await listHostingerFolders(mailbox.resourceId) };
      const payload = {
        folders: result.folders,
        created: result.created,
        existing: result.existing,
      };
      assertNoTokenLeak(payload);
      return successResponse(payload, undefined, 200, req);
    }

    if (action === "list") {
      const page = Math.max(1, Number(body.page) || 1);
      const res = await hostingerFetch(
        `/api/v1/mailboxes/${mailbox.resourceId}/folders/${folderEnc}/messages?page=${page}&perPage=25&sort=-date`,
      );
      const parsed = await parseHostingerJson(res);
      if (!res.ok) {
        return errorResponse(
          hostingerErrorMessage(parsed, "Could not list messages."),
          "PROVIDER_UNAVAILABLE",
          res.status >= 500 ? 503 : res.status,
          req,
        );
      }
      const envelope = parsed as { data?: unknown; pagination?: unknown };
      const payload = {
        folder,
        messages: envelope?.data ?? [],
        pagination: envelope?.pagination ?? null,
      };
      assertNoTokenLeak(payload);
      return successResponse(payload, undefined, 200, req);
    }

    if (action === "get" || action === "text") {
      const uid = parseUid(body.uid);
      if (!uid) return errorResponse("Invalid message uid", "VALIDATION_ERROR", 400, req);
      const suffix = action === "text" ? "/text" : "";
      const res = await hostingerFetch(
        `/api/v1/mailboxes/${mailbox.resourceId}/folders/${folderEnc}/messages/${uid}${suffix}`,
      );
      const parsed = await parseHostingerJson(res);
      if (!res.ok) {
        return errorResponse(
          hostingerErrorMessage(parsed, "Could not load message."),
          res.status === 404 ? "NOT_FOUND" : "PROVIDER_UNAVAILABLE",
          res.status >= 500 ? 503 : res.status,
          req,
        );
      }
      const data = (parsed as { data?: unknown })?.data ?? parsed;
      const payload = action === "text" ? { folder, uid, ...(data as object) } : { folder, uid, message: data };
      assertNoTokenLeak(payload);
      return successResponse(payload, undefined, 200, req);
    }

    if (action === "flags") {
      const uid = parseUid(body.uid);
      const extraUids = Array.isArray(body.uids)
        ? body.uids.map(parseUid).filter((n): n is number => n !== null)
        : [];
      const uids = uid ? [uid, ...extraUids] : extraUids;
      if (uids.length === 0) {
        return errorResponse("Message uid is required", "VALIDATION_ERROR", 400, req);
      }
      const addFlags = Array.isArray(body.addFlags)
        ? body.addFlags.map((f) => String(f)).filter(Boolean).slice(0, 8)
        : ["\\Seen"];
      const res = await hostingerFetch(
        `/api/v1/mailboxes/${mailbox.resourceId}/folders/${folderEnc}/messages/flags`,
        {
          method: "POST",
          body: JSON.stringify({ uids, addFlags }),
        },
      );
      const parsed = await parseHostingerJson(res);
      if (!res.ok && res.status !== 207) {
        return errorResponse(
          hostingerErrorMessage(parsed, "Could not update flags."),
          "PROVIDER_UNAVAILABLE",
          res.status >= 500 ? 503 : res.status,
          req,
        );
      }
      const payload = { ok: true, folder, uids };
      assertNoTokenLeak(payload);
      return successResponse(payload, undefined, 200, req);
    }

    if (action === "send") {
      const rateLimited = await enforceEmailRateLimitAsync(
        getAdminClient(),
        "hostinger-mail",
        auth.userId,
      );
      if (rateLimited) return withCorsHeaders(req, rateLimited);

      const to = parseEmailList(body.to);
      const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 500) : "";
      const text = typeof body.text === "string" ? body.text.slice(0, 50_000) : undefined;
      const html = typeof body.html === "string" ? body.html.slice(0, 80_000) : undefined;
      if (to.length === 0) {
        return errorResponse("Recipient is required", "VALIDATION_ERROR", 400, req);
      }
      if (!subject) {
        return errorResponse("Subject is required", "VALIDATION_ERROR", 400, req);
      }

      let inReplyTo: { uid: number; folder: string } | undefined;
      if (body.inReplyTo && typeof body.inReplyTo === "object") {
        const ref = body.inReplyTo as { uid?: unknown; folder?: unknown };
        const replyUid = parseUid(ref.uid);
        if (replyUid) {
          inReplyTo = { uid: replyUid, folder: sanitizeFolder(ref.folder ?? folder) };
        }
      }

      const result = await sendHostingerEmail({
        to,
        subject,
        text,
        html,
        inReplyTo,
      });
      if (!result.ok) {
        return errorResponse(
          result.error ?? "Could not send mail.",
          "EMAIL_UNAVAILABLE",
          result.status >= 400 && result.status < 500 ? result.status : 503,
          req,
        );
      }
      const payload = { ok: true };
      assertNoTokenLeak(payload);
      return successResponse(payload, undefined, 200, req);
    }

    return errorResponse("Unknown mail action", "VALIDATION_ERROR", 400, req);
  } catch (err) {
    if (err instanceof Response) {
      return withCorsHeaders(req, err);
    }
    const message = err instanceof Error ? err.message : "Internal error";
    const code =
      err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : "INTERNAL_ERROR";
    const status =
      err && typeof err === "object" && "status" in err && typeof (err as { status: unknown }).status === "number"
        ? (err as { status: number }).status
        : 500;
    return errorResponse(message.slice(0, 300), code, status >= 400 ? status : 500, req);
  }
});
