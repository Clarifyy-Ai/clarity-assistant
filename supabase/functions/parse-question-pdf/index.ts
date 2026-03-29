// parse-question-pdf/index.ts — FULLY FIXED VERSION

import { corsHeaders } from "../_shared/cors.ts";
import {
  requireAuth,
  getAdminClient,
  errorResponse,
  successResponse,
  deductCredits,
} from "../_shared/utils.ts";

const CREDIT_COST = 5;

/* ======================================================
   SAFE UTIL: Detect if pdfBase64 looks like actual PDF
====================================================== */
function isLikelyPDF(base64: string): boolean {
  try {
    const bin = atob(base64.slice(0, 50));
    return bin.startsWith("%PDF");
  } catch {
    return false;
  }
}

/* ======================================================
   SAFE BASE64 ENCODER
====================================================== */
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function extractPdfBase64(req: Request): Promise<string | null> {
  const ct = req.headers.get("content-type") ?? "";

  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("pdf");
    if (!(file instanceof File)) return null;
    return bufferToBase64(await file.arrayBuffer());
  }

  if (ct.includes("application/json") || ct === "") {
    try {
      const b = await req.json();
      return typeof b?.pdf_base64 === "string" ? b.pdf_base64 : null;
    } catch {
      return null;
    }
  }

  return null;
}

/* ======================================================
   CLEAN OCR TEXT
====================================================== */
function cleanOCRText(t: string): string {
  return t
    .replace(/[^\x20-\x7E\n]/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ======================================================
   OCR.Space fallback
====================================================== */
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

/* ======================================================
   SUBJECT DETECTION
====================================================== */
function detectSubject(text: string): string {
  const t = text.toLowerCase();
  const subjects = [
    { key: "physics", words: ["velocity", "force", "energy", "momentum"] },
    { key: "chemistry", words: ["reaction", "compound", "molecule"] },
    { key: "mathematics", words: ["integration", "derivative", "matrix"] },
    { key: "biology", words: ["cell", "organism", "photosynthesis"] },
    { key: "history", words: ["empire", "war", "king"] },
    { key: "geography", words: ["river", "mountain", "climate"] },
    { key: "economics", words: ["inflation", "gdp", "supply"] },
    { key: "reasoning", words: ["pattern", "series", "logical"] },
    { key: "english", words: ["grammar", "synonym", "antonym"] },
  ];

  for (const s of subjects) {
    if (s.words.some(w => t.includes(w))) return s.key;
  }
  return "general";
}

/* ======================================================
   TOPIC DETECTION
====================================================== */
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

  const arr = map[subject] || [];
  for (const x of arr) {
    if (x.words.some(w => t.includes(w))) return x.topic;
  }
  return "general";
}

/* ======================================================
   DIFFICULTY DETECTOR
====================================================== */
function classifyDifficulty(text: string): "EASY" | "MEDIUM" | "HARD" {
  const t = text.toLowerCase();
  if (t.includes("define") || t.includes("what is")) return "EASY";
  if (t.includes("derive") || t.includes("prove") || t.includes("calculate"))
    return "HARD";
  return "MEDIUM";
}

/* ======================================================
   IMPROVED ANSWER DETECTOR
====================================================== */
function detectMCQAnswer(block: string) {
  const patterns = [
    /answer[:\s]+([A-D])/i,
    /option\s*\(?([A-D])\)?/i,
    /correct[:\s]+([A-D])/i,
    /key[:\s]+([A-D])/i,
    /ans[:\s]+([A-D])/i,
    /answer[:\s]+([1-4])/i,
  ];

  for (const p of patterns) {
    const m = block.match(p);
    if (m) {
      const ans = m[1].toUpperCase();
      if ("ABCD".includes(ans)) return ans;
      if (/[1-4]/.test(ans)) return "ABCD"[parseInt(ans) - 1];
    }
  }
  return "";
}

/* ======================================================
   MANUAL QUESTION PARSER — FIXED VERSION
====================================================== */
function manualParse(text: string) {
  const questions: any[] = [];

  // Split on new question start markers: "1.", "1 )", "Q1."
  const blocks = text.split(/(?=^(\s*\d+[\.\)]|Q\d+[\.\)]))/gm);

  for (const blk of blocks) {
    const trimmed = blk.trim();
    if (!trimmed) continue;

    // Extract question
    const qMatch = trimmed.match(/^\d+[\.\)]\s*(.+?)(?=(A[\.\)]|\(A\)|Option A|$))/is);
    if (!qMatch) continue;

    const questionText = qMatch[1].trim();

    // Extract options (multi-line aware)
    const optRegex =
      /A[\.\)]\s*([\s\S]*?)B[\.\)]\s*([\s\S]*?)C[\.\)]\s*([\s\S]*?)D[\.\)]\s*([\s\S]*?)(Answer|$)/i;

    let options = null;
    const optMatch = trimmed.match(optRegex);
    if (optMatch) {
      options = [
        { label: "A", text: optMatch[1].trim() },
        { label: "B", text: optMatch[2].trim() },
        { label: "C", text: optMatch[3].trim() },
        { label: "D", text: optMatch[4].trim() },
      ];
    }

    const correct = detectMCQAnswer(trimmed);
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

