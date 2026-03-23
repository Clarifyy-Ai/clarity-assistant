import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE    = "https://generativelanguage.googleapis.com/v1beta";
const MODEL          = "gemini-2.0-flash"; // ★ upgraded

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

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

    // ★ FIX: correct regex — \s not \\s
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

    // ── SSRF mitigation ──────────────────────────────────────────
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
        return new Response(
          JSON.stringify({ error: `Failed to fetch file: HTTP ${fileResp.status}` }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      fileBuffer = await fileResp.arrayBuffer();
      fetchedMimeType = fileResp.headers.get("content-type") ?? mime_type ?? "application/pdf";
    } catch (fetchErr) {
      clearTimeout(fetchTimeout);
      return new Response(
        JSON.stringify({ error: "Failed to fetch resume file" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ★ NEW: file size guard
    if (fileBuffer.byteLength === 0) {
      return new Response(
        JSON.stringify({ error: "Fetched file is empty" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (fileBuffer.byteLength > MAX_FILE_BYTES) {
      return new Response(
        JSON.stringify({ error: "File too large. Maximum size is 10 MB." }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Derive MIME ───────────────────────────────────────────────
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

    // ★ NEW: mark as processing before slow AI call
    await db
      .from("resume_versions")
      .update({ parse_status: "processing" })
      .eq("id", version_id);

    const RESUME_SCHEMA = `{
  "name": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [{"title": string, "company": string, "duration": string, "description": string}],
  "projects": [{"name": string, "description": string, "tech_stack": string[]}],
  "education": [{"degree": string, "institution": string, "year": string | null}],
  "total_years_experience": number | null
}`;

    let raw: string;

    if (isText) {
      const textContent = new TextDecoder("utf-8", { fatal: false }).decode(fileBuffer).slice(0, 8000);
      const prompt = `Extract structured information from this resume.\nReturn ONLY valid JSON matching this schema exactly:\n${RESUME_SCHEMA}\n\nResume text:\n${textContent}\n\nReturn ONLY valid JSON. No markdown, no explanation.`;

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
              generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }, // ★ fixed
            }),
          }
        );
        clearTimeout(aiTimeout);
        if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
        const data = await res.json();
        raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } catch (aiErr) {
        clearTimeout(aiTimeout);
        throw aiErr;
      }
    } else {
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

      const prompt = `Extract structured information from this resume document.\nReturn ONLY valid JSON matching this schema exactly:\n${RESUME_SCHEMA}\n\nReturn ONLY valid JSON. No markdown, no explanation.`;

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
                    { inline_data: { mime_type: docMimeType, data: base64Data } },
                    { text: prompt },
                  ],
                },
              ],
              generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }, // ★ fixed
            }),
          }
        );
        clearTimeout(aiTimeout);
        if (!res.ok) throw new Error(`Gemini error: ${await res.text()}`);
        const data = await res.json();
        raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      } catch (aiErr) {
        clearTimeout(aiTimeout);
        throw aiErr;
      }
    }

    const parsed = parseJSON(raw, {
      name: null, summary: null, skills: [],
      experience: [], projects: [], education: [],
      total_years_experience: null,
    });

    // ── Store parsed data ─────────────────────────────────────────
    const { error: updateErr } = await db
      .from("resume_versions")
      .update({ parsed_data: parsed, parse_status: "ready", parse_error: null })
      .eq("id", version_id)
      .eq("resume_id", resume_id);

    if (updateErr) {
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
