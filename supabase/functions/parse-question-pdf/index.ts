// parse-question-pdf/index.ts

import { corsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  getAdminClient,
  errorResponse,
  successResponse,
  deductCredits,
} from "../_shared/utils.ts";

const CREDIT_COST = 5;

// ---------------- UTILITIES ----------------

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

async function extractPdfBase64(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("pdf");
    if (file instanceof File) return bufferToBase64(await file.arrayBuffer());
    return null;
  }

  if (ct.includes("application/json") || ct === "") {
    try {
      const body = await req.json();
      return body?.pdf_base64 ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

// ---------------- SUPABASE LOGGING (DEBUG ONLY) ---------------

async function debugLogToDB(enabled: boolean, data: any) {
  if (!enabled) return;
  try {
    const admin = getAdminClient();
    await admin.from("parser_logs").insert({
      created_at: new Date().toISOString(),
      payload: data,
    });
  } catch (_) {}
}

// ---------------- OCR CLEANUP ----------------

function cleanOCRText(t: string): string {
  return t
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ---------------- OCR FALLBACK (OCR.Space) ----------------

async function ocrExtract(pdfBase64: string): Promise<string | null> {
  const key = Deno.env.get("OCR_API_KEY");
  if (!key) return null;

  try {
    const res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { apikey: key },
      body: new URLSearchParams({
        base64Image: `data:application/pdf;base64,${pdfBase64}`,
        language: "eng",
        scale: "true",
        OCREngine: "2",
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    return cleanOCRText(json?.ParsedResults?.[0]?.ParsedText ?? "");
  } catch {
    return null;
  }
}

// ---------------- SUBJECT DETECTION ----------------

function detectSubject(text: string): string {
  const t = text.toLowerCase();

  const subjects = [
    { k: "physics", w: ["velocity", "force", "energy", "momentum"] },
    { k: "chemistry", w: ["reaction", "compound", "molecule"] },
    { k: "mathematics", w: ["integration", "derivative", "matrix"] },
    { k: "biology", w: ["cell", "organism", "photosynthesis"] },
    { k: "history", w: ["empire", "war", "king"] },
    { k: "geography", w: ["river", "mountain", "climate"] },
    { k: "economics", w: ["inflation", "gdp", "supply"] },
    { k: "reasoning", w: ["pattern", "series", "logical"] },
    { k: "english", w: ["grammar", "synonym", "antonym"] },
  ];

  for (const s of subjects) {
    if (s.w.some(w => t.includes(w))) return s.k;
  }

  return "general";
}

// ---------------- TOPIC DETECTION ----------------

function detectTopic(subject: string, text: string): string {
  const t = text.toLowerCase();
  const map: Record<string, any[]> = {
    physics: [
      { topic: "mechanics", words: ["force", "motion", "newton"] },
      { topic: "electricity", words: ["voltage", "current", "charge"] },
    ],
    mathematics: [
      { topic: "calculus", words: ["derivative", "integral"] },
      { topic: "algebra", words: ["equation", "polynomial"] },
    ],
  };

  const list = map[subject] || [];
  for (const x of list) {
    if (x.words.some((w) => t.includes(w))) return x.topic;
  }
  return "general";
}

// ---------------- DIFFICULTY ----------------

function classifyDifficulty(text: string): "EASY" | "MEDIUM" | "HARD" {
  const t = text.toLowerCase();
  if (["define", "what is"].some(w => t.includes(w))) return "EASY";
  if (["derive", "calculate", "prove"].some(w => t.includes(w))) return "HARD";
  return "MEDIUM";
}

// ---------------- SMART MCQ ANSWER DETECTION ----------------

function detectMCQAnswer(block: string): string {
  const direct = block.match(/answer[:\s]+([A-D])/i);
  if (direct) return direct[1].toUpperCase();

  const number = block.match(/answer[:\s]+([1-4])/i);
  if (number) return "ABCD"[parseInt(number[1]) - 1];

  const option = block.match(/option\s*\(?([A-D])\)?/i);
  if (option) return option[1].toUpperCase();

  return "";
}

// ---------------- MANUAL PARSER ----------------

function manualParse(text: string) {
  const questions = [];
  const blocks = text.split(/(?=\b\d+\.)/g);

  for (const blk of blocks) {
    const qMatch = blk.match(/^\d+\.\s*(.+?)(?=(A\.|$))/s);
    if (!qMatch) continue;

    const questionText = qMatch[1].trim();

    const optRegex = /A\.\s*(.*?)\s*B\.\s*(.*?)\s*C\.\s*(.*?)\s*D\.\s*(.*?)(Answer|$)/s;
    const optMatch = blk.match(optRegex);

    let options = null;
    if (optMatch) {
      options = [
        { label: "A", text: optMatch[1].trim() },
        { label: "B", text: optMatch[2].trim() },
        { label: "C", text: optMatch[3].trim() },
        { label: "D", text: optMatch[4].trim() },
      ];
    }

    const correct = detectMCQAnswer(blk);

    const subject = detectSubject(questionText);
    const topic = detectTopic(subject, questionText);

    questions.push({
      question_text: questionText,
      question_type: options ? "MCQ" : "SHORT_ANSWER",
      options,
      correct_answer: correct,
      explanation: "",
      subject,
      topic,
      difficulty: classifyDifficulty(questionText),
      marks_positive: 1,
      marks_negative: 0,
      source_year: null,
      exam_type: null,
      latex_present: /[=+\-*\/]/.test(questionText),
    });
  }

  return questions;
}

// ---------------- AI FALLBACK ----------------

const EXTRACTION_SYSTEM_PROMPT = `
Extract all questions. Return ONLY a JSON array.
No markdown. No comments. No explanation.
`;

async function callClaude(pdfBase64: string, apiKey: string) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        system: EXTRACTION_SYSTEM_PROMPT,
        max_tokens: 8000,
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
              { type: "text", text: "Extract questions." },
            ],
          },
        ],
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const block = json?.content?.find((x: any) => x.type === "text");
    return JSON.parse(block?.text ?? "[]");
  } catch {
    return null;
  }
}

