import { analyseScreenshotWithGemini } from "@/lib/ai/geminiClient";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";

// ─────────────────────────────────────────────────────────────────
// Screenshot Capture
// Captures the visible screen region containing a coding problem,
// converts to base64, and sends to Gemini Vision for analysis.
// Used in Live Co-pilot mode for coding interview questions.
// ─────────────────────────────────────────────────────────────────

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotResult {
  base64: string;     // data:image/<fmt>;base64,...
  dataOnly: string;   // raw base64 without prefix
  width: number;
  height: number;
  capturedAt: number; // epoch ms
  format: "image/png" | "image/jpeg";
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Grab a single frame from a display MediaStream.
 * 1) Try ImageCapture.grabFrame (fast path).
 * 2) Fallback: attach to <video>, draw to canvas.
 */
async function grabFrameFromStream(stream: MediaStream): Promise<ImageBitmap> {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("No video track in screen capture");

  // Path A: ImageCapture when available (Chromium)
  if (typeof (window as any).ImageCapture !== "undefined") {
    try {
      const ImageCaptureCtor = (window as any).ImageCapture;
      const imageCapture = new ImageCaptureCtor(track);
      const bmp: ImageBitmap = await imageCapture.grabFrame();
      return bmp;
    } catch (e) {
      // Fall through to video-based capture
       
      console.warn("[screenshotCapture] ImageCapture.grabFrame failed, falling back to <video> method:", e);
    }
  }

  // Path B: Fallback via <video> (works on Safari and others)
  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    const onLoaded = () => resolve();
    const onError = () => reject(new Error("Failed to load stream into video element"));
    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

  // Start playback (may be needed to get correct frames)
  try {
    await video.play();
  } catch {
    // ignore; some browsers allow drawing without explicit play
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot create 2D context");

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const bmp = await createImageBitmap(canvas);
  // Cleanup
  video.pause();
  video.srcObject = null;

  return bmp;
}

/**
 * Convert a canvas to base64 string with format/quality control.
 */
function canvasToBase64(
  canvas: HTMLCanvasElement,
  format: "image/png" | "image/jpeg" = "image/png",
  quality = 0.9
): { base64: string; dataOnly: string; format: "image/png" | "image/jpeg" } {
  const base64 = format === "image/jpeg"
    ? canvas.toDataURL("image/jpeg", quality)
    : canvas.toDataURL("image/png");

  const dataOnly = base64.replace(/^data:image\/(png|jpeg);base64,/, "");
  return { base64, dataOnly, format };
}

/**
 * Map CSS pixel region (viewport coords) to video bitmap coords.
 * Uses window.innerWidth/innerHeight to estimate the scale.
 * Note: This approximation works for single-screen typical setups.
 */
function mapRegionToBitmapCoords(
  region: CaptureRegion,
  bitmapWidth: number,
  bitmapHeight: number
): CaptureRegion {
  const vw = window.innerWidth || bitmapWidth;
  const vh = window.innerHeight || bitmapHeight;

  const scaleX = bitmapWidth / vw;
  const scaleY = bitmapHeight / vh;

  return {
    x: Math.round(region.x * scaleX),
    y: Math.round(region.y * scaleY),
    width: Math.round(region.width * scaleX),
    height: Math.round(region.height * scaleY),
  };
}

// ─────────────────────────────────────────────────────────────────
// Capture full screen via getDisplayMedia (one-shot)
// Optional region crop (CSS pixels); auto-scaled to video coords.
//
// Throttled to 2 fps (one capture per 500ms) — matches the documented
// rate cap and prevents accidental rapid-fire calls from blowing through
// AI vision quota or Deepgram bandwidth budgets.
// ─────────────────────────────────────────────────────────────────

const SCREENSHOT_MIN_INTERVAL_MS = 500; // 2 fps maximum
let _lastCaptureAt = 0;
let _inFlightCapture: Promise<ScreenshotResult> | null = null;

export class ScreenshotThrottledError extends Error {
  constructor(msToWait: number) {
    super(`Screenshot capture throttled — wait ${msToWait}ms before retrying`);
    this.name = "ScreenshotThrottledError";
  }
}

export async function captureScreen(region?: CaptureRegion): Promise<ScreenshotResult> {
  // Strict throttle: reject if a previous capture was too recent OR is in flight.
  const now = Date.now();
  const elapsed = now - _lastCaptureAt;

  if (_inFlightCapture) {
    // Coalesce concurrent callers onto the in-flight promise.
    return _inFlightCapture;
  }

  if (elapsed < SCREENSHOT_MIN_INTERVAL_MS) {
    throw new ScreenshotThrottledError(SCREENSHOT_MIN_INTERVAL_MS - elapsed);
  }

  if (!isScreenCaptureSupported()) {
    throw new Error("Screen capture not supported in this browser or context");
  }

  // Recommend PNG for fidelity; consider JPEG for smaller payloads
  const OUTPUT_FORMAT: "image/png" | "image/jpeg" = "image/png";
  const JPEG_QUALITY = 0.85;

  _lastCaptureAt = now;

  const work = (async (): Promise<ScreenshotResult> => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          // Not all browsers honor these constraints; kept as hints
          displaySurface: "monitor" as any,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: 30,
        },
        audio: false,
      });

      const bitmap = await grabFrameFromStream(stream);

      // Render to canvas (with optional region crop)
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;

      if (region) {
        const mapped = mapRegionToBitmapCoords(region, bitmap.width, bitmap.height);
        sx = Math.max(0, Math.min(mapped.x, bitmap.width - 1));
        sy = Math.max(0, Math.min(mapped.y, bitmap.height - 1));
        sw = Math.max(1, Math.min(mapped.width, bitmap.width - sx));
        sh = Math.max(1, Math.min(mapped.height, bitmap.height - sy));
      }

      canvas.width = sw;
      canvas.height = sh;
      const dw = sw, dh = sh;

      ctx.drawImage(bitmap as any, sx, sy, sw, sh, 0, 0, dw, dh);
      bitmap.close();

      const { base64, dataOnly, format } = canvasToBase64(
        canvas,
        OUTPUT_FORMAT,
        JPEG_QUALITY
      );

      return {
        base64,
        dataOnly,
        width: canvas.width,
        height: canvas.height,
        capturedAt: Date.now(),
        format,
      };
    } finally {
      // Always stop the stream immediately — don't leave screen sharing active
      stream?.getTracks().forEach((t) => t.stop());
      _inFlightCapture = null;
    }
  })();

  _inFlightCapture = work;
  return work;
}

