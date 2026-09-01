import { handleCors } from "../_shared/cors.ts";
import {
  requireAuth,
  errorResponse,
  successResponse,
  getAdminClient,
} from "../_shared/utils.ts";
import { deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import { geminiGenerate, geminiGenerateWithPdf, parseJSON } from "../_shared/gemini.ts";
import { getAiFeaturePolicy } from "../_shared/aiFeaturePolicy.ts";
import { enforceAiRateLimitAsync } from "../_shared/rateLimit.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import { callPythonProcess, isPythonConfigured } from "../_shared/pythonClient.ts";
import {
  EXTRACT_PARSER_VERSION,
  PDF_QUESTION_EXTRACT_PROMPT,
  bufferToBase64,
  parsePlainTextMcqs,
} from "../_shared/pdfQuestionExtract.ts";

const CREDIT_COST = creditCost("parse_question_pdf");
const MAX_FILE_SIZE = 15 * 1024 * 1024;
/** ~1.5MB base64 (~1.1MB binary). Larger PDFs must not wait in the HTTP body. */
const ASYNC_PDF_B64_CHARS = 1_500_000;
const ASYNC_FILE_BYTES = 1 * 1024 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type JobStatus = "queued" | "extracting" | "normalizing" | "inserting_questions" | "completed" | "failed";

function scheduleWaitUntil(task: Promise<unknown>): boolean {
  try {
    const er = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void };
    }).EdgeRuntime;
    if (er && typeof er.waitUntil === "function") {
      er.waitUntil(
        task.catch((err) => {
          console.error("[parse-question-pdf] background:", err);
        }),
      );
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

async function extractPdf(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) return null;

  const form = await req.formData();
  const file = form.get("pdf");
  if (!(file instanceof File)) return null;
  if (file.size > MAX_FILE_SIZE) throw new Error("PDF exceeds 15MB limit");

  const examTypeRaw = form.get("exam_type");
  const examType =
    typeof examTypeRaw === "string" && examTypeRaw.trim() ? examTypeRaw.trim().slice(0, 64) : null;
  const yearRaw = form.get("source_year");
  const yearNum = typeof yearRaw === "string" ? Number(yearRaw) : NaN;
  const sourceYear =
    Number.isFinite(yearNum) && yearNum >= 1990 && yearNum <= 2100 ? Math.floor(yearNum) : null;

  return {
    fileName: file.name,
    size: file.size,
    base64: bufferToBase64(await file.arrayBuffer()),
    examType,
    sourceYear,
  };
}

/** Prefer Python OCR/text extract when configured; never invent paper content. */
async function tryPythonPdfText(
  pdfBase64: string,
  fileName: string,
  correlationId: string,
): Promise<string | null> {
  if (!isPythonConfigured()) return null;
  const result = await callPythonProcess({
    operation: "document_extract",
    operationId: correlationId,
    correlationId,
    payload: {
      base64: pdfBase64,
      filename: fileName || "questions.pdf",
      mime_type: "application/pdf",
      document_kind: "exam_paper",
      category_hint: "exam_paper",
    },
  });
  if (!result.ok) {
    console.warn("[parse-question-pdf] python document_extract failed:", result.message);
    return null;
  }
  const data = result.data as Record<string, unknown>;
  const text =
    (typeof data.full_text === "string" && data.full_text) ||
    (typeof data.text === "string" && data.text) ||
    "";
  return text.trim() ? text : null;
}

function isTimeoutMessage(msg: string): boolean {
  return /timeout|timed out|AbortError|504|deadline exceeded/i.test(msg);
}

function normalizeExtractedQuestions(raw: unknown[]): unknown[] {
  return raw.filter((item) => item && typeof item === "object");
}

