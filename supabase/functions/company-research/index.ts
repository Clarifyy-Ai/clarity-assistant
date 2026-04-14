// supabase/functions/company-research/index.ts — PRODUCTION READY (ALL FEATURES PRESERVED)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { 
  requireAuth, 
  parseBody, 
  successResponse, 
  errorResponse, 
  deductCredits, 
  callAI, 
  log 
} from "../_shared/utils.ts";
import { parseJSON } from "../_shared/gemini.ts";

const SYSTEM_PROMPT = `
You are an expert career and company research assistant.
Provide structured, factual, and concise company interview insights.
Never output markdown. Only output valid JSON. Be specific and practical.
`;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  
  const FN = "company-research";

  try {
    /* ---------------------------------------------------------
       AUTHENTICATE USER SAFELY
    --------------------------------------------------------- */
    const auth = await requireAuth(req);
    const userId = auth.userId;

    /* ---------------------------------------------------------
       PARSE & SANITIZE INPUT
    --------------------------------------------------------- */
    const body = await parseBody<any>(req);
    const rawCompany = String(body.company || "").trim();
    const rawRole = body.role ? String(body.role).trim() : "";

    if (!rawCompany) {
      return errorResponse("Missing company name", "INVALID_REQUEST", 400);
    }

    // Exact preservation of original sanitization limits
    const company = rawCompany.slice(0, 100);
    const role = rawRole.slice(0, 100);

    /* ---------------------------------------------------------
       CREDIT DEDUCTION (Preserved 8 credits cost)
    --------------------------------------------------------- */
    const credit = await deductCredits(userId, "company_research" as any, 8);
    if (!credit.success) {
      return errorResponse("Insufficient credits. Company research requires 8 credits.", "INSUFFICIENT_CREDITS", 402);
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
       CALL AI & PARSE JSON OUTPUT
    --------------------------------------------------------- */
    const aiResult = await callAI({
      model: "gemini-1.5-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      maxTokens: 2000,
      temperature: 0.5
    });

    const data = parseJSON(aiResult.text, {
      overview: "No data available.",
      industry: "",
      tags: [],
      interview_process: [],
      questions: [],
      values: [],
      tips: [],
      watch_outs: [],
    });

    log(FN, "info", "Company research generated", { userId, company });

    return new Response(JSON.stringify(data), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  } catch (err) {
    if (err instanceof Response) return err;
    log(FN, "error", "company-research error", err);
    return errorResponse("Internal error", "INTERNAL_ERROR", 500);
  }
});
