// parse-resume/index.ts — FIXED: uses Storage download (private bucket)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCreditsAtomic, refundCredits } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/utils.ts";
import { requireCapabilityForFunction } from "../_shared/requireCapability.ts";
import {
  enforceAiRateLimitAsync,
} from "../_shared/rateLimit.ts";
import {
  looksLikePdf,
  resolveUploadMime,
} from "../_shared/uploadValidation.ts";
import { creditCost } from "../_shared/creditEconomics.ts";
import JSZip from "https://esm.sh/jszip@3.10.1";

const RESUME_PARSE_COST = creditCost("resume_analysis");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OCR_API_KEY = Deno.env.get("OCR_API_KEY") ?? "";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.5-flash";
const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function sanitizeAI(resp: string): string {
  return resp.replace(/```json/gi, "").replace(/```/g, "").replace(/^[^\{\[]+/, "").trim();
}

function safeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Accept partial AI output; normalize into the schema resumes.content expects. */
function normalizeResumeParsed(obj: any): Record<string, unknown> | null {
  if (!obj || typeof obj !== "object") return null;
  const cleanText = (value: unknown, max = 4000): string | null => {
    if (typeof value !== "string") return null;
    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized ? normalized.slice(0, max) : null;
  };
  const cleanList = (value: unknown, max = 100): string[] =>
    Array.isArray(value)
      ? value
          .map((item) => cleanText(item, 200))
          .filter((item): item is string => Boolean(item))
          .slice(0, max)
      : [];
  const cleanObjects = (value: unknown, max = 100): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item)))
          .slice(0, max)
      : [];
  const name =
    cleanText(obj.name, 200) ||
    cleanText(obj.full_name, 200) ||
    "";
  const summary =
    cleanText(obj.summary) ||
    cleanText(obj.profile) ||
    "";
  const skills = cleanList(obj.skills);
  const experience = cleanObjects(obj.experience);
  const education = cleanObjects(obj.education);
  const projects = cleanObjects(obj.projects);

  // Require at least one useful signal — not every key present.
  if (!name && !summary && skills.length === 0 && experience.length === 0) {
    return null;
  }

  return {
    name,
    full_name: name || null,
    summary,
    skills,
    experience,
    education,
    projects,
    email: cleanText(obj.email, 320),
    phone: cleanText(obj.phone, 80),
    location: cleanText(obj.location, 200),
    total_years_experience:
      typeof obj.total_years_experience === "number" && Number.isFinite(obj.total_years_experience)
        ? Math.max(0, Math.min(60, obj.total_years_experience))
        : null,
  };
}

function isValidResumeSchema(obj: any): boolean {
  return normalizeResumeParsed(obj) !== null;
}

function buildParseSuccess(source: string, parsed: unknown) {
  return { success: true, source, parsed, content: JSON.stringify(parsed) };
}

async function callGemini(contents: any[]) {
  if (!GEMINI_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: contents }],
          systemInstruction: { parts: [{ text: "Extract structured resume JSON ONLY. NO markdown. NO commentary. Follow schema EXACTLY." }] },
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
        }),
      }
    );
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

async function callClaude(pdfBase64: string) {
  if (!ANTHROPIC_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": ANTHROPIC_API_KEY },
      body: JSON.stringify({
        model: CLAUDE_MODEL, max_tokens: 4096,
        system: "Extract ONLY structured resume JSON matching the required schema.",
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Return pure JSON ONLY." },
        ]}],
      }),
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json = await res.json();
    const textBlock = json?.content?.find((x: any) => x.type === "text");
    return sanitizeAI(textBlock?.text ?? "");
  } catch { clearTimeout(timeout); return null; }
}

async function ocrExtract(pdfBase64: string): Promise<string | null> {
  if (!OCR_API_KEY) return null;
  try {
    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: OCR_API_KEY },
      body: new URLSearchParams({
        base64Image: `data:application/pdf;base64,${pdfBase64}`,
        language: "eng", OCREngine: "2", scale: "true",
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.ParsedResults?.[0]?.ParsedText ?? "").replace(/[^\x20-\x7E\n]/g, "").replace(/\s{2,}/g, " ").trim();
  } catch { return null; }
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

/** Extract plain text from a DOCX (OOXML) zip. */
async function extractDocxText(bytes: Uint8Array): Promise<string | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const docXml = await zip.file("word/document.xml")?.async("string");
    if (!docXml) return null;
    const text = docXml
      .replace(/<w:tab[^/]*\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<w:br[^/]*\/>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    return text.length >= 20 ? text : null;
  } catch {
    return null;
  }
}

