import { SUPABASE_URL } from "@/lib/env";

const PLACEHOLDER_RE =
  /placehold|placeholder|dummyimage|fakeimg|loremflickr|via\.placeholder|text=reference|reference[+\s_-]*image/i;

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i;

/** Resolve question image URLs (storage path, relative, or absolute). */
export function resolveQuestionImageUrl(url: string | null | undefined): string {
  if (!url?.trim()) return "";
  const trimmed = url.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const base = `${SUPABASE_URL}/storage/v1/object/public/question-images/`;
  return `${base}${trimmed.replace(/^\//, "")}`;
}

/** True only for a real http(s) or storage image — never AI/PDF placeholders. */
export function isUsableQuestionImageUrl(url: string | null | undefined): boolean {
  const trimmed = (url ?? "").trim();
  if (!trimmed) return false;
  if (/^(javascript|data):/i.test(trimmed)) return false;
  if (PLACEHOLDER_RE.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const haystack = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
      if (PLACEHOLDER_RE.test(haystack)) return false;
      return true;
    } catch {
      return false;
    }
  }
  if (/^reference\s*image$/i.test(trimmed)) return false;
  return IMAGE_EXT_RE.test(trimmed);
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(([^)]*)\)/g;

export function extractStemImageUrls(text: string): string[] {
  const urls: string[] = [];
  const re = new RegExp(MARKDOWN_IMAGE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const raw = (match[1] ?? "").trim();
    if (isUsableQuestionImageUrl(raw)) urls.push(raw);
  }
  return urls;
}

function collapseDuplicatedParagraphs(text: string): string {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return text.trim();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = part.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out.join("\n\n");
}

/** Strip fake figure captions / markdown placeholders; collapse duplicated stem text. */
export function sanitizeQuestionStem(text: string | null | undefined): string {
  let t = String(text ?? "");
  t = t.replace(MARKDOWN_IMAGE_RE, "");
  t = t.replace(/^\s*(reference\s+image|\[figure\]|figure\s*\d*)\s*$/gim, "");
  t = collapseDuplicatedParagraphs(t);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function uniqueImageUrls(
  imageUrl: string | null | undefined,
  stem: string,
): string[] {
  const raw = [
    ...(isUsableQuestionImageUrl(imageUrl) ? [imageUrl!.trim()] : []),
    ...extractStemImageUrls(stem),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of raw) {
    const resolved = resolveQuestionImageUrl(url);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}
