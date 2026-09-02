// parse-document — PDF/text extraction for documents table (cover letter, etc.)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, refundCredits } from "../_shared/supabase.ts";
import { geminiGenerateWithPdf, parseJSON } from "../_shared/gemini.ts";
import {
  buildDocumentExtractPayload,
  extractPdfTextBasic,
  looksBinary,
  tryDeterministicTextExtract,
  bytesToUtf8,
  type DocumentExtractPayload,
} from "../_shared/documentTextExtract.ts";
import { requireAuth } from "../_shared/utils.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import {
  enforceAiRateLimitAsync,
} from "../_shared/rateLimit.ts";
import { resolveUploadMime, validateUploadMime } from "../_shared/uploadValidation.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { callPythonProcess } from "../_shared/pythonClient.ts";
import { executeHybridOperation } from "../_shared/hybridExecute.ts";
import {
  documentErrorMessage,
  fileByteLengthFailure,
} from "../_shared/documentErrors.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const PARSE_DOCUMENT_COST = creditCost("parse_document");

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const PARSER_VERSION = "document-parser-v2";

function safeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
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

function storagePrefixForDocument(userId: string, doc: { type?: string | null; keywords?: unknown }): string {
  if (Array.isArray(doc.keywords) && doc.keywords.includes("portfolio")) {
    return `${userId}/portfolios`;
  }
  return `${userId}/cover-letters`;
}

async function persistJdParseError(db: ReturnType<typeof createServiceClient>, jdId: string, message: string) {
  await db.from("job_descriptions").update({
    parse_status: "error",
    parse_error: message,
    updated_at: new Date().toISOString(),
  }).eq("id", jdId);
}

async function persistCoverParseError(db: ReturnType<typeof createServiceClient>, documentId: string, message: string) {
  await db.from("documents").update({
    content: null,
    parsed_summary: message,
    updated_at: new Date().toISOString(),
  }).eq("id", documentId);
}

async function refundIfCharged(opts: {
  userId: string;
  cost: number;
  reason: string;
  idempotencyKey: string;
}) {
  if (opts.cost <= 0) return;
  await refundCredits({
    userId: opts.userId,
    cost: opts.cost,
    reason: opts.reason,
    idempotencyKey: opts.idempotencyKey.slice(0, 150),
  });
}

function sizeFailureResponse(req: Request, byteLength: number) {
  const fail = fileByteLengthFailure(byteLength, MAX_FILE_BYTES);
  if (!fail) return null;
  return response(req, { error: fail.message, code: fail.code, message: fail.message }, 400);
}

async function extractWithGemini(
  base64: string,
  docType: string,
): Promise<DocumentExtractPayload | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt =
    docType === "cover_letter"
      ? `Extract the full cover letter text from this document. Return JSON only:
{"full_text":"complete letter text","summary":"2-3 sentence summary for interview coaching"}`
      : docType === "portfolio"
      ? `Extract only text that appears in this portfolio document. Do not invent companies, titles, dates, skills, metrics, or achievements. If a field is not in the source, omit it. Return JSON only:
{"full_text":"source text only","summary":"2-3 sentence summary of what the document actually says"}`
      : docType === "job_description"
      ? `Extract the full job description text from this document. Return JSON only:
{"full_text":"complete job description text","summary":"2-3 sentence summary of role and requirements"}`
      : `Extract all readable text. Return JSON only:
{"full_text":"...","summary":"brief summary"}`;

  try {
    const raw = await geminiGenerateWithPdf(prompt, base64, {
      temperature: 0.2,
      maxTokens: 8192,
    });
    const parsed = parseJSON(
      raw.replace(/```json/gi, "").replace(/```/g, "").trim(),
      null,
    ) as { full_text?: string; summary?: string } | null;

    if (!parsed?.full_text || parsed.full_text.length < 20) return null;
    return {
      full_text: String(parsed.full_text).slice(0, 50_000),
      summary: String(parsed.summary ?? parsed.full_text).slice(0, 2000),
    };
  } catch (err) {
    console.warn("[parse-document] gemini PDF extract failed", err);
    return null;
  }
}

