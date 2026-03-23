import { useEffect, useState } from "react";

// ─── DPiP Browser API type augmentation ───────────────────────────────────────
// The Document Picture-in-Picture API is a Chrome-only experimental feature.
// TypeScript doesn't include it in lib.dom.d.ts yet, so we declare it here.
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: { width?: number; height?: number }): Promise<Window & typeof globalThis>;
      readonly window: (Window & typeof globalThis) | null;
    };
  }
}

function isDPiPSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "documentPictureInPicture" in window &&
    typeof window.documentPictureInPicture?.requestWindow === "function"
  );
}

/**
 * useDocumentPiP — Opens a Document Picture-in-Picture companion window when
 * `enabled` is true and the browser supports the API (Chrome 116+).
 *
 * The PiP window floats above all other windows (always-on-top), even when
 * the main browser window is minimised. It is automatically closed when the
 * opener tab is closed — that is a hard platform constraint and is not worked
 * around here.
 *
 * Returns the PiP `Document` so that callers can use `createPortal` to render
 * React content inside it. Returns `null` when:
 *   - DPiP is not supported by the browser, OR
 *   - the window hasn't opened yet (async), OR
 *   - `enabled` is false.
 *
 * CSS stylesheets and the dark/light theme class are copied from the opener
 * document into the PiP document so that all design-system tokens and Tailwind
 * utilities are available inside the PiP window.
 */
export function useDocumentPiP(enabled: boolean): Document | null {
  const [pipDoc, setPipDoc] = useState<Document | null>(null);

  useEffect(() => {
    if (!enabled || !isDPiPSupported()) {
      return;
    }

    let cancelled = false;
    let pipWin: (Window & typeof globalThis) | null = null;

    async function openPiP() {
      try {
        pipWin = await window.documentPictureInPicture!.requestWindow({
          width: 460,
          height: 580,
        });
      } catch (err) {
        // Common reasons: user dismissed the prompt, browser policy denied it,
        // or the API isn't available in this context.
        console.warn("[useDocumentPiP] requestWindow failed:", err);
        return;
      }

      if (cancelled) {
        pipWin.close();
        return;
      }

      const doc = pipWin.document;

      // ── 1. Copy all stylesheets from the opener document ─────────────────────
      // Clone every <link rel="stylesheet"> and <style> element so that
      // Tailwind classes, CSS custom properties, and overlay-specific rules
      // are available inside the PiP window.
      document.querySelectorAll("link[rel='stylesheet'], style").forEach((el) => {
        try {
          doc.head.appendChild(el.cloneNode(true));
        } catch {
          // Ignore nodes that can't be cloned (e.g. CSSStyleSheet with CORS)
        }
      });

      // ── 2. Mirror theme class (dark / light) from the opener <html> ──────────
      const openerHtml = document.documentElement;
      const pipHtml = doc.documentElement;
      if (openerHtml.classList.contains("dark")) {
        pipHtml.classList.add("dark");
      }

      // Also copy any inline CSS variables set on the opener <html> element
      // (e.g. runtime-computed brand tokens).
      const openerInlineStyle = openerHtml.getAttribute("style");
      if (openerInlineStyle) {
        pipHtml.setAttribute("style", openerInlineStyle);
      }

      // ── 3. Reset PiP body so it's transparent and has no chrome ──────────────
      const resetStyle = doc.createElement("style");
      resetStyle.textContent =
        "html,body{margin:0;padding:0;background:transparent;overflow:hidden;}";
      doc.head.appendChild(resetStyle);

      // ── 4. Create the portal root that OverlayWindow will render into ─────────
      const overlayRoot = doc.createElement("div");
      overlayRoot.id = "overlay-root";
      doc.body.appendChild(overlayRoot);

      setPipDoc(doc);

      // ── 5. Handle the PiP window being closed externally ─────────────────────
      // `pagehide` fires both when the user manually closes the PiP window and
      // when the opener tab closes (which also closes the PiP by spec).
      pipWin.addEventListener("pagehide", () => {
        if (!cancelled) {
          setPipDoc(null);
        }
      });
    }

    openPiP();

    return () => {
      cancelled = true;
      try {
        if (pipWin && !pipWin.closed) {
          pipWin.close();
        }
      } catch {
        // Ignore — window may already be gone
      }
      setPipDoc(null);
    };
  }, [enabled]);

  return pipDoc;
}