function questionBankRows(
  questions: unknown[],
  args: {
    userId: string;
    jobId: string;
    fileName: string;
    examType: string | null;
    sourceYear: number | null;
  },
): Record<string, unknown>[] {
  return questions.map((item) => {
    const q = item as Record<string, unknown>;
    const optionsRaw = Array.isArray(q.options) ? q.options : [];
    const options = optionsRaw.map((o, i) => {
      if (o && typeof o === "object" && "text" in (o as object)) {
        const rec = o as { label?: unknown; text?: unknown };
        return {
          label: String(rec.label ?? String.fromCharCode(65 + i)),
          text: String(rec.text ?? ""),
        };
      }
      return { label: String.fromCharCode(65 + i), text: String(o ?? "") };
    });
    const text = String(q.question_text ?? "");
    const difficultyRaw = String(q.difficulty ?? "MEDIUM").toUpperCase();
    const difficulty = ["EASY", "MEDIUM", "HARD"].includes(difficultyRaw) ? difficultyRaw : "MEDIUM";
    return {
      question_text: text,
      question_type: "MCQ",
      options,
      correct_answer: String(q.correct_answer ?? "A").slice(0, 8),
      explanation: String(q.explanation ?? ""),
      subject: String(q.subject ?? "General").slice(0, 120) || "General",
      topic: String(q.topic ?? "Imported").slice(0, 120) || "Imported",
      difficulty,
      marks_positive: typeof q.marks_positive === "number" ? q.marks_positive : 4,
      marks_negative: typeof q.marks_negative === "number" ? q.marks_negative : 1,
      source_year: args.sourceYear,
      exam_type: args.examType,
      latex_present: Boolean(q.latex_present) || /\$|\\\(|\\\[/.test(text),
      uploaded_by: args.userId,
      source: "USER_UPLOAD",
      is_public: false,
      is_verified: false,
      metadata: {
        needs_review: true,
        provenance: "parse_question_pdf",
        job_id: args.jobId,
        file_name: args.fileName.slice(0, 200),
      },
    };
  }).filter((row) => String(row.question_text).trim().length > 0);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  let charged = false;
  let userId = "";
  let refunded = false;
  let jobId: string | null = null;
  const db = getAdminClient();

  const refundOnce = async (reason: string) => {
    if (!charged || !userId || refunded) return;
    refunded = true;
    try {
      await refundCredits({
        userId,
        cost: CREDIT_COST,
        reason,
        idempotencyKey: jobId ? `parse-question-pdf-refund:${jobId}` : undefined,
      });
    } catch {
      /* ignore refund failure */
    }
  };

  const setJob = async (id: string, patch: Record<string, unknown>) => {
    await db
      .from("source_ingestion_jobs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
  };

  try {
    if (req.method === "GET") {
      const auth = await requireAuth(req);
      const url = new URL(req.url);
      const pollJobId = (url.searchParams.get("jobId") ?? "").trim();
      if (!UUID_RE.test(pollJobId)) {
        return errorResponse("jobId is required", "VALIDATION_ERROR", 400, req);
      }
      const { data: job, error: jobErr } = await db
        .from("source_ingestion_jobs")
        .select("id, status, error, questions_imported, metadata, created_by")
        .eq("id", pollJobId)
        .maybeSingle();
      if (jobErr || !job) {
        return errorResponse("Job not found", "NOT_FOUND", 404, req);
      }
      if (job.created_by !== auth.userId) {
        return errorResponse("Job not found", "NOT_FOUND", 404, req);
      }
      const meta = (job.metadata && typeof job.metadata === "object"
        ? job.metadata
        : {}) as Record<string, unknown>;
      if (meta.kind !== "parse_question_pdf") {
        return errorResponse("Job not found", "NOT_FOUND", 404, req);
      }
      const questions = Array.isArray(meta.questions) ? meta.questions : [];
      const status = String(job.status ?? "queued");
      return successResponse(
        {
          jobId: job.id,
          status,
          questions,
          count: typeof job.questions_imported === "number" ? job.questions_imported : questions.length,
          persistedToBank: meta.persistedToBank === true,
          error: typeof job.error === "string" ? job.error : null,
          message:
            status === "failed"
              ? (typeof job.error === "string" && job.error) || "PDF parsing failed. Credits refunded."
              : status === "completed"
              ? "PDF parsing finished."
              : "Parsing in background…",
        },
        undefined,
        200,
        req,
      );
    }

    if (req.method !== "POST") {
      return errorResponse("Method not allowed", "METHOD_NOT_ALLOWED", 405, req);
    }

    const auth = await requireAuth(req);
    userId = auth.userId;

    const rateLimited = await enforceAiRateLimitAsync(
      db,
      "parse-question-pdf",
      userId,
    );
    if (rateLimited) return rateLimited;

    const capabilityGate = await requireCapabilityForFunction(auth.planId, "parse-question-pdf", req);
    if (capabilityGate) return capabilityGate;

    const pdf = await extractPdf(req);
    if (!pdf?.base64) {
      return errorResponse("No PDF uploaded", "NO_PDF", 400, req);
    }

    const creditResult = await deductCreditsAtomic({
      userId,
      action: "parse_question_pdf",
      cost: CREDIT_COST,
      idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
    });
    if (!creditResult.success) {
      return errorResponse("Insufficient credits", "NO_CREDITS", 402, req);
    }
    charged = true;

    const correlationId = req.headers.get("x-request-id")?.trim() || crypto.randomUUID();
    const pythonOcr = isPythonConfigured();
    const heavyPdf =
      pdf.base64.length > ASYNC_PDF_B64_CHARS ||
      pdf.size > ASYNC_FILE_BYTES ||
      pythonOcr;

    const runExtract = async (): Promise<{ questions: unknown[]; rawText: string }> => {
      const policy = getAiFeaturePolicy("parse_question_pdf");
      const pythonText = await tryPythonPdfText(pdf.base64, pdf.fileName, correlationId);
      if (pythonText) {
        const deterministic = parsePlainTextMcqs(pythonText);
        if (deterministic.length > 0) {
          return {
            questions: normalizeExtractedQuestions(deterministic),
            rawText: pythonText,
          };
        }
      }
      let rawText: string;
      if (pythonText) {
        rawText = await geminiGenerate(
          `${PDF_QUESTION_EXTRACT_PROMPT}\n\n--- Extracted PDF text ---\n${pythonText.slice(0, 80000)}`,
          undefined,
          0.2,
          policy.maxOutputTokens,
        );
      } else {
        rawText = await geminiGenerateWithPdf(
          PDF_QUESTION_EXTRACT_PROMPT,
          pdf.base64,
          {
            temperature: 0.2,
            maxTokens: policy.maxOutputTokens,
          },
        );
      }
      const parsed = parseJSON<{ questions?: unknown[] }>(rawText, { questions: [] });
      const fromJson = normalizeExtractedQuestions(
        Array.isArray(parsed.questions) ? parsed.questions : [],
      );
      if (fromJson.length > 0) {
        return { questions: fromJson, rawText };
      }
      const fromPlain = parsePlainTextMcqs(rawText);
      return { questions: fromPlain, rawText };
    };

    const failHttp = async (err: unknown) => {
      await refundOnce("parse-question-pdf AI call failure");
      const msg = err instanceof Error ? err.message : "PDF parse failed";
      console.error("[parse-question-pdf] extract error:", msg);
      const isTimeout = isTimeoutMessage(msg);
      return errorResponse(
        "PDF parsing failed. Credits refunded.",
        isTimeout ? "PARSER_TIMEOUT" : "AI_ERROR",
        isTimeout ? 504 : 502,
        req,
      );
    };

    if (!heavyPdf) {
      try {
        const { questions } = await runExtract();
        return successResponse(
          { questions, count: questions.length },
          undefined,
          200,
          req,
        );
      } catch (err) {
        return await failHttp(err);
      }
    }

    // Durable job so the gateway can return 202 before Gemini/Python finish.
    const { data: src, error: srcErr } = await db
      .from("gov_official_sources")
      .insert({
        document_type: "previous_paper",
        title: `User PDF import: ${pdf.fileName.slice(0, 180)}`,
        is_official: false,
        license_class: "user_upload",
        review_state: "draft",
        mime_type: "application/pdf",
        metadata: {
          kind: "parse_question_pdf",
          user_id: userId,
          file_name: pdf.fileName.slice(0, 200),
        },
      })
      .select("id")
      .single();

    if (srcErr || !src) {
      console.error("[parse-question-pdf] source insert:", srcErr);
      await refundOnce("parse-question-pdf job enqueue failure");
      return errorResponse("Failed to queue PDF parse", "INTERNAL", 500, req);
    }

    const { data: job, error: jobErr } = await db
      .from("source_ingestion_jobs")
      .insert({
        source_id: src.id,
        created_by: userId,
        status: "queued" satisfies JobStatus,
        parser_version: EXTRACT_PARSER_VERSION,
        started_at: new Date().toISOString(),
        metadata: {
          kind: "parse_question_pdf",
          fileName: pdf.fileName.slice(0, 200),
          examType: pdf.examType,
          sourceYear: pdf.sourceYear,
          pythonOcr,
          credits_reserved: true,
        },
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("[parse-question-pdf] job insert:", jobErr);
      await refundOnce("parse-question-pdf job enqueue failure");
      return errorResponse("Failed to queue PDF parse", "INTERNAL", 500, req);
    }

    jobId = job.id as string;
    const persistToBank = !pdf.examType;

    const runBackground = async () => {
      try {
        await setJob(jobId!, { status: "extracting" satisfies JobStatus });
        const { questions, rawText } = await runExtract();
        await setJob(jobId!, { status: "normalizing" satisfies JobStatus });

        let persistedToBank = false;
        if (persistToBank && questions.length > 0) {
          await setJob(jobId!, { status: "inserting_questions" satisfies JobStatus });
          const rows = questionBankRows(questions, {
            userId,
            jobId: jobId!,
            fileName: pdf.fileName,
            examType: pdf.examType,
            sourceYear: pdf.sourceYear,
          });
          if (rows.length > 0) {
            const { error: qErr } = await db.from("questions").insert(rows);
            if (qErr) {
              console.error("[parse-question-pdf] questions insert:", qErr);
            } else {
              persistedToBank = true;
            }
          }
        }

        await setJob(jobId!, {
          status: "completed" satisfies JobStatus,
          questions_imported: questions.length,
          completed_at: new Date().toISOString(),
          error: null,
          metadata: {
            kind: "parse_question_pdf",
            fileName: pdf.fileName.slice(0, 200),
            examType: pdf.examType,
            sourceYear: pdf.sourceYear,
            pythonOcr,
            credits_reserved: true,
            credits_refunded: false,
            persistedToBank,
            questions,
            count: questions.length,
            raw_ocr_chars: rawText.length,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "PDF parse failed";
        console.error("[parse-question-pdf] background extract:", msg);
        await refundOnce("parse-question-pdf AI call failure");
        await setJob(jobId!, {
          status: "failed" satisfies JobStatus,
          error: "PDF parsing failed. Credits refunded.",
          completed_at: new Date().toISOString(),
          metadata: {
            kind: "parse_question_pdf",
            fileName: pdf.fileName.slice(0, 200),
            credits_reserved: true,
            credits_refunded: true,
            persistedToBank: false,
            questions: [],
            extract_error: msg.slice(0, 400),
          },
        });
      }
    };

    const background = runBackground();
    if (!scheduleWaitUntil(background)) {
      void background;
    }

    return successResponse(
      {
        accepted: true,
        jobId,
        status: "queued",
        message: "PDF queued. Credits reserved until parsing finishes.",
      },
      undefined,
      202,
      req,
    );
  } catch (err) {
    console.error("[parse-question-pdf]", err);

    await refundOnce("parse-question-pdf unhandled error");

    return errorResponse(
      "Internal server error",
      "INTERNAL",
      500,
      req,
    );
  }
});
