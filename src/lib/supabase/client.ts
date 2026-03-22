// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// src/lib/supabase/client.ts
// Utility functions only — imports the singleton from integrations.
// NEVER calls createClient() here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "@/integrations/supabase/client";

// Re-export the singleton and URL so existing imports from this path still work
export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };

// ── Storage bucket names ──────────────────────────────────────────────────────
export const STORAGE_BUCKETS = {
  RESUMES:          "resumes",
  AVATARS:          "avatars",
  SCORECARDS:       "scorecards",
  JD_FILES:         "jd-files",
  ROOM_RECORDINGS:  "room-recordings",
} as const;

// ── Signed URL ────────────────────────────────────────────────────────────────
export async function getSignedUrl(
  bucketName: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

// ── XHR upload with progress ──────────────────────────────────────────────────
export async function uploadFile(
  bucketName: string,
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string; path: string } | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/${bucketName}/${path}`;

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("x-upsert", "true");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucketName}/${path}`;
        resolve({ url: publicUrl, path });
      } else {
        reject(new Error(`Upload failed: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Upload network error"));

    const formData = new FormData();
    formData.append("", file);
    xhr.send(formData);
  });
}

// ── Delete file ───────────────────────────────────────────────────────────────
export async function deleteFile(
  bucketName: string,
  path: string
): Promise<boolean> {
  const { error } = await supabase.storage.from(bucketName).remove([path]);
  return !error;
}

// ── Realtime table subscription ───────────────────────────────────────────────
export function subscribeToTable<T>(
  tableName:  string,
  filter:     string,
  onInsert?:  (row: T) => void,
  onUpdate?:  (row: T) => void,
  onDelete?:  (row: T) => void
) {
  return supabase
    .channel(`${tableName}:${filter}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: tableName, filter },
      (payload) => onInsert?.(payload.new as T)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: tableName, filter },
      (payload) => onUpdate?.(payload.new as T)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: tableName, filter },
      (payload) => onDelete?.(payload.old as T)
    )
    .subscribe();
}

// ── Generic fetch / upsert helpers ────────────────────────────────────────────
export async function fetchById<T>(
  tableName: string,
  id: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as T;
}

export async function upsertRow<T>(
  tableName: string,
  row: Partial<T>
): Promise<T | null> {
  const { data, error } = await supabase
    .from(tableName)
    .upsert(row as never)
    .select()
    .single();
  if (error || !data) return null;
  return data as T;
}
