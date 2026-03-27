// parse-resume/index.ts — HYBRID VERSION (Gemini → Claude → OCR)

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";

/* -------------------------------------------------------------------------- */
/*                                 CONSTANTS                                  */
/* -------------------------------------------------------------------------- */

const GEMINI_API_KEY   = Deno.env.get("GEMINI_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OCR_API_KEY       = Deno.env.get("OCR_API_KEY") ?? "";

const GEMINI_BASE      = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL     = "gemini-2.0-flash";
const CLAUDE_MODEL     = "claude-3-5-sonnet-20241022";

const MAX_FILE_BYTES   = 10 * 1024 * 1024;

/* -------------------------------------------------------------------------- */
/*                              UTILITY HELPERS                                */
/* -------------------------------------------------------------------------- */

function safeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function assertSchema(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (!Array.isArray(obj.skills)) return false;
  if (!Array.isArray(obj.experience)) return false;
  if (!Array.isArray(obj.projects)) return false;
  if (!Array.isArray(obj.education)) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/*                           GEMINI CALL (PRIMARY)                             */
/* -------------------------------------------------------------------------- */

async function callGemini(parts: any[]) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

  try {
    const res = await fetch(
      `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
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
/*                             CLAUDE CALL (FALLBACK)                           */
/* -------------------------------------------------------------------------- */

async function callClaude(pdfBase64: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 50_000);

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
        system: `
Extract structured resume JSON ONLY (no markdown).  
Follow schema strictly.  
`,
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
              { type: "text", text: "Extract resume JSON only." },
            ],
          },
        ],
      }),
    });

    clearTimeout(timeout);
    if (!res.ok) return null;

    const json = await res.json();
    const blk = json?.content?.find((x: any) => x.type === "text");
    return blk?.text ?? null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                               OCR FALLBACK                                   */
/* -------------------------------------------------------------------------- */

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
    return json?.ParsedResults?.[0]?.ParsedText ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                                    SERVE                                    */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    /* ------------------------ Load body ------------------------ */
    const { resume_id, version_id, file_url } = await req.json();

    if (!resume_id || !version_id || !file_url) {
      return new Response(
        JSON.stringify({ error: "Missing resume_id, version_id, file_url" }),
        { status: 400, headers: { ...corsHeaders } }
      );
    }

    /* ------------------------ Ownership ------------------------ */
    const { data: versionRow } = await db
      .from("resume_versions")
      .select("id, resume_id")
      .eq("id", version_id)
      .eq("resume_id", resume_id)
      .single();

    if (!versionRow) {
      return new Response(
        JSON.stringify({ error: "Version not found or denied" }),
        { status: 403, headers: { ...corsHeaders } }
      );
    }

    /* ------------------------ Secure fetch ------------------------ */
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const allowedHost = new URL(supabaseUrl).hostname;

    let parsed: URL;
    try {
      parsed = new URL(file_url);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid file_url" }), {
        status: 400,
        headers: { ...corsHeaders },
      });
    }

    if (parsed.hostname !== allowedHost) {
      return new Response(
        JSON.stringify({ error: "file_url must be from this Supabase project only" }),
        { status: 400, headers: { ...corsHeaders } }
      );
    }

    if (!parsed.pathname.startsWith("/storage/v1/object/public/resumes/")) {
      return new Response(
        JSON.stringify({ error: "file_url must be inside the resumes bucket" }),
        { status: 400, headers: { ...corsHeaders } }
      );
    }

    /* ------------------------ Download file ------------------------ */
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let fileBytes: Uint8Array;

    try {
      const res = await fetch(file_url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) throw new Error("Fetch failed");

      const buf = await res.arrayBuffer();
      if (!buf.byteLength) throw new Error("Empty file");
      if (buf.byteLength > MAX_FILE_BYTES) throw new Error("Too large");

      fileBytes = new Uint8Array(buf);
    } catch {
      clearTimeout(timeout);
      return new Response(
        JSON.stringify({ error: "Failed to fetch file" }),
        { status: 502, headers: { ...corsHeaders } }
      );
    }

    /* ------------------------ Set status ------------------------ */
    await db.from("resume_versions").update({ parse_status: "processing" }).eq("id", version_id);

    /* ------------------------ Build prompt ------------------------ */
    const base64 = safeBase64(fileBytes);

    const SCHEMA = `{
  "name": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [{"title": string, "company": string, "duration": string, "description": string}],
  "projects": [{"name": string, "description": string, "tech_stack": string[]}],
  "education": [{"degree": string, "institution": string, "year": string | null}],
  "total_years_experience": number | null
}`;

    const PROMPT = `
Extract structured resume information.  
Return ONLY JSON that matches this schema exactly:

${SCHEMA}

No markdown, no commentary.`.trim();

    /* ====================================================================== */
    /*                     LAYER 1 — GEMINI (Primary)                         */
    /* ====================================================================== */

    const geminiRaw = await callGemini([
      { inline_data: { mime_type: "application/pdf", data: base64 } },
      { text: PROMPT },
    ]);

    if (geminiRaw) {
      const parsed = parseJSON(geminiRaw, null);

      if (parsed && assertSchema(parsed)) {
        await db.from("resume_versions")
          .update({ parsed_data: parsed, parse_status: "ready", parse_error: null })
          .eq("id", version_id);

        return new Response(
          JSON.stringify({ success: true, source: "gemini", parsed }),
          { headers: { ...corsHeaders } }
        );
      }
    }

    /* ====================================================================== */
    /*                     LAYER 2 — CLAUDE (Fallback)                        */
    /* ====================================================================== */

    const claudeRaw = await callClaude(base64);

    if (claudeRaw) {
      const parsed = parseJSON(claudeRaw, null);

      if (parsed && assertSchema(parsed)) {
        await db.from("resume_versions")
          .update({ parsed_data: parsed, parse_status: "ready", parse_error: null })
          .eq("id", version_id);

        return new Response(
          JSON.stringify({ success: true, source: "claude", parsed }),
          { headers: { ...corsHeaders } }
        );
      }
    }

    /* ====================================================================== */
    /*                     LAYER 3 — OCR (Final fallback)                     */
    /* ====================================================================== */

    const ocr = await ocrExtract(base64);

    if (ocr) {
      const prompt = `
Extract resume information from this OCR text:

${ocr}

Return JSON matching this schema:

${SCHEMA}

No explanation.`.trim();

      const ocrRaw = await callGemini([{ text: prompt }]);

      if (ocrRaw) {
        const parsed = parseJSON(ocrRaw, null);

        if (parsed && assertSchema(parsed)) {
          await db.from("resume_versions")
            .update({ parsed_data: parsed, parse_status: "ready", parse_error: null })
            .eq("id", version_id);

          return new Response(
            JSON.stringify({ success: true, source: "ocr", parsed }),
            { headers: { ...corsHeaders } }
          );
        }
      }
    }

    /* ====================================================================== */
    /*                           ALL METHODS FAILED                            */
    /* ====================================================================== */

    await db.from("resume_versions")
      .update({ parse_status: "error", parse_error: "All extraction methods failed" })
      .eq("id", version_id);

    return new Response(
      JSON.stringify({ error: "Resume parsing failed (Gemini → Claude → OCR all failed)" }),
      { status: 500, headers: { ...corsHeaders } }
    );

  } catch (err) {
    console.error("parse-resume hybrid error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders } }
    );
  }
});
``