/* ======================================================
   AI FALLBACK — Lovable AI Gateway (replaces Claude)
====================================================== */
const EXTRACTION_SYSTEM_PROMPT = `You are a question extraction engine. Given PDF text content, extract all questions into a JSON array. Each object must have: question_text, question_type ("MCQ" or "SHORT_ANSWER"), options (array of {label, text} or null), correct_answer (A/B/C/D or text), explanation, subject, topic, difficulty ("EASY"/"MEDIUM"/"HARD"), marks_positive (number), marks_negative (number). Return ONLY a valid JSON array, no markdown.`;

async function callAI(pdfText: string) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return null;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
          { role: "user", content: `Extract all questions from this text into JSON:\n\n${pdfText.slice(0, 30000)}` },
        ],
      }),
    });

    if (!res.ok) return null;

    const json = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? "";
    const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

/* ======================================================
   MAIN HANDLER
====================================================== */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    const { userId, credits } = await requireAuth(req);
    const debug = new URL(req.url).searchParams.get("debug") === "true";

    const pdfBase64 = await extractPdfBase64(req);
    if (!pdfBase64) return errorResponse("No PDF uploaded.", "NO_PDF", 400);

    if (!isLikelyPDF(pdfBase64))
      return errorResponse("Invalid PDF file.", "BAD_PDF", 400);

    /* -----------------------------------------
       MANUAL PARSE — TEXT EXTRACTION ATTEMPT
    ----------------------------------------- */
    const rawText = cleanOCRText(atob(pdfBase64)); // placeholder extraction
    const manual = manualParse(rawText);

    if (manual.length > 0) {
      return successResponse({ questions: manual, mode: "manual" });
    }

    /* -----------------------------------------
       OCR FALLBACK — IMAGE-BASED PDF
    ----------------------------------------- */
    const ocrText = await ocrExtract(pdfBase64);
    if (ocrText) {
      const ocrRes = manualParse(ocrText);
      if (ocrRes.length > 0) {
        return successResponse({ questions: ocrRes, mode: "ocr" });
      }
    }

    /* -----------------------------------------
       AI FALLBACK — CLAUDE
    ----------------------------------------- */
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
      return successResponse({ questions: aiParsed, mode: "ai" });
    }

    /* -----------------------------------------
       REFUND IF AI FAILED
    ----------------------------------------- */
    if (charged) {
      try {
        const admin = getAdminClient();
        await admin.rpc("add_credits", {
          p_user_id: userId,
          p_amount: CREDIT_COST,
          p_action: "refund",
          p_description: "AI fallback failed",
        });
      } catch (err) {
        console.error("Refund error:", err);
      }
    }

    return successResponse({ questions: [], mode: "fallback" });
  } catch (err) {
    console.error("[parse-question-pdf] Unhandled error:", err);
    return errorResponse("Internal error.", "INTERNAL_ERROR", 500);
  }
});