// ─────────────────────────────────────────────────────────────────
// Capture + Analyse pipeline
// Called when user presses the coding hotkey (Ctrl+Shift+C)
// ─────────────────────────────────────────────────────────────────

export async function captureAndAnalyseCodingProblem(): Promise<void> {
  const overlayStore = useOverlayStore.getState();
  const sessionStore = useSessionStore.getState();

  overlayStore.setScreenshotLoading?.(true);
  overlayStore.setHintState?.("generating");

  try {
    // 1) Capture screen (full frame). If you want region selection,
    //    capture first, show selection overlay with the base64,
    //    then re-capture passing the mapped region.
    const screenshot = await captureScreen();

    // Optional optimization: if payload is too large, you can downscale here:
    // const resized = await resizeBase64(screenshot.base64, { maxDim: 1600, format: "image/jpeg", quality: 0.85 })

    // 2) Send to Gemini Vision
    const sessionId = sessionStore.session_id ?? "unknown";
    const analysis = await analyseScreenshotWithGemini(
      screenshot.dataOnly,
      sessionId
    );

    // 3) Format result for overlay display
    const hint = formatCodingAnalysis(analysis);
    overlayStore.setScreenshotHint?.(hint);
    overlayStore.setHintState?.("ready");
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Screenshot capture failed. Please allow screen capture and try again.";
    overlayStore.setError?.(message);
     
    console.error("[captureAndAnalyseCodingProblem] error:", err);
  } finally {
    overlayStore.setScreenshotLoading?.(false);
  }
}

// ─────────────────────────────────────────────────────────────────
/** Format coding analysis for overlay display */
// ─────────────────────────────────────────────────────────────────

function formatCodingAnalysis(analysis: {
  pattern: string;
  time_complexity: string;
  space_complexity: string;
  approach: string;
  edge_cases: string[];
}): string {
  const lines: string[] = [
    `🧩 Pattern: ${analysis.pattern}`,
    `⏱ Time: ${analysis.time_complexity}  |  💾 Space: ${analysis.space_complexity}`,
    ``,
    `📐 Approach:`,
    analysis.approach,
  ];

  if (Array.isArray(analysis.edge_cases) && analysis.edge_cases.length > 0) {
    lines.push("", "⚠️ Edge cases:");
    analysis.edge_cases.forEach((ec) => lines.push(`  • ${ec}`));
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────
// Support checks
// ─────────────────────────────────────────────────────────────────

export function isScreenCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function" &&
    typeof document !== "undefined" &&
    // Secure context is typically required
    (window.isSecureContext ?? true)
  );
}

// ─────────────────────────────────────────────────────────────────
// Canvas region selector UI helper
// Returns a Promise that resolves with user-drawn region
// (drag-to-select overlay, shown on top of frozen screenshot)
// ─────────────────────────────────────────────────────────────────

export function createRegionSelector(
  backgroundBase64: string
): Promise<CaptureRegion> {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 999999;
      cursor: crosshair; background: rgba(0,0,0,0.4);
    `;

    const img = document.createElement("img");
    img.src = backgroundBase64;
    img.alt = "Screenshot";
    img.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0.7;";

    const selectionBox = document.createElement("div");
    selectionBox.style.cssText = `
      position: absolute; border: 2px solid #6366f1;
      background: rgba(99,102,241,0.15); pointer-events: none;
    `;

    overlay.appendChild(img);
    overlay.appendChild(selectionBox);
    document.body.appendChild(overlay);

    let startX = 0,
      startY = 0;
    let isDrawing = false;

    const onMouseDown = (e: MouseEvent) => {
      isDrawing = true;
      startX = e.clientX;
      startY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDrawing) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      selectionBox.style.left = `${x}px`;
      selectionBox.style.top = `${y}px`;
      selectionBox.style.width = `${w}px`;
      selectionBox.style.height = `${h}px`;
    };

    const onMouseUp = (e: MouseEvent) => {
      if (!isDrawing) return;
      isDrawing = false;
      cleanup();
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      if (w < 10 || h < 10) {
        reject(new Error("Selection too small"));
        return;
      }
      resolve({ x, y, width: w, height: h });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        reject(new Error("Cancelled"));
      }
    };

    function cleanup() {
      overlay.removeEventListener("mousedown", onMouseDown);
      overlay.removeEventListener("mousemove", onMouseMove);
      overlay.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    }

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
  });
}
