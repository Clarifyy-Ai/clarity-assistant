// company-research/index.ts — FIXED VERSION

import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, deductCredits } from "../_shared/supabase.ts";
import { geminiGenerate, parseJSON } from "../_shared/gemini.ts";

const SYSTEM_PROMPT = `
You are an expert career and company research assistant.
Provide structured, factual, and concise company interview insights.
Never output markdown. Only output valid JSON. Be specific and practical.
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    /* ---------------------------------------------------------
       AUTHENTICATE USER SAFELY
    --------------------------------------------------------- */
    const db = createServiceClient();

    const authHeader =
      req.headers.get("authorization") ??
      req.headers.get("Authorization") ??
      "";

    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const token = authHeader.replace(/^bearer\s+/i, "");
    const {
      data: { user },
      error: userErr,
    } = await db.auth.getUser(token);

    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = user.id;

    /* ---------------------------------------------------------
       PARSE & SANITIZE INPUT
    --------------------------------------------------------- */
    const body = await req.json().catch(() => ({}));
    const rawCompany = String(body.company || "").trim();
    const rawRole = body.role ? String(body.role).trim() : "";

    if (!rawCompany) {
      return new Response(
        JSON.stringify({ error: "Missing company name" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const company = rawCompany.slice(0, 100);
    const role = rawRole.slice(0, 100);

    /* ---------------------------------------------------------
       CREDIT DEDUCTION (8 credits)
    --------------------------------------------------------- */
    const credit = await deductCredits(userId, "company_research", 8);
    if (!credit.success) {
      return new Response(
        JSON.stringify({
          error: "Insufficient credits. Company research requires 8 credits.",
        }),
        { status: 402, headers: corsHeaders }
      );
    }

    /* ---------------------------------------------------------
       SAFE PROMPT CONSTRUCTION
    --------------------------------------------------------- */
    const prompt = `
Generate a company research brief for interview preparation.

Company: ${company}
Role: ${role || "General interview"}

Return ONLY valid JSON in this structure:

{
  "overview": "",
  "industry": "",
  "tags": [],
  "interview_process": [],
  "questions": [],
  "values": [],
  "tips": [],
  "watch_outs": []
}

Notes:
- Overview: 3-4 sentence summary.
- Questions: Make them specific to ${company}'s interview style.
- Include both behavioral and technical questions.
- Do not use markdown. Do not add commentary. Only return JSON.
`;

    /* ---------------------------------------------------------
       CALL GEMINI
    --------------------------------------------------------- */
    const raw = await geminiGenerate(prompt, SYSTEM_PROMPT, 0.5, 2000);

    /* ---------------------------------------------------------
       PARSE JSON OUTPUT
    --------------------------------------------------------- */
    const data = parseJSON(raw, {
      overview: "No data available.",
      industry: "",
      tags: [],
      interview_process: [],
      questions: [],
      values: [],
      tips: [],
      watch_outs: [],
    });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("company-research error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
