import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

// ─────────────────────────────────────────────────────────────────
// parse-resume — parse a resume PDF/file and store structured data
// Accepts: resume_id, version_id, file_url, mime_type
// Stores parsed_data in resume_versions table
// Security: verifies the caller owns the resume before updating.
// ─────────────────────────────────────────────────────────────────

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
    // Verify the version_id belongs to the stated resume_id, and that
    // the resume belongs to the authenticated user via RLS-respecting query.
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

    // Verify resume ownership (resumes table has RLS, but we use service client;
    // so we explicitly check user_id matches the JWT-identified caller).
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^bearer\s+/i, "");

    // Use a user-scoped client to confirm ownership via RLS
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
    // Only allow HTTPS fetches to the project's own Supabase storage.
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

    // ── Fetch and extract file text ──────────────────────────────
    let rawText = "";
    try {
      const fileResp = await fetch(file_url);
      if (fileResp.ok) {
        const contentType = fileResp.headers.get("content-type") ?? "";
        if (contentType.includes("text") || mime_type === "text/plain") {
          rawText = await fileResp.text();
        } else {
          // For PDFs, extract readable ASCII text from binary content
          const buffer  = await fileResp.arrayBuffer();
          const bytes   = new Uint8Array(buffer);
          const decoder = new TextDecoder("utf-8", { fatal: false });
          const decoded = decoder.decode(bytes);
          rawText = decoded
            .replace(/[^\x20-\x7E\n\r\t]/g, " ")
            .replace(/\s{3,}/g, "\n")
            .trim()
            .slice(0, 6000);
        }
      }
    } catch (fetchErr) {
      console.warn("parse-resume: could not fetch file:", fetchErr);
    }

    const prompt = `Extract structured information from this resume.
Return ONLY valid JSON matching this schema exactly:
{
  "name": string | null,
  "summary": string | null,
  "skills": string[],
  "experience": [
    {
      "title": string,
      "company": string,
      "duration": string,
      "description": string
    }
  ],
  "projects": [
    {
      "name": string,
      "description": string,
      "tech_stack": string[]
    }
  ],
  "education": [
    {
      "degree": string,
      "institution": string,
      "year": string | null
    }
  ],
  "total_years_experience": number | null
}

Resume text:
${rawText.slice(0, 5000)}

Return ONLY valid JSON. No markdown, no explanation.`;

    const raw    = await geminiGenerate(prompt, undefined, 0.3, 1500);
    const parsed = parseJSON(raw, {
      name:                    null,
      summary:                 null,
      skills:                  [],
      experience:              [],
      projects:                [],
      education:               [],
      total_years_experience:  null,
    });

    // ── Store parsed data (using service client after ownership is verified) ──
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
