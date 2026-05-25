import { SUPABASE_URL } from "@/lib/env";

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
