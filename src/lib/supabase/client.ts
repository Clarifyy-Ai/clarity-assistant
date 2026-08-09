// src/lib/supabase/client.ts
//
// Supabase client utility wrapper.
//
// SECURITY PURPOSE:
// - Re-export configured Supabase client from integrations layer
// - Centralize safe storage operations
// - Validate bucket names and storage paths
// - Avoid unsafe path traversal patterns
// - Provide consistent helper functions for signed URLs, uploads, deletes,
//   realtime subscriptions, fetch, and upsert operations

import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";

import { sanitizeFileName, stripControlCharacters } from "@/lib/security";
import { getMimeType } from "@/lib/utils/fileUtils";

export { supabase, SUPABASE_URL, SUPABASE_ANON_KEY };

export const STORAGE_BUCKETS = {
  RESUMES: "resumes",
  DOCUMENTS: "documents",
  AVATARS: "avatars",
  SCORECARDS: "scorecards",
  JD_FILES: "jd-files",
  ROOM_RECORDINGS: "room-recordings",
} as const;

export type StorageBucket =
  (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

const ALLOWED_BUCKETS = new Set<string>(Object.values(STORAGE_BUCKETS));

const MAX_STORAGE_PATH_LENGTH = 500;
const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB safety cap

function isAllowedBucket(bucketName: string): bucketName is StorageBucket {
  return ALLOWED_BUCKETS.has(bucketName);
}

function isSafeStoragePath(path: string): boolean {
  if (typeof path !== "string") {
    return false;
  }

  const cleaned = path.trim();

  if (cleaned.length === 0 || cleaned.length > MAX_STORAGE_PATH_LENGTH) {
    return false;
  }

  if (
    cleaned.includes("..") ||
    cleaned.startsWith("/") ||
    cleaned.startsWith("\\") ||
    cleaned.includes("\\")
  ) {
    return false;
  }

  return true;
}

function normalizeStoragePath(path: string): string {
  return stripControlCharacters(path)
    .split("/")
    .map((part) => sanitizeFileName(part))
    .filter(Boolean)
    .join("/");
}

function assertSafeBucket(bucketName: string): asserts bucketName is StorageBucket {
  if (!isAllowedBucket(bucketName)) {
    throw new Error(`[supabase] Invalid storage bucket: ${bucketName}`);
  }
}

function assertSafeStoragePath(path: string): void {
  if (!isSafeStoragePath(path)) {
    throw new Error("[supabase] Unsafe storage path.");
  }
}

function assertSafeFile(file: File): void {
  if (!(file instanceof File)) {
    throw new Error("[supabase] Upload requires a valid File object.");
  }

  if (file.size <= 0) {
    throw new Error("[supabase] File cannot be empty.");
  }

  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("[supabase] File is too large.");
  }
}

function createSafeChannelName(tableName: string, filter: string): string {
  const safeTable = stripControlCharacters(tableName)
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 100);

  const safeFilter = stripControlCharacters(filter)
    .replace(/[^A-Za-z0-9_=.,:-]/g, "_")
    .slice(0, 200);

  return `${safeTable}:${safeFilter}`;
}

export async function getSignedUrl(
  bucketName: StorageBucket,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  try {
    assertSafeBucket(bucketName);
    assertSafeStoragePath(path);

    const safePath = normalizeStoragePath(path);

    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(safePath, expiresInSeconds);

    if (error || !data?.signedUrl) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function uploadFile(
  bucketName: StorageBucket,
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string | null; path: string } | null> {
  try {
    assertSafeBucket(bucketName);
    assertSafeStoragePath(path);
    assertSafeFile(file);

    const safePath = normalizeStoragePath(path);

    onProgress?.(10);

    const contentType =
      (!file.type || file.type === "application/octet-stream"
        ? getMimeType(file.name)
        : file.type.split(";")[0]?.trim()) || "application/octet-stream";

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(safePath, file, {
        upsert: true,
        contentType,
        cacheControl: "3600",
      });

    if (error) {
      throw error;
    }

    onProgress?.(90);

    const { data: publicData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(safePath);

    const url = publicData?.publicUrl ?? null;

    onProgress?.(100);

    return {
      url,
      path: safePath,
    };
  } catch (err) {
    console.error("[supabase] uploadFile failed:", err);
    return null;
  }
}

export async function deleteFile(
  bucketName: StorageBucket,
  path: string
): Promise<boolean> {
  try {
    assertSafeBucket(bucketName);
    assertSafeStoragePath(path);

    const safePath = normalizeStoragePath(path);

    const { error } = await supabase.storage
      .from(bucketName)
      .remove([safePath]);

    if (error) {
      console.warn("[deleteFile] Delete failed:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[deleteFile] Unexpected failure:", error);
    return false;
  }
}

export function subscribeToTable<T>(
  tableName: string,
  filter: string,
  onInsert?: (row: T) => void,
  onUpdate?: (row: T) => void,
  onDelete?: (row: T) => void
) {
  const channelName = createSafeChannelName(tableName, filter);

  return supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: tableName,
        filter,
      },
      (payload) => {
        onInsert?.(payload.new as T);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: tableName,
        filter,
      },
      (payload) => {
        onUpdate?.(payload.new as T);
      }
    )
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: tableName,
        filter,
      },
      (payload) => {
        onDelete?.(payload.old as T);
      }
    )
    .subscribe();
}

export async function fetchById<T>(
  tableName: string,
  id: string
): Promise<T | null> {
  try {
    if (!id || typeof id !== "string") {
      throw new Error("[fetchById] id is required.");
    }

    const { data, error } = await supabase
      .from(tableName as never)
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) {
      console.warn("[fetchById] Fetch failed:", error?.message);
      return null;
    }

    return data as T;
  } catch (error) {
    console.error("[fetchById] Unexpected failure:", error);
    return null;
  }
}

export async function upsertRow<T>(
  tableName: string,
  row: Partial<T>
): Promise<T | null> {
  try {
    if (!row || typeof row !== "object") {
      throw new Error("[upsertRow] row is required.");
    }

    const { data, error } = await supabase
      .from(tableName as never)
      .upsert(row as never)
      .select()
      .single();

    if (error || !data) {
      console.warn("[upsertRow] Upsert failed:", error?.message);
      return null;
    }

    return data as T;
  } catch (error) {
    console.error("[upsertRow] Unexpected failure:", error);
    return null;
  }
}
