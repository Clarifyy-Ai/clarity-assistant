// parse-document — PDF/text extraction for documents table (cover letter, etc.)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/utils.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import {
  enforceAiRateLimitAsync,
} from "../_shared/rateLimit.ts";
import { validateUploadMime } from "../_shared/uploadValidation.ts";
import { creditCost } from "../_shared/creditEconomics.ts";

const PARSE_DOCUMENT_COST = creditCost("parse_document");

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function safeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function bytesToUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
    return s;
  }
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 2048));
  let nul = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) nul++;
  }
  return nul > 4;
}

async function extractWithGemini(
  base64: string,
  mimeType: string,
  docType: string
): Promise<{ full_text: string; summary: string } | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt =
    docType === "cover_letter"
      ? `Extract the full cover letter text from this document. Return JSON only:
{"full_text":"complete letter text","summary":"2-3 sentence summary for interview coaching"}`
      : `Extract all readable text. Return JSON only:
{"full_text":"...","summary":"brief summary"}`;

  const res = await fetch(
    `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!res.ok) return null;
  const json = await res.json();
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseJSON(
    raw.replace(/```json/gi, "").replace(/```/g, "").trim(),
    null
  ) as { full_text?: string; summary?: string } | null;

  if (!parsed?.full_text || parsed.full_text.length < 20) return null;
  return {
    full_text: String(parsed.full_text).slice(0, 50000),
    summary: String(parsed.summary ?? parsed.full_text).slice(0, 2000),
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { userId } = await requireAuth(req);

    const { data: profileRow } = await db
      .from("profiles")
      .select("plan_id")
      .eq("id", userId)
      .maybeSingle();

    const capabilityGate = requireCapabilityForFunction(
      profileRow?.plan_id,
      "parse-document",
      req,
    );
    if (capabilityGate) return capabilityGate;

    const rateLimited = await enforceAiRateLimitAsync(
      createServiceClient(),
      "parse-document",
      userId,
    );
    if (rateLimited) return rateLimited;

    const body = await req.json();
    const documentId = body?.document_id as string | undefined;
    const mimeType = (body?.mime_type as string) || "application/pdf";

    const mimeCheck = validateUploadMime(mimeType);
    if (!mimeCheck.ok) {
      return new Response(
        JSON.stringify({ error: mimeCheck.reason, code: "BAD_REQUEST" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const jdId = typeof body?.jd_id === "string" ? body.jd_id.trim() : "";
    if (jdId) {
      const { data: jd } = await db
        .from("job_descriptions")
        .select("id, user_id")
        .eq("id", jdId)
        .maybeSingle();

      if (!jd || jd.user_id !== userId) {
        return new Response(
          JSON.stringify({ error: "Document not found", code: "FORBIDDEN" }),
          { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const storagePrefix = `${userId}/job-descriptions`;
      const { data: objects, error: listError } = await db.storage
        .from("documents")
        .list(storagePrefix, { search: jdId, limit: 10 });

      if (listError || !objects?.length) {
        return new Response(
          JSON.stringify({ error: "Document file not found in storage", code: "NOT_FOUND" }),
          { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const match = objects.find((obj) => obj.name.includes(jdId));
      if (!match) {
        return new Response(
          JSON.stringify({ error: "Document file not found in storage", code: "NOT_FOUND" }),
          { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const filePath = `${storagePrefix}/${match.name}`;
      const { data: fileData, error: downloadError } = await db.storage
        .from("documents")
        .download(filePath);

      if (downloadError || !fileData) {
        return new Response(
          JSON.stringify({ error: "Failed to download file from storage", code: "SERVICE_UNAVAILABLE" }),
          { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const buf = await fileData.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
        return new Response(
          JSON.stringify({ error: "File empty or too large", code: "BAD_REQUEST" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      const creditResult = await deductCreditsAtomic({
        userId,
        action: "parse_document",
        cost: PARSE_DOCUMENT_COST,
        idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
      });
      if (!creditResult.success) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits.",
            code: "INSUFFICIENT_CREDITS",
            message: `Document parsing costs ${PARSE_DOCUMENT_COST} credits.`,
          }),
          {
            status: 402,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          },
        );
      }

      const fileBytes = new Uint8Array(buf);
      let extracted: { full_text: string; summary: string } | null = null;
      if (mimeCheck.mimeType === "text/plain") {
        if (looksBinary(fileBytes)) {
          await refundCredits({
            userId,
            cost: PARSE_DOCUMENT_COST,
            reason: "refund_parse_document_failed",
          });
          return new Response(
            JSON.stringify({
              error: "This file is not valid UTF-8 text.",
              code: "UNSUPPORTED_ENCODING",
            }),
            { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
          );
        }
        const text = bytesToUtf8(fileBytes).replace(/^\uFEFF/, "").trim();
        extracted = {
          full_text: text.slice(0, 50000),
          summary: text.slice(0, 400),
        };
      } else {
        extracted = await extractWithGemini(
          safeBase64(fileBytes),
          mimeCheck.mimeType,
          "job_description",
        );
      }

      if (!extracted) {
        await refundCredits({
          userId,
          cost: PARSE_DOCUMENT_COST,
          reason: "refund_parse_document_failed",
        });
        return new Response(
          JSON.stringify({ error: "Could not extract text from document", code: "INTERNAL_ERROR" }),
          { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      await db
        .from("job_descriptions")
        .update({
          content: extracted.full_text,
          parse_status: "ready",
          parse_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jdId);

      return new Response(
        JSON.stringify({
          success: true,
          content: extracted.full_text,
          parsed_summary: extracted.summary,
          content_length: extracted.full_text.length,
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (!documentId) {
      return new Response(
        JSON.stringify({ error: "Missing document_id", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { data: doc } = await db
      .from("documents")
      .select("id, user_id, type, title")
      .eq("id", documentId)
      .single();

    if (!doc || doc.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Document not found", code: "FORBIDDEN" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Derive storage path server-side — never trust client-supplied paths (IDOR).
    const storagePrefix = `${userId}/cover-letters`;
    const { data: objects, error: listError } = await db.storage
      .from("documents")
      .list(storagePrefix, { search: documentId, limit: 10 });

    if (listError || !objects?.length) {
      return new Response(
        JSON.stringify({ error: "Document file not found in storage", code: "NOT_FOUND" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const match = objects.find((obj) => obj.name.includes(documentId));
    if (!match) {
      return new Response(
        JSON.stringify({ error: "Document file not found in storage", code: "NOT_FOUND" }),
        { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const filePath = `${storagePrefix}/${match.name}`;

    if (
      filePath.includes("..") ||
      !filePath.startsWith(`${userId}/`) ||
      !filePath.includes(documentId)
    ) {
      return new Response(
        JSON.stringify({ error: "Invalid storage path", code: "FORBIDDEN" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const { data: fileData, error: downloadError } = await db.storage
      .from("documents")
      .download(filePath);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: "Failed to download file from storage", code: "SERVICE_UNAVAILABLE" }),
        { status: 502, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const buf = await fileData.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
      return new Response(
        JSON.stringify({ error: "File empty or too large", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const creditResult = await deductCreditsAtomic({
      userId,
      action: "parse_document",
      cost: PARSE_DOCUMENT_COST,
      idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
    });
    if (!creditResult.success) {
      return new Response(
        JSON.stringify({
          error: "Insufficient credits.",
          code: "INSUFFICIENT_CREDITS",
          message: `Document parsing costs ${PARSE_DOCUMENT_COST} credits.`,
        }),
        {
          status: 402,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        },
      );
    }

    const fileBytes = new Uint8Array(buf);
    let extracted: { full_text: string; summary: string } | null = null;

    if (mimeCheck.mimeType === "text/plain") {
      if (looksBinary(fileBytes)) {
        await refundCredits({
          userId,
          cost: PARSE_DOCUMENT_COST,
          reason: "refund_parse_document_failed",
        });
        return new Response(
          JSON.stringify({
            error: "This file is not valid UTF-8 text.",
            code: "UNSUPPORTED_ENCODING",
          }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      const text = bytesToUtf8(fileBytes).replace(/^\uFEFF/, "").trim();
      if (text.length < 20) {
        await refundCredits({
          userId,
          cost: PARSE_DOCUMENT_COST,
          reason: "refund_parse_document_failed",
        });
        return new Response(
          JSON.stringify({
            error: "Text file is empty or too short to parse.",
            code: "BAD_REQUEST",
          }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
        );
      }
      extracted = {
        full_text: text.slice(0, 50000),
        summary: text.slice(0, 400),
      };
    } else {
      extracted = await extractWithGemini(
        safeBase64(fileBytes),
        mimeCheck.mimeType,
        doc.type ?? "other",
      );
    }

    if (!extracted) {
      await refundCredits({
        userId,
        cost: PARSE_DOCUMENT_COST,
        reason: "refund_parse_document_failed",
      });
      return new Response(
        JSON.stringify({ error: "Could not extract text from document", code: "INTERNAL_ERROR" }),
        { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    await db
      .from("documents")
      .update({
        content: extracted.full_text,
        parsed_summary: extracted.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({
        success: true,
        content: extracted.full_text,
        parsed_summary: extracted.summary,
        content_length: extracted.full_text.length,
      }),
      { headers: getCorsHeaders(req) }
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[parse-document]", err);
    return new Response(
      JSON.stringify({ error: "Internal error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
