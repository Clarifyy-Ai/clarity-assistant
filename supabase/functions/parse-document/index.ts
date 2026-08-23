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
import { creditDenialResponse } from "../_shared/creditAuthority.ts";
import { callPythonProcess } from "../_shared/pythonClient.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const PARSE_DOCUMENT_COST = creditCost("parse_document");

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PARSER_VERSION = "document-parser-v2";

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

async function extractZipText(bytes: Uint8Array, xlsx: boolean): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const fileName = xlsx ? "xl/sharedStrings.xml" : "word/document.xml";
    const file = zip.file(fileName);
    if (!file) return null;
    const xml = await file.async("string");
    return xml
      .replace(/<\/(?:w:p|row|si)>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/\s+/g, " ").trim().slice(0, 50000) || null;
  } catch {
    return null;
  }
}

function response(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
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

function extractPythonDocument(data: unknown): { full_text: string; summary: string } | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const structured =
    obj.structured && typeof obj.structured === "object"
      ? (obj.structured as Record<string, unknown>)
      : null;
  const full =
    (typeof obj.extracted_text === "string" && obj.extracted_text) ||
    (typeof obj.full_text === "string" && obj.full_text) ||
    (typeof obj.text === "string" && obj.text) ||
    (typeof obj.content === "string" && obj.content) ||
    "";
  if (full.trim().length < 20) return null;
  const summary =
    (structured && typeof structured.summary === "string" && structured.summary) ||
    (typeof obj.summary === "string" && obj.summary) ||
    full.slice(0, 400);
  return {
    full_text: full.slice(0, 50000),
    summary: String(summary).slice(0, 2000),
  };
}

