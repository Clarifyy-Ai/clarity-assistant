// parse-resume/index.ts — FIXED, SECURE, PRODUCTION-READY HYBRID VERSION

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/utils.ts";

/* -------------------------------------------------------------------------- */
/*                                CONSTANTS                                   */
/* -------------------------------------------------------------------------- */

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OCR_API_KEY = Deno.env.get("OCR_API_KEY") ?? "";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.0-flash";
const CLAUDE_MODEL = "claude-3-5-sonnet-20241022";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/* -------------------------------------------------------------------------- */
/*                              UTILITY HELPERS                                */
/* -------------------------------------------------------------------------- */

// Sanitize any AI-generated text to reduce JSON parse failures.
function sanitizeAI(resp: string): string {
  return resp
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^[^\{\[]+/, "")
    .trim();
}

function safeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

// Enhanced schema validator
function isValidResumeSchema(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;

  return (
    "name" in obj &&
    "summary" in obj &&
    Array.isArray(obj.skills) &&
    Array.isArray(obj.experience) &&
    Array.isArray(obj.projects) &&
    Array.isArray(obj.education)
  );
}

/* -------------------------------------------------------------------------- */
/*                         GEMINI PRIMARY EXTRACTOR                            */
/* -------------------------------------------------------------------------- */

async function callGemini(contents: any[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: contents }],
          systemInstruction: {
            parts: [
              {
                text: `
Extract structured resume JSON ONLY.
NO markdown. NO commentary.
Follow schema EXACTLY.
`,
              },
            ],
          },
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

/* -------------------------------------------------------------------------- */
/*                             CLAUDE FALLBACK                                 */
/* -------------------------------------------------------------------------- */

async function callClaude(pdfBase64: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": ANTHROPIC_API_KEY,
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        system: `Extract ONLY structured resume JSON matching the required schema.`,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              { type: "text", text: "Return pure JSON ONLY." },
            ],
          },
        ],
      }),
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = await res.json();
    const textBlock = json?.content?.find((x: any) => x.type === "text");
    return sanitizeAI(textBlock?.text ?? "");
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                OCR FALLBACK                                 */
/* -------------------------------------------------------------------------- */