const UNRELATED_REJECT_CONFIDENCE = 0.7;
const UNKNOWN_REVIEW_REJECT_CONFIDENCE = 0.8;

type DocumentClassification = {
  document_type: string;
  confidence: number;
  warnings: string[];
};

function parseClassification(data: unknown): DocumentClassification | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const documentType =
    (typeof obj.detected_document_type === "string" && obj.detected_document_type) ||
    (typeof obj.document_type === "string" && obj.document_type) ||
    "";
  const confidence =
    typeof obj.confidence === "number" ? obj.confidence : Number(obj.confidence);
  if (!documentType || !Number.isFinite(confidence)) return null;
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.map((item) => String(item))
    : [];
  return { document_type: documentType, confidence, warnings };
}

function shouldRejectClassification(c: DocumentClassification): boolean {
  const type = c.document_type.toUpperCase();
  if (type === "UNRELATED" && c.confidence >= UNRELATED_REJECT_CONFIDENCE) return true;
  if (type === "UNKNOWN_REVIEW" && c.confidence >= UNKNOWN_REVIEW_REJECT_CONFIDENCE) {
    return true;
  }
  return false;
}

function classificationPayload(c: DocumentClassification | null): Record<string, unknown> {
  if (!c) return {};
  return {
    document_type: c.document_type,
    confidence: c.confidence,
    classification_warnings: c.warnings,
  };
}

async function classifyExtractedText(opts: {
  text: string;
  categoryHint: string;
  operationId: string;
  correlationId?: string;
}): Promise<DocumentClassification | null> {
  try {
    const result = await callPythonProcess({
      operation: "document_classify",
      operationId: `${opts.operationId}-classify`.slice(0, 128),
      correlationId: opts.correlationId ?? crypto.randomUUID(),
      payload: {
        text: opts.text.slice(0, 50_000),
        category_hint: opts.categoryHint,
        document_kind: opts.categoryHint,
      },
    });
    if (!result.ok) {
      console.warn("[parse-document] python document_classify failed", {
        code: result.code,
        message: result.message,
      });
      return null;
    }
    return parseClassification(result.data);
  } catch (err) {
    console.warn("[parse-document] python document_classify threw", err);
    return null;
  }
}

async function classifyOrReject(
  req: Request,
  extracted: DocumentExtractPayload,
  documentKind: string,
): Promise<
  | { ok: true; classification: DocumentClassification | null }
  | { ok: false; response: Response }
