// ─────────────────────────────────────────────────────────────────────────────
// storage.ts — Typed file upload/download/delete helpers for Supabase Storage.
// Handles resumes, JDs, avatars, session recordings, and screenshots.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase/client";
import { StorageError, ErrorCode, tryCatch } from "@/lib/errors";

// ─── Bucket Names ────────────────────────────────────────────────────────────

export const BUCKETS = {
  RESUMES:      "resumes",
  DOCUMENTS:    "documents",
  AVATARS:      "avatars",
  SCREENSHOTS:  "screenshots",
  EXPORTS:      "exports",
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES: Record<BucketName, string[]> = {
  resumes:      ["application/pdf", "application/msword",
                 "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  documents:    ["application/pdf", "text/plain", "text/markdown"],
  avatars:      ["image/jpeg", "image/png", "image/webp", "image/gif"],
  screenshots:  ["image/jpeg", "image/png", "image/webp"],
  exports:      ["application/json", "text/csv", "application/zip"],
};

// ─── Path Builders ────────────────────────────────────────────────────────────

export const storagePaths = {
  resume:     (userId: string, fileName: string) => `${userId}/resumes/${fileName}`,
  document:   (userId: string, fileName: string) => `${userId}/docs/${fileName}`,
  avatar:     (userId: string, ext = "jpg")      => `${userId}/avatar.${ext}`,
  screenshot: (userId: string, sessionId: string, ts: number) =>
    `${userId}/screenshots/${sessionId}/${ts}.jpg`,
  export:     (userId: string, fileName: string) => `${userId}/exports/${fileName}`,
};

// ─── Validation ───────────────────────────────────────────────────────────────

function validateFile(file: File, bucket: BucketName): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new StorageError(
      `File is too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`,
      ErrorCode.STORAGE_FILE_TOO_LARGE,
      { size: file.size, max: MAX_FILE_SIZE_BYTES }
    );
  }

  const allowed = ALLOWED_MIME_TYPES[bucket];
  if (allowed && !allowed.includes(file.type)) {
    throw new StorageError(
      `File type "${file.type}" is not supported for ${bucket}.`,
      ErrorCode.STORAGE_INVALID_FILE_TYPE,
      { type: file.type, allowed, bucket }
    );
  }
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadOptions {
  upsert?:      boolean;
  cacheControl?: string;
  onProgress?:  (percent: number) => void;
}

export interface UploadResult {
  path:     string;
  fullPath: string;
  publicUrl: string;
}

/**
 * Upload a file to a Supabase Storage bucket.
 * Validates size and MIME type before uploading.
 *
 * @example
 * const result = await uploadFile(BUCKETS.RESUMES, file, path, { upsert: true });
 * console.log(result.publicUrl);
 */
export async function uploadFile(
  bucket: BucketName,
  file: File,
  path: string,
  options: UploadOptions = {}
): Promise<UploadResult> {
  validateFile(file, bucket);

  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert:        options.upsert       ?? true,
        cacheControl:  options.cacheControl ?? "3600",
        contentType:   file.type,
      });

    if (error) throw error;
    return data;
  });

  if (err || !data) {
    throw new StorageError(
      `Failed to upload file to ${bucket}/${path}: ${err?.message}`,
      ErrorCode.STORAGE_UPLOAD_FAILED,
      { bucket, path }
    );
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return {
    path:      data.path,
    fullPath:  data.fullPath,
    publicUrl: urlData.publicUrl,
  };
}

/**
 * Upload a Blob (e.g. screenshot canvas export) with a generated path.
 */
export async function uploadBlob(
  bucket: BucketName,
  blob: Blob,
  path: string,
  contentType: string,
  options: Omit<UploadOptions, "onProgress"> = {}
): Promise<UploadResult> {
  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        upsert:       options.upsert ?? true,
        cacheControl: options.cacheControl ?? "3600",
        contentType,
      });

    if (error) throw error;
    return data;
  });

  if (err || !data) {
    throw new StorageError(
      `Failed to upload blob to ${bucket}/${path}: ${err?.message}`,
      ErrorCode.STORAGE_UPLOAD_FAILED,
      { bucket, path }
    );
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);

  return {
    path:      data.path,
    fullPath:  data.fullPath,
    publicUrl: urlData.publicUrl,
  };
}

