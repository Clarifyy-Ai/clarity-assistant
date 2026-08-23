export type DocumentCategory =
  | "resume"
  | "scanned_pdf"
  | "job_description"
  | "cover_letter"
  | "library"
  | "exam_document"
  | "spreadsheet";

export const DOCUMENT_UPLOAD_LIMITS: Record<DocumentCategory, number> = {
  resume: 10 * 1024 * 1024,
  scanned_pdf: 20 * 1024 * 1024,
  job_description: 10 * 1024 * 1024,
  cover_letter: 10 * 1024 * 1024,
  library: 20 * 1024 * 1024,
  exam_document: 25 * 1024 * 1024,
  spreadsheet: 10 * 1024 * 1024,
};

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel"],
  xlsx: [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
  ],
};

/** Legacy .doc is not supported by parsers — keep explicit rejection message. */
const UNSUPPORTED_EXTENSIONS = new Set(["doc", "png", "jpg", "jpeg", "gif", "webp", "bmp"]);

export const LIBRARY_ACCEPT =
  ".pdf,.docx,.txt,.csv,.xlsx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const RESUME_ACCEPT =
  ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export const LIBRARY_ACCEPT_LABEL = "PDF, DOCX, TXT, CSV, XLSX · Max 20 MB";
export const RESUME_ACCEPT_LABEL = "PDF, DOCX, or TXT · Max 10 MB";
export const UNSUPPORTED_FORMAT_MESSAGE =
  "Unsupported file format. Please upload a supported document.";
export const INVALID_RESUME_MESSAGE =
  "Invalid file. Upload a supported resume.";


export function getDocumentExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function inferDocumentCategory(
  name: string,
  requested: DocumentCategory = "library",
): DocumentCategory {
  const extension = getDocumentExtension(name);
  if (extension === "pdf" && requested === "resume") return "resume";
  if (extension === "pdf" && requested === "exam_document") return "exam_document";
  if (extension === "xlsx" || extension === "csv") return "spreadsheet";
  return requested;
}

export function sanitizeUploadFilename(filename: string): string {
  const clean = filename.replace(/\\/g, "/").split("/").pop()?.replace(/\0/g, "").trim() || "";
  const sanitized = clean.replace(/[^a-zA-Z0-9._\- ]/g, "_");
  return sanitized.slice(0, 180) || "document";
}

export function isPathTraversalAttempt(path: string): boolean {
  if (!path) return false;
  const decoded = decodeURIComponent(path);
  return (
    decoded.includes("..") ||
    decoded.includes("../") ||
    decoded.includes("..\\") ||
    decoded.startsWith("/") ||
    decoded.startsWith("\\") ||
    /^[a-zA-Z]:/.test(decoded) ||
    decoded.includes("\0")
  );
}

export function validateStorageKey(key: string, expectedPrefix?: string): boolean {
  if (!key || isPathTraversalAttempt(key)) return false;
  if (expectedPrefix && !key.startsWith(expectedPrefix)) return false;
  // Enforce UUID / user_id structure or alphanumeric key path
  return /^[a-zA-Z0-9_\-\.\/]+$/.test(key);
}

export function validateMimeBytes(buffer: Uint8Array, extension: string): boolean {
  const ext = extension.toLowerCase().replace(/^\./, "");
  if (buffer.length < 4) return false;

  if (ext === "pdf") {
    // %PDF (0x25 0x50 0x44 0x46)
    return (
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46
    );
  }

  if (ext === "docx" || ext === "xlsx") {
    // PK\x03\x04 (ZIP container: 0x50 0x4B 0x03 0x04)
    return (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    );
  }

  if (ext === "png") {
    // \x89PNG
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  if (ext === "jpg" || ext === "jpeg") {
    // \xFF\xD8\xFF
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // Text, CSV, etc. are plaintext
  return true;
}

export function validateDocumentFile(
  file: File,
  category: DocumentCategory,
): string | null {
  if (isPathTraversalAttempt(file.name)) {
    return "Invalid filename: path traversal sequence detected.";
  }
  const extension = getDocumentExtension(file.name);
  if (UNSUPPORTED_EXTENSIONS.has(extension)) {
    return UNSUPPORTED_FORMAT_MESSAGE;
  }
  if (!extension || !MIME_BY_EXTENSION[extension]) {
    return UNSUPPORTED_FORMAT_MESSAGE;
  }
  if (category === "resume" && !["pdf", "docx", "txt"].includes(extension)) {
    return INVALID_RESUME_MESSAGE;
  }
  if (category === "library" && !["pdf", "docx", "txt", "csv", "xlsx"].includes(extension)) {
    return UNSUPPORTED_FORMAT_MESSAGE;
  }
  if (file.size <= 0) return "The selected file is empty.";
  if (file.name.length > 180) return "Filename must be 180 characters or fewer.";
  if (file.size > DOCUMENT_UPLOAD_LIMITS[category]) {
    return `File is too large. Maximum size is ${Math.floor(
      DOCUMENT_UPLOAD_LIMITS[category] / (1024 * 1024),
    )} MB.`;
  }
  const declaredMime = (file.type || "").split(";")[0].toLowerCase();
  const allowedMimes = MIME_BY_EXTENSION[extension];
  if (declaredMime && declaredMime !== "application/octet-stream" && !allowedMimes.includes(declaredMime)) {
    return `The file MIME type does not match its .${extension} extension.`;
  }
  return null;
}
