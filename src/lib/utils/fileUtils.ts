// ─────────────────────────────────────────────────────────────────────────────
// fileUtils.ts — File reading, conversion, PDF text extraction,
// download triggering, and MIME type helpers.
// ─────────────────────────────────────────────────────────────────────────────

// ─── MIME Types ───────────────────────────────────────────────────────────────

export const MIME_TYPES: Record<string, string> = {
  pdf:   "application/pdf",
  doc:   "application/msword",
  docx:  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt:   "text/plain",
  md:    "text/markdown",
  json:  "application/json",
  csv:   "text/csv",
  png:   "image/png",
  jpg:   "image/jpeg",
  jpeg:  "image/jpeg",
  webp:  "image/webp",
  gif:   "image/gif",
  svg:   "image/svg+xml",
  mp3:   "audio/mpeg",
  wav:   "audio/wav",
  ogg:   "audio/ogg",
  webm:  "audio/webm",
  mp4:   "video/mp4",
  zip:   "application/zip",
};

export function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function isPDFFile(file: File): boolean {
  return file.type === "application/pdf";
}

export function isDocumentFile(file: File): boolean {
  return [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ].includes(file.type);
}

// ─── File Reading ─────────────────────────────────────────────────────────────

/**
 * Read a file as a text string.
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file as text."));
    reader.readAsText(file);
  });
}

/**
 * Read a file as a Data URL (base64).
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read file as data URL."));
    reader.readAsDataURL(file);
  });
}

/**
 * Read a file as an ArrayBuffer.
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error("Failed to read file as ArrayBuffer."));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert a Blob to a Base64 string.
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Convert a Base64 string to a Blob.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary  = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Convert a Blob to an ArrayBuffer.
 */
export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer();
}

/**
 * Convert an ArrayBuffer to a Blob.
 */
export function arrayBufferToBlob(buffer: ArrayBuffer, mimeType: string): Blob {
  return new Blob([buffer], { type: mimeType });
}

/**
 * Convert Float32Array audio to a WAV Blob.
 * Useful for recording and uploading audio chunks.
 */
export function float32ToWAVBlob(
  samples: Float32Array,
  sampleRate = 16000,
  numChannels = 1
): Blob {
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign    = numChannels * bytesPerSample;
  const byteRate      = sampleRate * blockAlign;
  const dataSize      = samples.length * bytesPerSample;
  const buffer        = new ArrayBuffer(44 + dataSize);
  const view          = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4,  36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16,            true);
  view.setUint16(20, 1,             true);  // PCM
  view.setUint16(22, numChannels,   true);
  view.setUint32(24, sampleRate,    true);
  view.setUint32(28, byteRate,      true);
  view.setUint16(32, blockAlign,    true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ─── Download ────────────────────────────────────────────────────────────────

/**
 * Trigger a file download from a Blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href      = url;
  a.download  = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Trigger a download from a data URL.
 */
export function downloadDataURL(dataURL: string, filename: string): void {
  const a = document.createElement("a");
  a.href     = dataURL;
  a.download = filename;
  a.click();
}

/**
 * Download a string as a text file.
 */
export function downloadText(content: string, filename: string, mimeType = "text/plain"): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}

/**
 * Download an object as a JSON file.
 */
export function downloadJSON(data: unknown, filename: string): void {
  const json = JSON.stringify(data, null, 2);
  downloadText(json, filename.endsWith(".json") ? filename : `${filename}.json`, "application/json");
}

/**
 * Download a 2D array as a CSV file.
 */
export function downloadCSV(rows: string[][], filename: string): void {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadText(csv, filename.endsWith(".csv") ? filename : `${filename}.csv`, "text/csv");
}

// ─── Image ────────────────────────────────────────────────────────────────────

/**
 * Capture a canvas element as a JPEG Blob.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality = 0.85,
  mimeType = "image/jpeg"
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed.")),
      mimeType,
      quality
    );
  });
}

/**
 * Resize an image file to a maximum dimension, returning a new Blob.
 */
export async function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality = 0.85
): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    img.onload  = () => resolve();
    img.onerror = reject;
    img.src = url;
  });

  URL.revokeObjectURL(url);

  const ratio  = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(img.width  * ratio);
  canvas.height = Math.round(img.height * ratio);

  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvasToBlob(canvas, quality, file.type);
}
