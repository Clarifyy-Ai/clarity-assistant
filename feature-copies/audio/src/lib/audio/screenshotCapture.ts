import { toast } from "sonner";
import { useOverlayStore } from "@/store/overlayStore";
import { assertOnlineForCapture } from "@/lib/overlay/captureGating";

// ─────────────────────────────────────────────────────────────────
// Screenshot Capture — coding problem region → AI full answer
// ─────────────────────────────────────────────────────────────────

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotResult {
  base64: string;
  dataOnly: string;
  width: number;
  height: number;
  capturedAt: number;
  format: "image/png" | "image/jpeg";
}

const SCREENSHOT_MIN_INTERVAL_MS = 300;
let _lastCaptureAt = 0;
let _inFlightCapture: Promise<ScreenshotResult> | null = null;
let _lastFullScreenshot: ScreenshotResult | null = null;

export class ScreenshotThrottledError extends Error {
  constructor(msToWait: number) {
    super(`Screenshot capture throttled — wait ${msToWait}ms before retrying`);
    this.name = "ScreenshotThrottledError";
  }
}

async function grabFrameFromStream(stream: MediaStream): Promise<ImageBitmap> {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error("No video track in screen capture");

  if (typeof (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture !== "undefined") {
    try {
      const ImageCaptureCtor = (window as unknown as { ImageCapture: new (t: MediaStreamTrack) => { grabFrame: () => Promise<ImageBitmap> } }).ImageCapture;
      const imageCapture = new ImageCaptureCtor(track);
      return await imageCapture.grabFrame();
    } catch (e) {
      console.warn("[screenshotCapture] ImageCapture.grabFrame failed, falling back:", e);
    }
  }

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;

  await new Promise<void>((resolve, reject) => {
    video.addEventListener("loadedmetadata", () => resolve(), { once: true });
    video.addEventListener("error", () => reject(new Error("Failed to load stream into video element")), { once: true });
  });

  try {
    await video.play();
  } catch {
    // some browsers allow draw without play
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot create 2D context");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  const bmp = await createImageBitmap(canvas);
  video.pause();
  video.srcObject = null;
  return bmp;
}

function canvasToBase64(
  canvas: HTMLCanvasElement,
  format: "image/png" | "image/jpeg" = "image/png",
  quality = 0.9,
): { base64: string; dataOnly: string; format: "image/png" | "image/jpeg" } {
  const base64 = format === "image/jpeg"
    ? canvas.toDataURL("image/jpeg", quality)
    : canvas.toDataURL("image/png");
  const dataOnly = base64.replace(/^data:image\/(png|jpeg);base64,/, "");
  return { base64, dataOnly, format };
}

function mapRegionToBitmapCoords(
  region: CaptureRegion,
  bitmapWidth: number,
  bitmapHeight: number,
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

export async function captureScreen(region?: CaptureRegion): Promise<ScreenshotResult> {
  const now = Date.now();
  const elapsed = now - _lastCaptureAt;

  if (_inFlightCapture) {
    return _inFlightCapture;
  }

  if (elapsed < SCREENSHOT_MIN_INTERVAL_MS) {
    throw new ScreenshotThrottledError(SCREENSHOT_MIN_INTERVAL_MS - elapsed);
  }

  if (!isScreenCaptureSupported()) {
    throw new Error("Screen capture not supported in this browser or context");
  }

  _lastCaptureAt = now;

  const work = (async (): Promise<ScreenshotResult> => {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor" as any,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: 30,
        },
        audio: false,
      });

      const bitmap = await grabFrameFromStream(stream);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      let sx = 0;
      let sy = 0;
      let sw = bitmap.width;
      let sh = bitmap.height;

      if (region) {
        const mapped = mapRegionToBitmapCoords(region, bitmap.width, bitmap.height);
        sx = Math.max(0, Math.min(mapped.x, bitmap.width - 1));
        sy = Math.max(0, Math.min(mapped.y, bitmap.height - 1));
        sw = Math.max(1, Math.min(mapped.width, bitmap.width - sx));
        sh = Math.max(1, Math.min(mapped.height, bitmap.height - sy));
      }

      canvas.width = sw;
      canvas.height = sh;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
      bitmap.close();

      const { base64, dataOnly, format } = canvasToBase64(canvas, "image/png", 0.85);
      return {
        base64,
        dataOnly,
        width: canvas.width,
        height: canvas.height,
        capturedAt: Date.now(),
        format,
      };
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
      _inFlightCapture = null;
    }
  })();

  _inFlightCapture = work;
  return work;
}

export function cropScreenshotFromBase64(
  screenshot: ScreenshotResult,
  region: CaptureRegion,
): Promise<ScreenshotResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const mapped = mapRegionToBitmapCoords(region, img.width, img.height);
      const canvas = document.createElement("canvas");
      const sx = Math.max(0, Math.min(mapped.x, img.width - 1));
      const sy = Math.max(0, Math.min(mapped.y, img.height - 1));
      const sw = Math.max(1, Math.min(mapped.width, img.width - sx));
      const sh = Math.max(1, Math.min(mapped.height, img.height - sy));
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Cannot crop screenshot"));
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      const { base64, dataOnly, format } = canvasToBase64(canvas, screenshot.format, 0.85);
      resolve({
        base64,
        dataOnly,
        width: sw,
        height: sh,
        capturedAt: Date.now(),
        format,
      });
    };
    img.onerror = () => reject(new Error("Failed to load screenshot for cropping"));
    img.src = screenshot.base64;
  });
}