function cleanOCR(text: string): string {
  return text
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function ocrExtract(pdfBase64: string): Promise<string | null> {
  if (!OCR_API_KEY) return null;

  try {
    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: OCR_API_KEY },
      body: new URLSearchParams({
        base64Image: `data:application/pdf;base64,${pdfBase64}`,
        language: "eng",
        OCREngine: "2",
        scale: "true",
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    return cleanOCR(json?.ParsedResults?.[0]?.ParsedText ?? "");
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                MAIN HANDLER                                 */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    /* --------------------------------------------------------
       AUTHENTICATE USER — FIXED (THIS WAS MISSING)
    -------------------------------------------------------- */
    const { userId } = await requireAuth(req);

    /* --------------------------------------------------------
       PARSE BODY
    -------------------------------------------------------- */
    const { resume_id, version_id, file_url } = await req.json();

    if (!resume_id || !version_id || !file_url) {
      return new Response(
        JSON.stringify({ error: "Missing resume_id, version_id, file_url" }),
        { status: 400, headers: corsHeaders }
      );
    }

    /* --------------------------------------------------------
       VERIFY RESUME BELONGS TO USER — FIXED
    -------------------------------------------------------- */
    const { data: resumeRow } = await db
      .from("resumes")
      .select("id, user_id")
      .eq("id", resume_id)
      .single();

    if (!resumeRow || resumeRow.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Resume not found or not yours." }),
        { status: 403, headers: corsHeaders }
      );
    }

    /* --------------------------------------------------------
       VERIFY VERSION BELONGS TO THE SAME RESUME
    -------------------------------------------------------- */
    const { data: versionRow } = await db
      .from("resume_versions")
      .select("id, resume_id")
      .eq("id", version_id)
      .single();

    if (!versionRow || versionRow.resume_id !== resume_id) {
      return new Response(
        JSON.stringify({ error: "Version not found or not part of resume." }),
        { status: 403, headers: corsHeaders }
      );
    }

    /* --------------------------------------------------------
       PROTECT AGAINST SSRF — VALIDATE file_url
    -------------------------------------------------------- */
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const allowedHost = new URL(supabaseUrl).hostname;

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(file_url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid file_url" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (parsedUrl.hostname !== allowedHost)
      return new Response(
        JSON.stringify({ error: "file_url must belong to this project" }),
        { status: 400, headers: corsHeaders }
      );

    if (!parsedUrl.pathname.includes(`/public/resumes/${userId}`))
      return new Response(
        JSON.stringify({
          error: "file_url must be inside the user's resumes folder",
        }),
        { status: 400, headers: corsHeaders }
      );

    /* --------------------------------------------------------
       DOWNLOAD FILE
    -------------------------------------------------------- */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    let fileBytes: Uint8Array;

    try {
      const res = await fetch(file_url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error("Fetch failed");
      const buf = await res.arrayBuffer();

      if (!buf.byteLength) throw new Error("Empty file");
      if (buf.byteLength > MAX_FILE_BYTES) throw new Error("Too large");

      fileBytes = new Uint8Array(buf);
    } catch (err) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: "Failed to fetch file" }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    /* --------------------------------------------------------
       UPDATE STATUS → processing
    -------------------------------------------------------- */
    await db
      .from("resume_versions")
      .update({ parse_status: "processing" })
      .eq("id", version_id);

    const base64 = safeBase64(fileBytes);

    const SCHEMA = `{
  "name": "",
  "summary": "",
  "skills": [],
  "experience": [],
  "projects": [],
  "education": [],
  "total_years_experience": null
}`;

    const PROMPT = `
Extract structured resume information following this schema EXACTLY:

${SCHEMA}

Return ONLY valid JSON. No markdown, no extra text.
`.trim();

    /* ======================================================
       LAYER 1: GEMINI (PRIMARY)
    ====================================================== */

    const geminiRaw = await callGemini([
      { inline_data: { mime_type: "application/pdf", data: base64 } },
      { text: PROMPT },
    ]);

    if (geminiRaw) {
      const parsed = parseJSON(sanitizeAI(geminiRaw), null);

      if (parsed && isValidResumeSchema(parsed)) {
        await db
          .from("resume_versions")
          .update({
            parsed_data: parsed,
            parse_status: "ready",
            parse_error: null,
          })
          .eq("id", version_id);

        return new Response(
          JSON.stringify({ success: true, source: "gemini", parsed }),
          { headers: corsHeaders }
        );
      }
    }

    /* ======================================================
       LAYER 2: CLAUDE (Fallback)
    ====================================================== */

    const claudeRaw = await callClaude(base64);

    if (claudeRaw) {
      const parsed = parseJSON(sanitizeAI(claudeRaw), null);
      if (parsed && isValidResumeSchema(parsed)) {
        await db
          .from("resume_versions")
          .update({
            parsed_data: parsed,
            parse_status: "ready",
            parse_error: null,
          })
          .eq("id", version_id);

        return new Response(
          JSON.stringify({ success: true, source: "claude", parsed }),
          { headers: corsHeaders }
        );
      }
    }

    /* ======================================================
       LAYER 3: OCR + Gemini (Final fallback)
    ====================================================== */

    const ocr = await ocrExtract(base64);

    if (ocr) {
      const prompt = `
Extract structured resume information from this OCR text:

${ocr}

Return JSON that matches EXACTLY this schema:

${SCHEMA}
`.trim();

      const ocrRaw = await callGemini([{ text: prompt }]);

      if (ocrRaw) {
        const parsed = parseJSON(sanitizeAI(ocrRaw), null);

        if (parsed && isValidResumeSchema(parsed)) {
          await db
            .from("resume_versions")
            .update({
              parsed_data: parsed,
              parse_status: "ready",
              parse_error: null,
            })
            .eq("id", version_id);

          return new Response(
            JSON.stringify({ success: true, source: "ocr", parsed }),
            { headers: corsHeaders }
          );
        }
      }
    }

    /* ======================================================
       ALL METHODS FAILED
    ====================================================== */

    await db
      .from("resume_versions")
      .update({
        parse_status: "error",
        parse_error: "All extraction methods failed",
      })
      .eq("id", version_id);

    return new Response(
      JSON.stringify({
        error: "Resume parsing failed after all extraction attempts.",
      }),
      { status: 500, headers: corsHeaders }
    );
  } catch (err) {
    console.error("parse-resume error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: corsHeaders }
    );
  }
});
