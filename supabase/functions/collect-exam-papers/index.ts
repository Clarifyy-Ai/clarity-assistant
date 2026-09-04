/**
 * collect-exam-papers — admin-only scraper for allowlisted official exam portals.
 * Discovers PDF links on public listing pages, extracts MCQs via Gemini, saves to questions bank.
 */

import { handleCors } from "../_shared/cors.ts";
import { requireAuth, errorResponse, successResponse } from "../_shared/utils.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  createRateLimitKey,
  enforceRateLimitAsync,
  RATE_LIMIT_PRESETS,
} from "../_shared/rateLimit.ts";
import { collectExamPapers, sanitizeText } from "../_shared/collectExamPapers.ts";
import { resolveGeminiApiKey } from "../_shared/geminiKey.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== "POST") {
      return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
    }

    const auth = await requireAuth(req);
    await requireAdmin(auth.userId);

    const db = createServiceClient();
    const rateLimited = await enforceRateLimitAsync(db, {
      key: createRateLimitKey("collect-exam-papers", auth.userId),
      ...RATE_LIMIT_PRESETS.BULK_INGEST,
    });
    if (rateLimited) return rateLimited;

    if (!resolveGeminiApiKey()) {
      return errorResponse(
        "Gemini API key not configured on Supabase (GOOGLE_API_KEY or GEMINI_API_KEY)",
        "CONFIG_ERROR",
        503,
        req,
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawExam = sanitizeText(body.exam_type, 64) || "JEE_MAIN";
    const year = Number(body.year) || new Date().getFullYear() - 1;
    const listingUrl = sanitizeText(body.listing_url, 500);
    const systemUserId = Deno.env.get("SYSTEM_USER_ID") ?? auth.userId;

    const result = await collectExamPapers({
      db,
      examTypeRaw: rawExam,
      year,
      listingUrl: listingUrl || undefined,
      maxPdfs: 5,
      systemUserId,
    });

    if (result.message === "NO_LISTING") {
      return errorResponse(
        result.errors?.[0] ?? "No listing URL configured for this exam.",
        "NO_LISTING",
        400,
        req,
      );
    }
    if (result.message === "FORBIDDEN_URL") {
      return errorResponse(
        result.errors?.[0] ?? "Listing URL not on allowlist",
        "FORBIDDEN_URL",
        403,
        req,
      );
    }

    return successResponse(
      {
        imported: result.imported,
        pdfs_processed: result.pdfs_processed,
        pdfs_found: result.pdfs_found,
        exam_type: result.exam_type,
        year: result.year,
        errors: result.errors,
        message: result.message,
      },
      undefined,
      200,
      req,
    );
  } catch (err) {
    console.error("[collect-exam-papers]", err);
    const message = err instanceof Error ? err.message : "Internal error";
    const status = message.includes("Admin") ? 403 : 500;
    return errorResponse(message, "INTERNAL", status, req);
  }
});