> {
  const classification = await classifyExtractedText({
    text: extracted.full_text,
    categoryHint: documentKind,
    operationId: `parse-document-${documentKind}`,
  });
  if (!classification) return { ok: true, classification: null };
  if (shouldRejectClassification(classification)) {
    return {
      ok: false,
      response: response(req, {
        error:
          "This file does not look like a resume, job description, or personal document.",
        code: "DOCUMENT_UNRELATED",
        ...classificationPayload(classification),
      }, 422),
    };
  }
  return { ok: true, classification };
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
  correlationId?: string;
}): Promise<{ full_text: string; summary: string } | null> {
  const result = await callPythonProcess({
    operation: "document_extract",
    operationId: opts.operationId,
    correlationId: opts.correlationId ?? crypto.randomUUID(),
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

async function hybridDocumentExtract(opts: {
  req: Request;
  userId: string;
  creditCost: number;
  idempotencyKey: string | null;
  base64: string;
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  documentKind: string;
}): Promise<
  | { ok: true; data: DocumentExtractPayload; response: Response; source: string }
  | { ok: false; response: Response }
> {
  const hybrid = await executeHybridOperation<DocumentExtractPayload>({
    req: opts.req,
    auth: { userId: opts.userId },
    operation: "document_process",
    idempotencyKey: opts.idempotencyKey,
    creditCost: opts.creditCost,
    creditAction: "parse_document",
    body: {
      filename: opts.filename,
      mime_type: opts.mimeType,
      document_kind: opts.documentKind,
    },
    runPython: async (ctx) => {
      const local = tryDeterministicTextExtract(opts.bytes, opts.mimeType);
      if (local) return local;
      return await tryPythonDocumentExtract({
        base64: opts.base64,
        filename: opts.filename,
        mimeType: opts.mimeType,
        documentKind: opts.documentKind,
        operationId: ctx.operationId,
        correlationId: ctx.correlationId,
      });
    },
    runAi: async () => {
      // Prefer local text/zip extract when possible; otherwise Gemini.
      if (
        opts.mimeType === "text/plain" ||
        opts.mimeType === "text/csv" ||
        opts.mimeType === "application/csv" ||
        opts.mimeType === "application/vnd.ms-excel"
      ) {
        if (looksBinary(opts.bytes)) {
          throw new Error("This file is not valid text.");
        }
        const text = bytesToUtf8(opts.bytes).replace(/^\uFEFF/, "").trim();
        if (text.length < 1) throw new Error("Empty text document");
        return {
          full_text: text.slice(0, 50000),
          summary: text.slice(0, 400),
        };
      }
      if (
        opts.mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const text = await extractZipText(opts.bytes, false);
        if (!text) throw new Error("DOCX extract failed");
        return { full_text: text, summary: text.slice(0, 400) };
      }
      if (
        opts.mimeType ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ) {
        const text = await extractZipText(opts.bytes, true);
        if (!text) throw new Error("XLSX extract failed");
        return { full_text: text, summary: text.slice(0, 400) };
      }
      if (opts.mimeType === "application/pdf") {
        const pdfText = extractPdfTextBasic(opts.bytes);
        const fromPdf = pdfText ? buildDocumentExtractPayload(pdfText) : null;
        if (fromPdf) return fromPdf;
        const gemini = await extractWithGemini(opts.base64, opts.documentKind);
        if (!gemini) throw new Error("Gemini document extract failed");
        return gemini;
      }
      throw new Error(`Unsupported MIME type for AI extract: ${opts.mimeType}`);
    },
    validate: async (data) => {
      if (!data.full_text || data.full_text.trim().length < 1) {
        throw new Error("Extracted document text is empty");
      }
      return data;
    },
  });

  if (!hybrid.ok) {
    const fallback = tryDeterministicTextExtract(opts.bytes, opts.mimeType);
    if (fallback) {
      return {
        ok: true,
        data: fallback,
        response: hybrid.response,
        source: "deterministic",
      };
    }
    return { ok: false, response: hybrid.response };
  }
  return {
    ok: true,
    data: hybrid.data,
    response: hybrid.response,
    source: hybrid.source,
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
      if (libraryDoc.processing_status === "completed" && libraryDoc.content_hash) {
        return response(req, { success: true, duplicate: true, reused: true, code: "DUPLICATE_DOCUMENT" });
      }
      await db.from("personal_library_documents")
        .update({ processing_status: "processing", processing_error: null, parser_version: PARSER_VERSION })
        .eq("id", libraryDocumentId).eq("owner_id", userId);

      const { data: fileData, error: downloadError } = await db.storage
        .from("documents").download(libraryDoc.storage_path);
      if (downloadError || !fileData) {
        await db.from("personal_library_documents").update({
          processing_status: "failed_retryable", processing_error: "Document file could not be downloaded.",
        }).eq("id", libraryDocumentId);
        return response(req, { error: "Document file could not be downloaded.", code: "PARSER_UNAVAILABLE" }, 503);
      }
      const buf = await fileData.arrayBuffer();
      const libSize = sizeFailureResponse(req, buf.byteLength);
      if (libSize) {
        await db.from("personal_library_documents").update({
          processing_status: "rejected",
          processing_error: buf.byteLength ? "File is too large." : "File is empty.",
        }).eq("id", libraryDocumentId).eq("owner_id", userId);
        return libSize;
      }
      const resolvedMime = resolveUploadMime(libraryDoc.mime_type, {
        filePath: libraryDoc.storage_path,
        bytes: new Uint8Array(buf),
      });
      if (!resolvedMime.ok) {
        await db.from("personal_library_documents").update({
          processing_status: "rejected", processing_error: "File content does not match its declared type.",
        }).eq("id", libraryDocumentId).eq("owner_id", userId);
        return response(req, { error: "File content does not match its declared type.", code: "CORRUPT_FILE" }, 422);
      }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", buf)))
        .map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (libraryDoc.content_hash && libraryDoc.content_hash !== hash) {
        return response(req, { error: "Stored file fingerprint does not match the document record.", code: "VALIDATION_ERROR" }, 422);
      }
      const bytes = new Uint8Array(buf);
      const hybrid = await hybridDocumentExtract({
        req,
        userId,
        creditCost: 0,
        idempotencyKey: `library:${libraryDocumentId}`.slice(0, 150),
        base64: safeBase64(bytes),
        bytes,
        filename: libraryDoc.storage_path.split("/").pop() || "document",
        mimeType: resolvedMime.mimeType,
        documentKind: "library",
      });
      if (!hybrid.ok) {
        await db.from("personal_library_documents").update({
          processing_status: "failed_permanent",
          processing_error: "Could not extract readable text from this document.",
          content_hash: hash,
        }).eq("id", libraryDocumentId);
        return response(req, {
          error: "Could not extract readable text from this document.",
          code: "PARSER_FAILED",
        }, 422);
      }
      const extracted = hybrid.data;
      const classified = await classifyOrReject(req, extracted, "library");
      if (!classified.ok) {
        await db.from("personal_library_documents").update({
          processing_status: "rejected",
          processing_error: "This file does not look like a supported document type.",
          content_hash: hash,
        }).eq("id", libraryDocumentId);
        return classified.response;
      }
      await db.from("personal_library_documents").update({
        content_hash: hash, parsed_content: extracted.full_text, parsed_metadata: {
          summary: extracted.summary,
          ...classificationPayload(classified.classification),
        },
        processing_status: "completed", processing_error: null, parser_version: PARSER_VERSION,
      }).eq("id", libraryDocumentId).eq("owner_id", userId);
      return response(req, {
        success: true, content: extracted.full_text, parsed_summary: extracted.summary,
        content_length: extracted.full_text.length,
        ...classificationPayload(classified.classification),
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
        const msg = documentErrorMessage("PARSER_UNAVAILABLE", "Failed to download file from storage");
        await persistJdParseError(db, jdId, msg);
        return response(req, { error: msg, code: "PARSER_UNAVAILABLE" }, 503);
      }

      const buf = await fileData.arrayBuffer();
      const jdSize = sizeFailureResponse(req, buf.byteLength);
      if (jdSize) {
        await persistJdParseError(db, jdId, buf.byteLength ? "This file is too large to process." : "This file is empty.");
        return jdSize;
      }

      const creditIdempotencyKey =
        req.headers.get("x-idempotency-key") ||
        req.headers.get("Idempotency-Key") ||
        `jd:${jdId}`.slice(0, 150);

      const fileBytes = new Uint8Array(buf);
      const resolvedMime = resolveUploadMime(mimeType, {
        filePath: match.name,
        bytes: fileBytes,
      });
      if (!resolvedMime.ok) {
        await persistJdParseError(db, jdId, resolvedMime.reason);
        return response(req, {
          error: resolvedMime.reason,
          code: "CORRUPT_FILE",
        }, 400);
      }

      const hybrid = await hybridDocumentExtract({
        req,
        userId,
        creditCost: PARSE_DOCUMENT_COST,
        idempotencyKey: creditIdempotencyKey,
        base64: safeBase64(fileBytes),
        bytes: fileBytes,
        filename: match.name,
        mimeType: resolvedMime.mimeType,
        documentKind: "job_description",
      });

      if (!hybrid.ok) {
        await persistJdParseError(db, jdId, documentErrorMessage("PARSER_FAILED"));
        return hybrid.response;
      }

      const extracted = hybrid.data;
      const classified = await classifyOrReject(req, extracted, "job_description");
      if (!classified.ok) {
        await refundIfCharged({
          userId,
          cost: PARSE_DOCUMENT_COST,
          reason: `parse_document_unrelated:${jdId}`,
          idempotencyKey: `parse-doc-unrelated-ref:${creditIdempotencyKey}`,
        });
        await persistJdParseError(db, jdId, documentErrorMessage("DOCUMENT_UNRELATED"));
        return classified.response;
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
          ...classificationPayload(classified.classification),
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
      .select("id, user_id, type, title, keywords")
      .eq("id", documentId)
      .single();

    if (!doc || doc.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Document not found", code: "FORBIDDEN" }),
        { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Derive storage path server-side — never trust client-supplied paths (IDOR).
    const storagePrefix = storagePrefixForDocument(userId, doc);
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
      const msg = documentErrorMessage("PARSER_UNAVAILABLE", "Failed to download file from storage");
      await persistCoverParseError(db, documentId, msg);
      return response(req, { error: msg, code: "PARSER_UNAVAILABLE" }, 503);
    }

    const buf = await fileData.arrayBuffer();
    const coverSize = sizeFailureResponse(req, buf.byteLength);
    if (coverSize) {
      await persistCoverParseError(db, documentId, buf.byteLength ? "This file is too large to process." : "This file is empty.");
      return coverSize;
    }

    const fileBytes = new Uint8Array(buf);
    const resolvedMime = resolveUploadMime(mimeType, {
      filePath: match.name,
      bytes: fileBytes,
    });
    if (!resolvedMime.ok) {
      await persistCoverParseError(db, documentId, resolvedMime.reason);
      return response(req, {
        error: resolvedMime.reason,
        code: "CORRUPT_FILE",
      }, 400);
    }

    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    const contentHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Same user + same bytes already extracted → reuse without re-charge
    const { data: dupDoc } = await db
      .from("documents")
      .select("id, content, parsed_summary")
      .eq("user_id", userId)
      .eq("content_hash", contentHash)
      .not("content", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (dupDoc?.content && String(dupDoc.content).trim().length >= 20) {
      if (dupDoc.id !== documentId) {
        await db.from("documents").update({
          content: dupDoc.content,
          parsed_summary: dupDoc.parsed_summary,
          content_hash: contentHash,
          updated_at: new Date().toISOString(),
        }).eq("id", documentId);
      }
      return new Response(
        JSON.stringify({
          success: true,
          duplicate: true,
          code: "DUPLICATE_DOCUMENT",
          content: dupDoc.content,
          parsed_summary: dupDoc.parsed_summary,
          content_length: String(dupDoc.content).length,
          message: "Identical document already parsed — no additional credit charged.",
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const creditIdempotencyKey =
      req.headers.get("x-idempotency-key") ||
      req.headers.get("Idempotency-Key") ||
      `document:${documentId}`.slice(0, 150);

    const hybrid = await hybridDocumentExtract({
      req,
      userId,
      creditCost: PARSE_DOCUMENT_COST,
      idempotencyKey: creditIdempotencyKey,
      base64: safeBase64(fileBytes),
      bytes: fileBytes,
      filename: match.name,
      mimeType: resolvedMime.mimeType,
      documentKind: Array.isArray(doc.keywords) && doc.keywords.includes("portfolio")
        ? "portfolio"
        : (doc.type ?? "other"),
    });

    if (!hybrid.ok) {
      await persistCoverParseError(db, documentId, documentErrorMessage("PARSER_FAILED"));
      return hybrid.response;
    }

    const extracted = hybrid.data;
    const classified = await classifyOrReject(
      req,
      extracted,
      Array.isArray(doc.keywords) && doc.keywords.includes("portfolio")
        ? "portfolio"
        : (doc.type ?? "other"),
    );
    if (!classified.ok) {
      await refundIfCharged({
        userId,
        cost: PARSE_DOCUMENT_COST,
        reason: `parse_document_unrelated:${documentId}`,
        idempotencyKey: `parse-doc-unrelated-ref:${creditIdempotencyKey}`,
      });
      await persistCoverParseError(db, documentId, documentErrorMessage("DOCUMENT_UNRELATED"));
      return classified.response;
    }

    await db
      .from("documents")
      .update({
        content: extracted.full_text,
        parsed_summary: extracted.summary,
        content_hash: contentHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({
        success: true,
        content: extracted.full_text,
        parsed_summary: extracted.summary,
        content_length: extracted.full_text.length,
        ...classificationPayload(classified.classification),
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
