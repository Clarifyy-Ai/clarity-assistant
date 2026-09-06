import { sanitizeFileName } from "@/lib/security/sanitizer";

/**
 * Builds a safe download filename that keeps the original file extension
 * (taken from the storage path), even when the display name has none.
 */
export function downloadFileName(
  displayName: string | null | undefined,
  storagePath: string,
): string {
  const stored = storagePath.split("/").pop() || "document";
  const dot = stored.lastIndexOf(".");
  const ext = dot > 0 ? stored.slice(dot) : "";

  const base = sanitizeFileName(displayName ?? "");
  if (!base) return stored;
  if (!ext) return base;
  if (base.toLowerCase().endsWith(ext.toLowerCase())) return base;
  return `${base}${ext}`;
}