// ---------------- MAIN HANDLER ----------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const debug = new URL(req.url).searchParams.get("debug") === "true";

  try {
    const auth = await requireAuth(req);
    const { userId, credits } = auth;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return errorResponse("Claude API missing.", "AI_MISSING", 500);

    const pdfBase64 = await extractPdfBase64(req);
    if (!pdfBase64) return errorResponse("No PDF uploaded.", "NO_PDF", 400);

    // 1) MANUAL TEXT PARSE (light extraction)
    const text = cleanOCRText(atob(pdfBase64));
    const manual = manualParse(text);

    if (manual.length > 0) {
      await debugLogToDB(debug, { mode: "manual", manual });
      return successResponse({ questions: manual, mode: "manual" });
    }

    // 2) OCR FALLBACK
    const ocrText = await ocrExtract(pdfBase64);
    if (ocrText) {
      const ocrRes = manualParse(ocrText);
      if (ocrRes.length > 0) {
        await debugLogToDB(debug, { mode: "ocr", ocrRes });
        return successResponse({ questions: ocrRes, mode: "ocr" });
      }
    }

    // 3) AI FALLBACK
    if (credits !== -1 && credits < CREDIT_COST)
      return errorResponse("Not enough credits.", "NO_CREDITS", 403);

    let charged = false;
    if (credits !== -1) {
      const d = await deductCredits(userId, "parse_question_pdf", CREDIT_COST);
      if (!d.success) return errorResponse("Credit error.", "CREDIT_FAIL", 500);
      charged = true;
    }

    const aiParsed = await callClaude(pdfBase64, apiKey);

    if (aiParsed && aiParsed.length > 0) {
      await debugLogToDB(debug, { mode: "ai", aiParsed });
      return successResponse({ questions: aiParsed, mode: "ai" });
    }

    if (charged) {
      const admin = getAdminClient();
      await admin.rpc("add_credits", {
        p_user_id: userId,
        p_amount: CREDIT_COST,
        p_action: "refund",
        p_description: "AI fallback failed",
      });
    }

    return successResponse({ questions: [], mode: "fallback" });
  } catch (err) {
    console.error(err);
    return errorResponse("Internal error.", "INTERNAL", 500);
  }
});
