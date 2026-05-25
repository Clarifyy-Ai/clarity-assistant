// parse-document — PDF/text extraction for documents table (cover letter, etc.)

import { handleCors, getCorsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { parseJSON } from "../_shared/gemini.ts";
import { requireAuth } from "../_shared/utils.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function safeBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function extractWithGemini(
  base64: string,
  mimeType: string,
  docType: string
): Promise<{ full_text: string; summary: string } | null> {
  if (!GEMINI_API_KEY) return null;

  const prompt =
    docType === "cover_letter"
      ? `Extract the full cover letter text from this document. Return JSON only:
{"full_text":"complete letter text","summary":"2-3 sentence summary for interview coaching"}`
      : `Extract all readable text. Return JSON only:
{"full_text":"...","summary":"brief summary"}`;

  const res = await fetch(
    `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
      }),
    }
  );

  if (!res.ok) return null;
  const json = await res.json();
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const parsed = parseJSON(
    raw.replace(/```json/gi, "").replace(/```/g, "").trim(),
    null
  ) as { full_text?: string; summary?: string } | null;

  if (!parsed?.full_text || parsed.full_text.length < 20) return null;
  return {
    full_text: String(parsed.full_text).slice(0, 50000),
    summary: String(parsed.summary ?? parsed.full_text).slice(0, 2000),
  };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const db = createServiceClient();

  try {
    const { userId } = await requireAuth(req);
    const body = await req.json();
    const documentId = body?.document_id as string | undefined;
    const filePath = body?.file_path as string | undefined;
    const mimeType = (body?.mime_type as string) || "application/pdf";

    if (!documentId || !filePath) {
      return new Response(
        JSON.stringify({ error: "Missing document_id or file_path" }),
        { status: 400, headers: getCorsHeaders(req) }
      );
    }

    const { data: doc } = await db
      .from("documents")
      .select("id, user_id, type, title")
      .eq("id", documentId)
      .single();

    if (!doc || doc.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 403, headers: getCorsHeaders(req) }
      );
    }

    const { data: fileData, error: downloadError } = await db.storage
      .from("documents")
      .download(filePath);

    if (downloadError || !fileData) {
      return new Response(
        JSON.stringify({ error: "Failed to download file from storage" }),
        { status: 502, headers: getCorsHeaders(req) }
      );
    }

    const buf = await fileData.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_FILE_BYTES) {
      return new Response(
        JSON.stringify({ error: "File empty or too large" }),
        { status: 400, headers: getCorsHeaders(req) }
      );
    }

    const extracted = await extractWithGemini(
      safeBase64(new Uint8Array(buf)),
      mimeType,
      doc.type ?? "other"
    );

    if (!extracted) {
      return new Response(
        JSON.stringify({ error: "Could not extract text from document" }),
        { status: 500, headers: getCorsHeaders(req) }
      );
    }

    await db
      .from("documents")
      .update({
        content: extracted.full_text,
        parsed_summary: extracted.summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    return new Response(
      JSON.stringify({
        success: true,
        parsed_summary: extracted.summary,
        content_length: extracted.full_text.length,
      }),
      { headers: getCorsHeaders(req) }
    );
  } catch (err) {
    console.error("[parse-document]", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: getCorsHeaders(req) }
    );
  }
});