export function createRegionSelector(backgroundBase64: string): Promise<CaptureRegion> {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:999999;cursor:crosshair;background:rgba(0,0,0,0.4);";

    const img = document.createElement("img");
    img.src = backgroundBase64;
    img.alt = "Screenshot";
    img.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0.7;";

    const hint = document.createElement("div");
    hint.textContent = "Drag to select the coding question, then release";
    hint.style.cssText =
      "position:absolute;top:16px;left:50%;transform:translateX(-50%);background:rgba(15,15,30,0.9);color:#fff;padding:8px 14px;border-radius:999px;font:12px system-ui;pointer-events:none;";

    const selectionBox = document.createElement("div");
    selectionBox.style.cssText =
      "position:absolute;border:2px solid #6366f1;background:rgba(99,102,241,0.15);pointer-events:none;";

    overlay.appendChild(img);
    overlay.appendChild(hint);
    overlay.appendChild(selectionBox);
    document.body.appendChild(overlay);

    let startX = 0;
    let startY = 0;
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
      selectionBox.style.left = `${x}px`;
      selectionBox.style.top = `${y}px`;
      selectionBox.style.width = `${Math.abs(e.clientX - startX)}px`;
      selectionBox.style.height = `${Math.abs(e.clientY - startY)}px`;
    };

    const finish = (e: MouseEvent) => {
      if (!isDrawing) return;
      isDrawing = false;
      cleanup();
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      if (w < 10 || h < 10) {
        reject(new Error("Selection too small — drag a box around the question"));
        return;
      }
      resolve({ x, y, width: w, height: h });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        cleanup();
        reject(new Error("Capture cancelled"));
      }
    };

    function cleanup() {
      overlay.removeEventListener("mousedown", onMouseDown);
      overlay.removeEventListener("mousemove", onMouseMove);
      overlay.removeEventListener("mouseup", finish);
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    }

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", finish);
    document.addEventListener("keydown", onKeyDown);
  });
}

/** One capture + drag-select region + crop (no second share picker). */
export async function captureCodingProblemRegion(): Promise<ScreenshotResult> {
  const full = await captureScreen();
  _lastFullScreenshot = full;
  useOverlayStore.getState().setHasRecropSource(true);
  const region = await createRegionSelector(full.base64);
  return cropScreenshotFromBase64(full, region);
}

/** Re-select region on the last full screenshot without re-sharing the screen. */
export async function recropCodingProblemRegion(): Promise<ScreenshotResult> {
  if (!_lastFullScreenshot) {
    throw new Error("No recent screen capture — use Capture first, then Adjust region");
  }
  const region = await createRegionSelector(_lastFullScreenshot.base64);
  return cropScreenshotFromBase64(_lastFullScreenshot, region);
}

export function hasLastFullScreenshot(): boolean {
  return _lastFullScreenshot !== null;
}

export function clearLastFullScreenshot(): void {
  _lastFullScreenshot = null;
  useOverlayStore.getState().setHasRecropSource(false);
}

export type CaptureCodingAnswerOptions = {
  onGenerate: (args: { question: string; screenshot: ScreenshotResult }) => Promise<void>;
  mode?: "new_capture" | "adjust_region";
};

const CODING_QUESTION_FALLBACK =
  "Read the coding problem shown in the screenshot. Provide a complete interview-ready answer: restate the problem, optimal approach, time and space complexity, step-by-step solution outline, and edge cases.";

export async function captureCodingQuestionAndGenerateAnswer(
  options: CaptureCodingAnswerOptions,
): Promise<void> {
  const overlayStore = useOverlayStore.getState();

  if (!assertOnlineForCapture()) {
    return;
  }

  if (!isScreenCaptureSupported()) {
    toast.error("Screen capture is not supported in this browser. Use Chrome or Edge on desktop.");
    return;
  }

  const mode = options.mode ?? "new_capture";
  if (mode === "adjust_region" && !hasLastFullScreenshot()) {
    toast.error("Capture the screen first, then use Adjust region to fix your selection.");
    return;
  }

  overlayStore.setScreenshotLoading?.(true);
  overlayStore.setHintState?.("generating");
  overlayStore.setError?.(null);

  try {
    toast.info(
      mode === "adjust_region"
        ? "Drag a new box around the question"
        : "Select the problem area on screen",
      { duration: 3500 },
    );

    const screenshot =
      mode === "adjust_region"
        ? await recropCodingProblemRegion()
        : await captureCodingProblemRegion();

    const spokenQuestion = overlayStore.current_question?.trim();
    const question = spokenQuestion || CODING_QUESTION_FALLBACK;
    if (!spokenQuestion) {
      overlayStore.setCurrentQuestion?.(question);
    }

    overlayStore.setHintState?.("streaming");
    await options.onGenerate({ question, screenshot });
  } catch (err: unknown) {
    const message =
      err instanceof ScreenshotThrottledError
        ? "Please wait a moment before capturing again."
        : err instanceof Error
          ? err.message
          : "Screen capture failed.";

    if (/cancel/i.test(message)) {
      overlayStore.setHintState?.("idle");
      toast.message("Capture cancelled");
      return;
    }

    if (/permission|denied|NotAllowed/i.test(message)) {
      toast.error("Screen capture permission denied. Allow screen sharing and try again.");
    } else {
      toast.error(message);
    }

    overlayStore.setError?.(message);
    overlayStore.setHintState?.("idle");
  } finally {
    overlayStore.setScreenshotLoading?.(false);
  }
}

/** Invokes the session-scoped handler registered by useLiveCopilot. */
export async function captureAndAnalyseCodingProblem(): Promise<void> {
  const handler = useOverlayStore.getState().capture_coding_handler;
  if (handler) {
    handler();
    return;
  }
  toast.error("Start a Practice Coach session first, then use Screen capture.");
}

export function isScreenCaptureSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === "function" &&
    typeof document !== "undefined" &&
    (window.isSecureContext ?? true)
  );
}