async function parseFromPlainText(
  text: string,
  prompt: string,
): Promise<unknown | null> {
  const clipped = text.slice(0, 80_000);
  const geminiRaw = await callGemini([
    { text: `${prompt}\n\nResume text:\n${clipped}` },
  ]);
  if (geminiRaw) {
    const parsed = parseJSON(sanitizeAI(geminiRaw), null);
    if (parsed && isValidResumeSchema(parsed)) return parsed;
  }
  return null;
}
/**
 * Fan parsed resume out to documents (primary resume row) and backfill
 * profiles.target_role / headline when empty. All writes are best-effort —
 * a failure here must NOT fail the overall parse call.
 */
async function fanOutResume(db: any, userId: string, parsed: any): Promise<void> {
  try {
    const skills = Array.isArray(parsed?.skills) ? parsed.skills.map((s: any) => String(s)).slice(0, 100) : [];
    const experience = Array.isArray(parsed?.experience) ? parsed.experience : [];
    const education = Array.isArray(parsed?.education) ? parsed.education : [];
    const summary = typeof parsed?.summary === "string" ? parsed.summary.slice(0, 4000) : null;
    const headline =
      typeof parsed?.headline === "string"
        ? parsed.headline
        : (experience[0]?.title ? String(experience[0].title) : null);

    // Upsert into the user's primary resume document
    const { data: existingDoc } = await db
      .from("documents")
      .select("id")
      .eq("user_id", userId)
      .eq("type", "resume")
      .eq("is_primary", true)
      .maybeSingle();

    if (existingDoc?.id) {
      await db.from("documents").update({
        parsed_skills: skills,
        parsed_experience: experience,
        parsed_education: education,
        parsed_summary: summary,
        updated_at: new Date().toISOString(),
      }).eq("id", existingDoc.id);
    }

    // Backfill profile fields only when currently empty (never overwrite user input)
    const { data: profile } = await db
      .from("profiles")
      .select("target_role, headline")
      .eq("id", userId)
      .maybeSingle();

    const patch: Record<string, any> = {};
    if (profile && !profile.target_role && headline) patch.target_role = String(headline).slice(0, 120);
    if (profile && !profile.headline && headline) patch.headline = String(headline).slice(0, 200);
    if (Object.keys(patch).length > 0) {
      patch.updated_at = new Date().toISOString();
      await db.from("profiles").update(patch).eq("id", userId);
    }
  } catch (err) {
    console.error("[parse-resume] fanOutResume failed (non-fatal):", err);
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { userId } = await requireAuth(req);

    const rateLimited = await enforceAiRateLimitAsync(
      createServiceClient(),
      "parse-resume",
      userId,
    );
    if (rateLimited) return rateLimited;

    // ── Document upload limit enforcement ──
    const { data: profileRow } = await db
      .from("profiles")
      .select("plan_id, onboarding_completed")
      .eq("id", userId)
      .maybeSingle();

    const planId = profileRow?.plan_id ?? "free";

    const capabilityGate = requireCapabilityForFunction(planId, "parse-resume", req);
    if (capabilityGate) return capabilityGate;

    // P0-4: First resume parse during onboarding is free once; later parses charge.
    const onboardingHeader = req.headers.get("x-clarify-onboarding-parse") === "1";
    const waiveCredits =
      onboardingHeader || profileRow?.onboarding_completed === false;

    const docLimits: Record<string, number> = { free: 5, pro: 50 };
    const maxDocs = docLimits[planId] ?? Infinity;

    if (maxDocs !== Infinity) {
      const { count } = await db
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if ((count ?? 0) >= maxDocs) {
        return new Response(
          JSON.stringify({
            error: "Document limit reached",
            code: "DOCUMENT_LIMIT",
            message: `Your ${planId} plan allows ${maxDocs} documents. ${planId === "free" ? "Upgrade to Pro for 50 documents." : "Contact us for enterprise access."}`,
            upgrade_url: "/pricing",
          }),
          { status: 403, headers: getCorsHeaders(req) },
        );
      }
    }

    const { resume_id, version_id, mime_type } = await req.json();

    if (!resume_id) {
      return new Response(JSON.stringify({ error: "Missing resume_id", code: "BAD_REQUEST" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // Verify resume belongs to user and load authoritative storage path from DB.
    const { data: resumeRow } = await db.from("resumes").select("id, user_id, file_path").eq("id", resume_id).single();
    if (!resumeRow || resumeRow.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Resume not found or not yours.", code: "FORBIDDEN" }), { status: 403, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const file_path = resumeRow.file_path;
    if (
      !file_path ||
      file_path.includes("..") ||
      !file_path.startsWith(`${userId}/`)
    ) {
      return new Response(JSON.stringify({ error: "Resume file path missing or invalid.", code: "NOT_FOUND" }), { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    // If version_id provided, verify it
    let effectiveVersionId = version_id;
    if (version_id) {
      const { data: versionRow } = await db.from("resume_versions").select("id, resume_id").eq("id", version_id).single();
      if (!versionRow || versionRow.resume_id !== resume_id) {
        return new Response(JSON.stringify({ error: "Version not found.", code: "NOT_FOUND" }), { status: 404, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
    } else {
      // Create a version record if not provided
      const { data: newVersion } = await db.from("resume_versions").insert({ resume_id, parse_status: "pending" }).select().single();
      effectiveVersionId = newVersion?.id;
    }

    // Download file from private Storage bucket using service role
    const { data: fileData, error: downloadError } = await db.storage.from("resumes").download(file_path);
    if (downloadError || !fileData) {
      console.error("Storage download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download resume file", code: "PARSER_UNAVAILABLE" }), { status: 503, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const buf = await fileData.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
      return new Response(JSON.stringify({ error: "File empty or too large", code: "BAD_REQUEST" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
    }

    const fileBytes = new Uint8Array(buf);

    // SHA-256 content fingerprint for duplicate detection
    const hashBuf = await crypto.subtle.digest("SHA-256", buf);
    const contentHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Same user + same bytes already parsed elsewhere → return existing without re-charge
    const { data: dupRow } = await db
      .from("resumes")
      .select("id, content")
      .eq("user_id", userId)
      .eq("content_hash", contentHash)
      .neq("id", resume_id)
      .not("content", "is", null)
      .limit(1)
      .maybeSingle();

    if (dupRow?.content) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(String(dupRow.content));
      } catch {
        parsed = { text: dupRow.content };
      }
      await db
        .from("resumes")
        .update({ content: dupRow.content, content_hash: contentHash })
        .eq("id", resume_id);
      if (effectiveVersionId) {
        await db
          .from("resume_versions")
          .update({
            parsed_data: parsed,
            parse_status: "ready",
            parse_error: null,
          })
          .eq("id", effectiveVersionId);
      }
      return new Response(
        JSON.stringify({
          ...buildParseSuccess("duplicate", parsed),
          duplicate: true,
          code: "DUPLICATE_DOCUMENT",
          message: "Identical resume content already on file — no additional credit charged.",
        }),
        { headers: getCorsHeaders(req) },
      );
    }

    // Store hash on current resume for future dedupe
    await db.from("resumes").update({ content_hash: contentHash }).eq("id", resume_id);

    const mimeCheck = resolveUploadMime(mime_type ?? null, {
      filePath: file_path,
      bytes: fileBytes,
    });
    if (!mimeCheck.ok) {
      return new Response(
        JSON.stringify({ error: mimeCheck.reason, code: "BAD_REQUEST" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    const resolvedMime = mimeCheck.mimeType;

    if (resolvedMime === "application/pdf" && !looksLikePdf(fileBytes)) {
      return new Response(
        JSON.stringify({ error: "File content does not match PDF format.", code: "BAD_REQUEST" }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    if (resolvedMime === "application/msword") {
      return new Response(
        JSON.stringify({
          error: "Legacy .doc files are not supported. Please upload PDF, DOCX, or TXT.",
          code: "BAD_REQUEST",
        }),
        { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Update status → processing
    if (effectiveVersionId) {
      await db.from("resume_versions").update({ parse_status: "processing" }).eq("id", effectiveVersionId);
    }

    const base64 = safeBase64(fileBytes);

    let creditsDeducted = false;
    if (!waiveCredits) {
      const creditResult = await deductCreditsAtomic({
        userId,
        action: "resume_analysis",
        cost: RESUME_PARSE_COST,
        idempotencyKey: req.headers.get("x-idempotency-key") || crypto.randomUUID(),
      });
      if (!creditResult.success) {
        return new Response(
          JSON.stringify({
            error: "Insufficient credits.",
            code: "INSUFFICIENT_CREDITS",
            message: `Resume analysis costs ${RESUME_PARSE_COST} credits.`,
          }),
          {
            status: 402,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          },
        );
      }
      creditsDeducted = true;
    }

    const SCHEMA = `{"name":"","summary":"","skills":[],"experience":[],"projects":[],"education":[],"total_years_experience":null}`;
    const PROMPT = `Extract structured resume information following this schema EXACTLY:\n${SCHEMA}\nReturn ONLY valid JSON. No markdown, no extra text.`;

    const persistSuccess = async (source: string, parsed: unknown) => {
      const normalized = normalizeResumeParsed(parsed) ?? parsed;
      await db.from("resumes").update({ content: JSON.stringify(normalized) }).eq("id", resume_id);
      if (effectiveVersionId) {
        await db.from("resume_versions").update({ parsed_data: normalized, parse_status: "ready", parse_error: null }).eq("id", effectiveVersionId);
      }
      await fanOutResume(db, userId, normalized);
      return new Response(JSON.stringify(buildParseSuccess(source, normalized)), { headers: getCorsHeaders(req) });
    };

    // ── TXT / plain text ──────────────────────────────────────────
    if (resolvedMime === "text/plain") {
      const text = bytesToUtf8(fileBytes).trim();
      if (text.length < 20) {
        if (creditsDeducted) {
          await refundCredits({ userId, cost: RESUME_PARSE_COST, reason: "refund_parse_resume_failed" });
        }
        if (effectiveVersionId) {
          await db.from("resume_versions").update({ parse_status: "error", parse_error: "Text file is empty or too short" }).eq("id", effectiveVersionId);
        }
        return new Response(JSON.stringify({ error: "Text file is empty or too short to parse.", code: "BAD_REQUEST" }), { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
      }
      const parsed = await parseFromPlainText(text, PROMPT);
      if (parsed) return await persistSuccess("gemini-text", parsed);
    }

    // ── DOCX ──────────────────────────────────────────────────────
    else if (
      resolvedMime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const docxText = await extractDocxText(fileBytes);
      if (docxText) {
        const parsed = await parseFromPlainText(docxText, PROMPT);
        if (parsed) return await persistSuccess("gemini-docx", parsed);
      }
      // Fall through to multimodal/OCR attempts with PDF path only if zip failed
    }

    // ── PDF (and DOCX fallback via OCR if zip extract failed) ─────
    if (resolvedMime === "application/pdf" || looksLikePdf(fileBytes)) {
      const geminiRaw = await callGemini([
        { inline_data: { mime_type: "application/pdf", data: base64 } },
        { text: PROMPT },
      ]);

      if (geminiRaw) {
        const parsed = parseJSON(sanitizeAI(geminiRaw), null);
        const normalized = normalizeResumeParsed(parsed);
        if (normalized) {
          return await persistSuccess("gemini", normalized);
        }
        console.error("[parse-resume] gemini raw failed schema", {
          hasKey: Boolean(GEMINI_API_KEY),
          rawLen: geminiRaw.length,
          parsedKeys: parsed && typeof parsed === "object" ? Object.keys(parsed as object) : [],
        });
      } else {
        console.error("[parse-resume] gemini returned null", { hasKey: Boolean(GEMINI_API_KEY) });
      }

      const claudeRaw = await callClaude(base64);
      if (claudeRaw) {
        const parsed = parseJSON(sanitizeAI(claudeRaw), null);
        const normalized = normalizeResumeParsed(parsed);
        if (normalized) {
          return await persistSuccess("claude", normalized);
        }
      }

      const ocr = await ocrExtract(base64);
      if (ocr) {
        const ocrRaw = await callGemini([{ text: `Extract structured resume from OCR text:\n${ocr}\nReturn JSON matching: ${SCHEMA}` }]);
        if (ocrRaw) {
          const parsed = parseJSON(sanitizeAI(ocrRaw), null);
          const normalized = normalizeResumeParsed(parsed);
          if (normalized) {
            return await persistSuccess("ocr", normalized);
          }
        }
      }
    }

    // ALL FAILED — refund if we charged
    if (creditsDeducted) {
      await refundCredits({
        userId,
        cost: RESUME_PARSE_COST,
        reason: "refund_parse_resume_failed",
      });
    }
    const failMsg = "All extraction methods failed";
    // Persist error onto resumes.content so the UI can leave "Parsing…" and show Retry/Edit.
    await db.from("resumes").update({
      content: JSON.stringify({ _parse_error: failMsg }),
    }).eq("id", resume_id);
    if (effectiveVersionId) {
      await db.from("resume_versions").update({ parse_status: "error", parse_error: failMsg }).eq("id", effectiveVersionId);
    }
    return new Response(JSON.stringify({ error: "Resume parsing failed after all attempts.", code: "PARSER_FAILED" }), { status: 422, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });

  } catch (err) {
    if (err instanceof Response) return err;
    console.error("parse-resume error:", err);
    return new Response(JSON.stringify({ error: "Internal error", code: "INTERNAL_ERROR" }), { status: 500, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } });
  }
});