// ─── Download ─────────────────────────────────────────────────────────────────

/**
 * Download a file from Supabase Storage as a Blob.
 */
export async function downloadFile(
  bucket: BucketName,
  path: string
): Promise<Blob> {
  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase.storage.from(bucket).download(path);
    if (error) throw error;
    return data;
  });

  if (err || !data) {
    throw new StorageError(
      `Failed to download ${bucket}/${path}: ${err?.message}`,
      ErrorCode.STORAGE_DOWNLOAD_FAILED,
      { bucket, path }
    );
  }

  return data;
}

/**
 * Get a temporary signed URL for private file access.
 * Default expiry: 1 hour.
 */
export async function getSignedUrl(
  bucket: BucketName,
  path: string,
  expiresInSeconds = 3600
): Promise<string> {
  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw error;
    return data;
  });

  if (err || !data?.signedUrl) {
    throw new StorageError(
      `Failed to generate signed URL for ${bucket}/${path}`,
      ErrorCode.STORAGE_DOWNLOAD_FAILED,
      { bucket, path }
    );
  }

  return data.signedUrl;
}

/**
 * Get the public URL for a file (only works for public buckets).
 */
export function getPublicUrl(bucket: BucketName, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Delete a single file from storage.
 */
export async function deleteFile(
  bucket: BucketName,
  path: string
): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) throw error;
  });

  if (err) {
    throw new StorageError(
      `Failed to delete ${bucket}/${path}: ${err.message}`,
      ErrorCode.STORAGE_DOWNLOAD_FAILED,
      { bucket, path }
    );
  }
}

/**
 * Delete multiple files in a single call.
 */
export async function deleteFiles(
  bucket: BucketName,
  paths: string[]
): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) throw error;
  });

  if (err) {
    throw new StorageError(
      `Failed to delete files from ${bucket}: ${err.message}`,
      ErrorCode.STORAGE_DOWNLOAD_FAILED,
      { bucket, paths }
    );
  }
}

// ─── List ─────────────────────────────────────────────────────────────────────

/**
 * List files in a storage folder.
 */
export async function listFiles(
  bucket: BucketName,
  folder: string,
  options?: { limit?: number; offset?: number }
) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, {
      limit:  options?.limit  ?? 100,
      offset: options?.offset ?? 0,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    throw new StorageError(
      `Failed to list files in ${bucket}/${folder}`,
      ErrorCode.STORAGE_BUCKET_NOT_FOUND,
      { bucket, folder }
    );
  }

  return data ?? [];
}

// ─── Domain-Specific Helpers ──────────────────────────────────────────────────

export const resumeStorage = {
  upload: (userId: string, file: File) =>
    uploadFile(BUCKETS.RESUMES, file, storagePaths.resume(userId, file.name), { upsert: true }),

  getUrl: (userId: string, fileName: string) =>
    getSignedUrl(BUCKETS.RESUMES, storagePaths.resume(userId, fileName)),

  delete: (userId: string, fileName: string) =>
    deleteFile(BUCKETS.RESUMES, storagePaths.resume(userId, fileName)),

  list: (userId: string) =>
    listFiles(BUCKETS.RESUMES, `${userId}/resumes`),
};

export const avatarStorage = {
  upload: (userId: string, file: File) => {
    const ext = file.name.split(".").pop() ?? "jpg";
    return uploadFile(BUCKETS.AVATARS, file, storagePaths.avatar(userId, ext), { upsert: true });
  },

  getUrl: (userId: string) =>
    getPublicUrl(BUCKETS.AVATARS, storagePaths.avatar(userId)),

  delete: (userId: string) =>
    deleteFile(BUCKETS.AVATARS, storagePaths.avatar(userId)),
};

export const screenshotStorage = {
  upload: (userId: string, sessionId: string, blob: Blob) =>
    uploadBlob(
      BUCKETS.SCREENSHOTS,
      blob,
      storagePaths.screenshot(userId, sessionId, Date.now()),
      "image/jpeg"
    ),

  list: (userId: string, sessionId: string) =>
    listFiles(BUCKETS.SCREENSHOTS, `${userId}/screenshots/${sessionId}`),
};
