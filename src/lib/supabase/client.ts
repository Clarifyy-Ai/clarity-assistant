import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "[ConfideQ] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Check your .env.local file."
  );
}

// ─────────────────────────────────────────────────────────────────
// Primary Supabase client — used everywhere in the app
// ─────────────────────────────────────────────────────────────────

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
    storageKey:        "confideq-auth",
    storage:           window.localStorage,
    flowType:          "pkce",
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
  global: {
    headers: {
      "x-app-name": "confideq",
      "x-app-version": __APP_VERSION__ ?? "1.0.0",
    },
  },
  db: {
    schema: "public",
  },
});

// ─────────────────────────────────────────────────────────────────
// Storage bucket names
// ─────────────────────────────────────────────────────────────────

export const STORAGE_BUCKETS = {
  RESUMES:      "resumes",
  AVATARS:      "avatars",
  SCORECARDS:   "scorecards",
  JD_FILES:     "jd-files",
  ROOM_RECORDINGS: "room-recordings",
} as const;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Get a short-lived signed URL for a private storage object.
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

/**
 * Upload a file to Supabase Storage with progress tracking.
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string; path: string } | null> {
  // Supabase JS v2 doesn't expose upload progress natively,
  // so we use XMLHttpRequest for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;

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
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
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

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFile(
  bucket: string,
  path: string
): Promise<boolean> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  return !error;
}

/**
 * Subscribe to a Supabase Realtime channel for a specific table + filter.
 */
export function subscribeToTable<T>(
  table: string,
  filter: string,
  onInsert?: (row: T) => void,
  onUpdate?: (row: T) => void,
  onDelete?: (row: T) => void
) {
  return supabase
    .channel(`${table}:${filter}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table, filter },
      (payload) => onInsert?.(payload.new as T)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table, filter },
      (payload) => onUpdate?.(payload.new as T)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table, filter },
      (payload) => onDelete?.(payload.old as T)
    )
    .subscribe();
}

// ─────────────────────────────────────────────────────────────────
// Typed query helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Fetch a single row by ID, returning null if not found.
 */
export async function fetchById<T>(
  table: string,
  id: string
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as T;
}

/**
 * Upsert a row and return the result.
 */
export async function upsertRow<T>(
  table: string,
  row: Partial<T>
): Promise<T | null> {
  const { data, error } = await supabase
    .from(table)
    .upsert(row as never)
    .select()
    .single();
  if (error || !data) return null;
  return data as T;
}
