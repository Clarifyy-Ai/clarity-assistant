import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

// FIXED: Use Deno.serve for consistency
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const db = createServiceClient();

    /* -------------------------------------------------------
       AUTHENTICATE USER SAFELY (service client)
    ------------------------------------------------------- */
    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization");

    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const { data: { user }, error: authErr } = await db.auth.getUser(token);

    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    /* -------------------------------------------------------
       VALIDATE INPUT BODY
    ------------------------------------------------------- */
    const body = await req.json().catch(() => null);

    if (!body ||
        typeof body.resume_id !== "string" ||
        typeof body.jd_id !== "string") {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const resume_id = body.resume_id.trim();
    const jd_id = body.jd_id.trim();

    if (!resume_id || !jd_id) {
      return new Response(JSON.stringify({ error: "Invalid IDs" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    /* -------------------------------------------------------
       FETCH RESUME (ownership enforced)
    ------------------------------------------------------- */
    const { data: resume, error: rErr } = await db
      .from("resumes")
      .select("name, content, url")
      .eq("id", resume_id)
      .eq("user_id", user.id)
      .single();

    if (rErr || !resume) {
      return new Response(
        JSON.stringify({ error: "Resume not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    /* -------------------------------------------------------
       FETCH JOB DESCRIPTION
    ------------------------------------------------------- */
    const { data: jd, error: jErr } = await db
      .from("job_descriptions")
      .select("title, content, target_role, company, parsed_data")
      .eq("id", jd_id)
      .eq("user_id", user.id)
      .single();

    if (jErr || !jd) {
      return new Response(
        JSON.stringify({ error: "Job description not found" }),
        { status: 404, headers: corsHeaders }
      );
    }

    /* -------------------------------------------------------
       CHECK GEMINI KEY
    ------------------------------------------------------- */
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 503, headers: corsHeaders }
      );
    }

    /* -------------------------------------------------------
       SANITIZE & TRIM LARGE CONTENT
    ------------------------------------------------------- */
    const safeResume = String(resume.content ?? "")
      .replace(/\u0000/g, "")
      .slice(0, 3000);

    const safeJD =
      (jd.content ??
        JSON.stringify(jd.parsed_data ?? {}, null, 2))
        .replace(/\u0000/g, "")
        .slice(0, 3000);

    /* -------------------------------------------------------
       BUILD SECURE PROMPT
    ------------------------------------------------------- */
    const prompt = `
Analyze the alignment between this resume and job description.
Return ONLY valid JSON.

Schema:
{
  "match_score": number,
  "matching_skills": string[],
  "missing_skills": string[],
  "recommendations": string[],
  "experience_gap": string,
  "education_fit": string
}

Resume:
${safeResume}

Job Description:
${safeJD}
`.trim();

    /* -------------------------------------------------------
       CALL GEMINI SAFELY
    ------------------------------------------------------- */
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      }
    );

    if (!geminiRes.ok) {
      console.error("Gemini error:", await geminiRes.text());
      throw new Error("AI service failed");
    }

    const geminiData = await geminiRes.json();
    const rawText =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const clean = rawText.replace(/```json|```/g, "").trim();

    /* -------------------------------------------------------
       SAFE JSON PARSING
    ------------------------------------------------------- */
    let analysis = {
      match_score: 0,
      matching_skills: [],
      missing_skills: [],
      recommendations: ["Unable to parse AI response."],
      experience_gap: "Unknown",
      education_fit: "Unknown",
    };

    try {
      const parsed = JSON.parse(clean);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        analysis = { ...analysis, ...parsed };
      }
    } catch (_) {
      // fallback remains
    }

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("resume-jd-analysis error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: corsHeaders }
    );
  }
});
