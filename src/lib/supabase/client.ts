// src/lib/supabase/client.ts
import {
  supabase,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from "@/integrations/supabase/client";

export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };

export const STORAGE_BUCKETS = {
  RESUMES: "resumes",
  AVATARS: "avatars",
  SCORECARDS: "scorecards",
  JD_FILES: "jd-files",
  ROOM_RECORDINGS: "room-recordings",
} as const;

export async function getSignedUrl(
  bucketName: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucketName)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadFile(
  bucketName: string,
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string | null; path: string } | null> {
  try {
    onProgress?.(10);

    const { error } = await supabase.storage.from(bucketName).upload(path, file, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

    if (error) throw error;

    onProgress?.(90);

    const { data: publicData } = supabase.storage.from(bucketName).getPublicUrl(path);
    const url = publicData?.publicUrl ?? null;

    onProgress?.(100);

    return { url, path };
  } catch (error) {
    console.error("[uploadFile] Upload failed:", error);
    return null;
  }
}

export async function deleteFile(
  bucketName: string,
  path: string
): Promise<boolean> {
  const { error } = await supabase.storage.from(bucketName).remove([path]);
  return !error;
}

export function subscribeToTable<T>(
  tableName: string,
  filter: string,
  onInsert?: (row: T) => void,
  onUpdate?: (row: T) => void,
  onDelete?: (row: T) => void
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
