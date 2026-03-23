import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// parse-resume — parse a resume PDF/file and store structured data
// Accepts: resume_id, version_id, file_url, mime_type
// Stores parsed_data in resume_versions table
// Security: verifies the caller owns the resume before updating.
// ─────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";
const MODEL          = "gemini-1.5-flash";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { resume_id, version_id, file_url, mime_type } = await req.json();

    if (!resume_id || !version_id || !file_url) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: resume_id, version_id, file_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Ownership check ──────────────────────────────────────────
    const { data: versionRow, error: vErr } = await db
      .from("resume_versions")
      .select("id, resume_id")
      .eq("id", version_id)
      .eq("resume_id", resume_id)
      .single();

    if (vErr || !versionRow) {
      return new Response(
        JSON.stringify({ error: "Resume version not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^bearer\s+/i, "");

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: resumeRow, error: rErr } = await userClient
      .from("resumes")
      .select("id, user_id")
      .eq("id", resume_id)
      .single();

    if (rErr || !resumeRow) {
      return new Response(
        JSON.stringify({ error: "Resume not found or access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── SSRF mitigation: validate file_url domain ────────────────
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const allowedHost = new URL(supabaseUrl).hostname;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(file_url);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid file_url" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== allowedHost) {
      return new Response(
        JSON.stringify({ error: "file_url must point to this project's Supabase storage" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!parsedUrl.pathname.startsWith("/storage/v1/object/public/resumes/")) {
      return new Response(
        JSON.stringify({ error: "file_url must be a path in the resumes storage bucket" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Fetch the file ───────────────────────────────────────────
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 30_000);
    let fileBuffer: ArrayBuffer;
    let fetchedMimeType: string;

    try {
      const fileResp = await fetch(file_url, { signal: controller.signal });
      clearTimeout(fetchTimeout);
      if (!fileResp.ok) {
        console.error("parse-resume: file fetch failed with status", fileResp.status);
        return new Response(
          JSON.stringify({ error: `Failed to fetch file: HTTP ${fileResp.status}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      fileBuffer = await fileResp.arrayBuffer();
      fetchedMimeType = fileResp.headers.get("content-type") ?? mime_type ?? "application/pdf";
    } catch (fetchErr) {
      clearTimeout(fetchTimeout);
      console.error("parse-resume: could not fetch file:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Failed to fetch resume file" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Guard: empty file ──────────────────────────────────────────
    if (fileBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: "Fetched file is empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Derive MIME and detect file type ──────────────────────────
    const effectiveMime = fetchedMimeType.split(";")[0].trim() || mime_type || "application/pdf";
    const isPDF  = effectiveMime === "application/pdf" || effectiveMime === "application/x-pdf";
    const isDOCX = effectiveMime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                || effectiveMime === "application/msword";
    const isText = effectiveMime.startsWith("text/");

    if (!isPDF && !isDOCX && !isText) {
      return new Response(
        JSON.stringify({ error: `Unsupported file type: ${effectiveMime}. Only PDF, DOCX, and plain text are supported.` }),
        { status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let raw: string;

    if (isText) {
      // Plain text — decode and send as text prompt
      const textContent = new TextDecoder("utf-8", { fatal: false }).decode(fileBuffer).slice(0, 6000);

      const prompt = `Extract structured information from this resume.
Return ONLY valid JSON matching this schema exactly:
{
  "name": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [{"title": string, "company": string, "duration": string, "description": string}],
  "projects": [{"name": string, "description": string, "tech_stack": string[]}],
  "education": [{"degree": string, "institution": string, "year": string | null}],
  "total_years_experience": number | null
}

Resume text:
${textContent}

Return ONLY valid JSON. No markdown, no explanation.`;

      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 50_000);

      try {
        const res = await fetch(
          `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: aiController.signal,
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
            }),
          }
        );
        clearTimeout(aiTimeout);
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Gemini error: ${err}`);
        }
        const data = await res.json();
        raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } catch (aiErr) {
        clearTimeout(aiTimeout);
        throw aiErr;
      }
    } else {
      // PDF or binary — use Gemini's native inline document support
      // Convert ArrayBuffer to base64
      const bytes = new Uint8Array(fileBuffer);
      const chunkSize = 8192;
      let binary = "";
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const base64Data = btoa(binary);
      const docMimeType = isPDF
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

      const prompt = `Extract structured information from this resume document.
Return ONLY valid JSON matching this schema exactly:
{
  "name": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [{"title": string, "company": string, "duration": string, "description": string}],
  "projects": [{"name": string, "description": string, "tech_stack": string[]}],
  "education": [{"degree": string, "institution": string, "year": string | null}],
  "total_years_experience": number | null
}

Return ONLY valid JSON. No markdown, no explanation.`;

      const aiController = new AbortController();
      const aiTimeout = setTimeout(() => aiController.abort(), 50_000);

      try {
        const res = await fetch(
          `${GEMINI_BASE}/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: aiController.signal,
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      inline_data: {
                        mime_type: docMimeType,
                        data:      base64Data,
                      },
                    },
                    { text: prompt },
                  ],
                },
              ],
              generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
            }),
          }
        );
        clearTimeout(aiTimeout);
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Gemini error: ${err}`);
        }
        const data = await res.json();
        raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } catch (aiErr) {
        clearTimeout(aiTimeout);
        throw aiErr;
      }
    }

    const parsed = parseJSON(raw, {
      name:                    null,
      summary:                 null,
      skills:                  [],
      experience:              [],
      projects:                [],
      education:               [],
      total_years_experience:  null,
    });

    // ── Store parsed data ─────────────────────────────────────────
    const { error: updateErr } = await db
      .from("resume_versions")
      .update({ parsed_data: parsed, parse_status: "ready", parse_error: null })
      .eq("id", version_id)
      .eq("resume_id", resume_id);

    if (updateErr) {
      console.error("parse-resume: failed to update resume_versions:", updateErr);
      await db
        .from("resume_versions")
        .update({ parse_status: "error", parse_error: updateErr.message })
        .eq("id", version_id);

      return new Response(
        JSON.stringify({ error: "Failed to store parsed data" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("parse-resume error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