async function tryPythonDocumentExtract(opts: {
  base64: string;
  filename: string;
  mimeType: string;
  documentKind: string;
  operationId: string;
}): Promise<{ full_text: string; summary: string } | null> {
  const result = await callPythonProcess({
    operation: "document_extract",
    operationId: opts.operationId,
    correlationId: crypto.randomUUID(),
    payload: {
      base64: opts.base64,
      filename: opts.filename,
      mime_type: opts.mimeType,
      document_kind: opts.documentKind,
      category_hint: opts.documentKind,
    },
  });
  if (!result.ok) {
    console.warn("[parse-document] python document_extract failed", {
      code: result.code,
      message: result.message,
    });
    return null;
  }
  return extractPythonDocument(result.data);
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

    const capabilityGate = await requireCapabilityForFunction(
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
    const libraryDocumentId = typeof body?.library_document_id === "string"
      ? body.library_document_id.trim()
      : "";
    const mimeType = (body?.mime_type as string) || "application/pdf";

    const mimeCheck = validateUploadMime(mimeType);
    if (!mimeCheck.ok) {
      return response(req, { error: mimeCheck.reason, code: "UNSUPPORTED_FILE_TYPE" }, 400);
    }

    if (libraryDocumentId) {
      const { data: libraryDoc } = await db
        .from("personal_library_documents")
        .select("id, owner_id, storage_path, mime_type, content_hash, processing_status")
        .eq("id", libraryDocumentId)
        .maybeSingle();
      if (!libraryDoc || libraryDoc.owner_id !== userId) {
        return response(req, { error: "Document not found", code: "FORBIDDEN" }, 403);
      }
      if (!libraryDoc.storage_path || !libraryDoc.storage_path.startsWith(`${userId}/library/`) ||
          libraryDoc.storage_path.includes("..")) {
        return response(req, { error: "Invalid storage path", code: "FORBIDDEN" }, 403);
      }
      if (libraryDoc.processing_status === "ready" && libraryDoc.content_hash) {
        return response(req, { success: true, duplicate: true, reused: true, code: "DUPLICATE_DOCUMENT" });
      }
      await db.from("personal_library_documents")
        .update({ processing_status: "processing", processing_error: null, parser_version: PARSER_VERSION })
        .eq("id", libraryDocumentId).eq("owner_id", userId);

      const { data: fileData, error: downloadError } = await db.storage
        .from("documents").download(libraryDoc.storage_path);
      if (downloadError || !fileData) {
        await db.from("personal_library_documents").update({
          processing_status: "error", processing_error: "Document file could not be downloaded.",
        }).eq("id", libraryDocumentId);
        return response(req, { error: "Document file could not be downloaded.", code: "PARSER_UNAVAILABLE" }, 503);
      }
      const buf = await fileData.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
        return response(req, { error: "File empty or too large.", code: "BAD_REQUEST" }, 400);
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)))
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (libraryDoc.content_hash && libraryDoc.content_hash !== hash) {
        return response(req, { error: "Stored file fingerprint does not match the document record.", code: "VALIDATION_ERROR" }, 422);
      }
      const bytes = new Uint8Array(buf);
      let extracted: { full_text: string; summary: string } | null = null;
      // Prefer Python document_extract; fall back to local/AI extract.
      extracted = await tryPythonDocumentExtract({
        base64: safeBase64(bytes),
        filename: libraryDoc.storage_path.split("/").pop() || "document",
        mimeType: mimeCheck.mimeType,
        documentKind: "library",
        operationId: `library:${libraryDocumentId}`,
      });
      if (!extracted) {
        if (mimeCheck.mimeType === "text/plain" || mimeCheck.mimeType === "text/csv" || mimeCheck.mimeType === "application/csv" || mimeCheck.mimeType === "application/vnd.ms-excel") {
          if (looksBinary(bytes)) return response(req, { error: "This file is not valid text.", code: "UNSUPPORTED_ENCODING" }, 400);
          const text = bytesToUtf8(bytes).replace(/^\uFEFF/, "").trim();
          if (text.length < 1) return response(req, { error: "The document contains no readable text.", code: "BAD_REQUEST" }, 400);
          extracted = { full_text: text.slice(0, 50000), summary: text.slice(0, 400) };
        } else if (mimeCheck.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          const text = await extractZipText(bytes, false);
          if (text) extracted = { full_text: text, summary: text.slice(0, 400) };
        } else if (mimeCheck.mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
          const text = await extractZipText(bytes, true);
          if (text) extracted = { full_text: text, summary: text.slice(0, 400) };
        } else {
          extracted = await extractWithGemini(safeBase64(bytes), mimeCheck.mimeType, "library");
        }
      }
      if (!extracted) {
        await db.from("personal_library_documents").update({
          processing_status: "error", processing_error: "Could not extract readable text from this document.",
          content_hash: hash,
        }).eq("id", libraryDocumentId);
        return response(req, { error: "Could not extract readable text from this document.", code: "PARSER_FAILED" }, 422);
      }
      await db.from("personal_library_documents").update({
        content_hash: hash, parsed_content: extracted.full_text, parsed_metadata: { summary: extracted.summary },
        processing_status: "ready", processing_error: null, parser_version: PARSER_VERSION,
      }).eq("id", libraryDocumentId).eq("owner_id", userId);
      return response(req, {
        success: true, content: extracted.full_text, parsed_summary: extracted.summary,
        content_length: extracted.full_text.length,
      });
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
        return creditDenialResponse(req, creditResult, PARSE_DOCUMENT_COST);
      }

      const fileBytes = new Uint8Array(buf);
      let extracted: { full_text: string; summary: string } | null =
        await tryPythonDocumentExtract({
          base64: safeBase64(fileBytes),
          filename: match.name,
          mimeType: mimeCheck.mimeType,
          documentKind: "job_description",
          operationId: `jd:${jdId}`,
        });
      if (!extracted) {
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
      return creditDenialResponse(req, creditResult, PARSE_DOCUMENT_COST);
    }

    const fileBytes = new Uint8Array(buf);
    let extracted: { full_text: string; summary: string } | null =
      await tryPythonDocumentExtract({
        base64: safeBase64(fileBytes),
        filename: match.name,
        mimeType: mimeCheck.mimeType,
        documentKind: doc.type ?? "other",
        operationId: `document:${documentId}`,
      });

    if (!extracted) {
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
