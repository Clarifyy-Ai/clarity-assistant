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
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export interface ScreenshotResult {
  base64:     string;       // data:image/png;base64,...
  dataOnly:   string;       // raw base64 without prefix
  width:      number;
  height:     number;
  capturedAt: number;       // epoch ms
}

// ─────────────────────────────────────────────────────────────────
// Capture full screen via getDisplayMedia (one-shot)
// ─────────────────────────────────────────────────────────────────

export async function captureScreen(
  region?: CaptureRegion
): Promise<ScreenshotResult> {
  let stream: MediaStream | null = null;

  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "monitor",
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) throw new Error("No video track in screen capture");

    // Capture frame via ImageCapture API
    const imageCapture = new ImageCapture(videoTrack);
    const bitmap       = await imageCapture.grabFrame();

    // Render to canvas
    const canvas  = document.createElement("canvas");
    const ctx     = canvas.getContext("2d")!;

    if (region) {
      canvas.width  = region.width;
      canvas.height = region.height;
      ctx.drawImage(
        bitmap,
        region.x, region.y, region.width, region.height,
        0, 0, region.width, region.height
      );
    } else {
      canvas.width  = bitmap.width;
      canvas.height = bitmap.height;
      ctx.drawImage(bitmap, 0, 0);
    }

    bitmap.close();

    const base64  = canvas.toDataURL("image/png");
    const dataOnly = base64.replace(/^data:image\/png;base64,/, "");

    return {
      base64,
      dataOnly,
      width:      canvas.width,
      height:     canvas.height,
      capturedAt: Date.now(),
    };
  } finally {
    // Always stop the stream immediately — don't leave screen sharing active
    stream?.getTracks().forEach((t) => t.stop());
  }
}

// ─────────────────────────────────────────────────────────────────
// Capture + Analyse pipeline
// Called when user presses the coding hotkey (Ctrl+Shift+C)
// ─────────────────────────────────────────────────────────────────

export async function captureAndAnalyseCodingProblem(): Promise<void> {
  const overlayStore = useOverlayStore.getState();
  const sessionStore = useSessionStore.getState();

  overlayStore.setScreenshotLoading(true);
  overlayStore.setHintState("generating");

  try {
    // 1. Capture screen
    const screenshot = await captureScreen();

    // 2. Send to Gemini Vision
    const sessionId = sessionStore.session_id ?? "unknown";
    const analysis  = await analyseScreenshotWithGemini(
      screenshot.dataOnly,
      sessionId
    );

    // 3. Format result for overlay display
    const hint = formatCodingAnalysis(analysis);
    overlayStore.setScreenshotHint(hint);
    overlayStore.setHintState("ready");

  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Screenshot capture failed";
    overlayStore.setError(message);
  } finally {
    overlayStore.setScreenshotLoading(false);
  }
}

// ─────────────────────────────────────────────────────────────────
// Format coding analysis for overlay display
// ─────────────────────────────────────────────────────────────────

function formatCodingAnalysis(analysis: {
  pattern:          string;
  time_complexity:  string;
  space_complexity: string;
  approach:         string;
  edge_cases:       string[];
}): string {
  const lines: string[] = [
    `🧩 Pattern: ${analysis.pattern}`,
    `⏱ Time: ${analysis.time_complexity}  |  💾 Space: ${analysis.space_complexity}`,
    ``,
    `📐 Approach:`,
    analysis.approach,
  ];

  if (analysis.edge_cases.length > 0) {
    lines.push("", "⚠️ Edge cases:");
    analysis.edge_cases.forEach((ec) => lines.push(`  • ${ec}`));
  }

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────
// Check if ImageCapture API is supported
// ─────────────────────────────────────────────────────────────────

export function isScreenCaptureSupported(): boolean {
  return (
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof ImageCapture !== "undefined"
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
    img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0.7;";

    const selectionBox = document.createElement("div");
    selectionBox.style.cssText = `
      position: absolute; border: 2px solid #6366f1;
      background: rgba(99,102,241,0.15); pointer-events: none;
    `;

    overlay.appendChild(img);
    overlay.appendChild(selectionBox);
    document.body.appendChild(overlay);

    let startX = 0, startY = 0;
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
      selectionBox.style.left   = `${x}px`;
      selectionBox.style.top    = `${y}px`;
      selectionBox.style.width  = `${w}px`;
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
      document.body.removeChild(overlay);
    }

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
  });
}
