// parse-resume/index.ts — FIXED: uses Storage download (private bucket)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/utils.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OCR_API_KEY = Deno.env.get("OCR_API_KEY") ?? "";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.0-flash";
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

function isValidResumeSchema(obj: any): boolean {
  if (!obj || typeof obj !== "object") return false;
  return "name" in obj && "summary" in obj && Array.isArray(obj.skills) && Array.isArray(obj.experience) && Array.isArray(obj.education);
}

async function callGemini(contents: any[]) {
  if (!GEMINI_API_KEY) return null;
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

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { userId } = await requireAuth(req);
    const { resume_id, version_id, file_path } = await req.json();

    if (!resume_id || !file_path) {
      return new Response(JSON.stringify({ error: "Missing resume_id or file_path" }), { status: 400, headers: getCorsHeaders(req) });
    }

    // Verify resume belongs to user
    const { data: resumeRow } = await db.from("resumes").select("id, user_id").eq("id", resume_id).single();
    if (!resumeRow || resumeRow.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Resume not found or not yours." }), { status: 403, headers: getCorsHeaders(req) });
    }

    // If version_id provided, verify it
    let effectiveVersionId = version_id;
    if (version_id) {
      const { data: versionRow } = await db.from("resume_versions").select("id, resume_id").eq("id", version_id).single();
      if (!versionRow || versionRow.resume_id !== resume_id) {
        return new Response(JSON.stringify({ error: "Version not found." }), { status: 403, headers: getCorsHeaders(req) });
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
      return new Response(JSON.stringify({ error: "Failed to download resume file" }), { status: 502, headers: getCorsHeaders(req) });
    }

    const buf = await fileData.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
      return new Response(JSON.stringify({ error: "File empty or too large" }), { status: 400, headers: getCorsHeaders(req) });
    }

    const fileBytes = new Uint8Array(buf);

    // Update status → processing
    if (effectiveVersionId) {
      await db.from("resume_versions").update({ parse_status: "processing" }).eq("id", effectiveVersionId);
    }

    const base64 = safeBase64(fileBytes);

    const SCHEMA = `{"name":"","summary":"","skills":[],"experience":[],"projects":[],"education":[],"total_years_experience":null}`;
    const PROMPT = `Extract structured resume information following this schema EXACTLY:\n${SCHEMA}\nReturn ONLY valid JSON. No markdown, no extra text.`;

    // LAYER 1: GEMINI
    const geminiRaw = await callGemini([
      { inline_data: { mime_type: "application/pdf", data: base64 } },
      { text: PROMPT },
    ]);

    if (geminiRaw) {
      const parsed = parseJSON(sanitizeAI(geminiRaw), null);
      if (parsed && isValidResumeSchema(parsed)) {
        await db.from("resumes").update({ content: JSON.stringify(parsed) }).eq("id", resume_id);
        if (effectiveVersionId) {
          await db.from("resume_versions").update({ parsed_data: parsed, parse_status: "ready", parse_error: null }).eq("id", effectiveVersionId);
        }
        await fanOutResume(db, userId, parsed);
        return new Response(JSON.stringify({ success: true, source: "gemini", parsed }), { headers: getCorsHeaders(req) });
      }
    }

    // LAYER 2: CLAUDE
    const claudeRaw = await callClaude(base64);
    if (claudeRaw) {
      const parsed = parseJSON(sanitizeAI(claudeRaw), null);
      if (parsed && isValidResumeSchema(parsed)) {
        await db.from("resumes").update({ content: JSON.stringify(parsed) }).eq("id", resume_id);
        if (effectiveVersionId) {
          await db.from("resume_versions").update({ parsed_data: parsed, parse_status: "ready", parse_error: null }).eq("id", effectiveVersionId);
        }
        return new Response(JSON.stringify({ success: true, source: "claude", parsed }), { headers: getCorsHeaders(req) });
      }
    }

    // LAYER 3: OCR + GEMINI
    const ocr = await ocrExtract(base64);
    if (ocr) {
      const ocrRaw = await callGemini([{ text: `Extract structured resume from OCR text:\n${ocr}\nReturn JSON matching: ${SCHEMA}` }]);
      if (ocrRaw) {
        const parsed = parseJSON(sanitizeAI(ocrRaw), null);
        if (parsed && isValidResumeSchema(parsed)) {
          await db.from("resumes").update({ content: JSON.stringify(parsed) }).eq("id", resume_id);
          if (effectiveVersionId) {
            await db.from("resume_versions").update({ parsed_data: parsed, parse_status: "ready", parse_error: null }).eq("id", effectiveVersionId);
          }
          return new Response(JSON.stringify({ success: true, source: "ocr", parsed }), { headers: getCorsHeaders(req) });
        }
      }
    }

    // ALL FAILED
    if (effectiveVersionId) {
      await db.from("resume_versions").update({ parse_status: "error", parse_error: "All extraction methods failed" }).eq("id", effectiveVersionId);
    }
    return new Response(JSON.stringify({ error: "Resume parsing failed after all attempts." }), { status: 500, headers: getCorsHeaders(req) });

  } catch (err) {
    console.error("parse-resume error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500, headers: getCorsHeaders(req) });
  }
});
