import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { resume_id, jd_id } = await req.json();
    const db = createServiceClient();

    // Fetch resume content
    const { data: resume } = await db
      .from("resumes")
      .select("name, content, url")
      .eq("id", resume_id)
      .eq("user_id", user.id)
      .single();

    // Fetch JD content
    const { data: jd } = await db
      .from("job_descriptions")
      .select("title, content, target_role, company, parsed_data")
      .eq("id", jd_id)
      .eq("user_id", user.id)
      .single();

    if (!resume || !jd) {
      return new Response(
        JSON.stringify({ error: "Resume or JD not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check for Gemini key
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) {
      return new Response(
        JSON.stringify({ error: "AI service not configured. Add GEMINI_API_KEY to secrets." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prompt = `Analyze the gap between this resume and job description. Return JSON:
{
  "match_score": number (0-100),
  "matching_skills": string[],
  "missing_skills": string[],
  "recommendations": string[],
  "experience_gap": string,
  "education_fit": string
}

Resume: ${(resume.content ?? "No parsed content available").slice(0, 3000)}

Job Description: ${(jd.content ?? JSON.stringify(jd.parsed_data) ?? "").slice(0, 3000)}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = text.replace(/```json|```/g, "").trim();

    let analysis;
    try {
      analysis = JSON.parse(clean);
    } catch {
      analysis = {
        match_score: 0,
        matching_skills: [],
        missing_skills: [],
        recommendations: ["Could not parse AI response"],
        experience_gap: "Unknown",
        education_fit: "Unknown",
      };
    }

    return new Response(
      JSON.stringify(analysis),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
