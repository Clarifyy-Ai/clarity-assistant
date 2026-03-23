// src/lib/overlay/useDocumentPiP.ts
import { useEffect, useRef, useState } from "react";

// Extend window type for DPiP API (Chrome 116+)
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: {
        width?: number;
        height?: number;
        disallowReturnToOpener?: boolean;
      }): Promise<Window & { document: Document }>;
      window: (Window & { document: Document }) | null;
    };
  }
}

/**
 * Opens a Document Picture-in-Picture window when `enabled` is true.
 * - Copies all stylesheets from the opener into the PiP document.
 * - Creates <div id="overlay-root"> in the PiP body for React portal rendering.
 * - Returns the PiP document (or null when PiP is unavailable/closed).
 * - Cleans up automatically when the effect tears down or the PiP window closes.
 *
 * NOTE: DPiP is tied to the opener tab by spec — closing the tab closes the
 * PiP window. Do NOT attempt to outlive the opener tab.
 */
export function useDocumentPiP(enabled: boolean): Document | null {
  const [pipDoc, setPipDoc] = useState<Document | null>(null);
  const pipWinRef = useRef<(Window & { document: Document }) | null>(null);

  useEffect(() => {
    // Guard: API must be available (Chrome 116+, HTTPS, no iframe)
    if (!enabled || !window.documentPictureInPicture) {
      setPipDoc(null);
      return;
    }

    let cancelled = false;

    async function openPiP() {
      try {
        const pipWin = await window.documentPictureInPicture!.requestWindow({
          width: 440,
          height: 560,
          disallowReturnToOpener: false,
        });

        if (cancelled) {
          pipWin.close();
          return;
        }

        pipWinRef.current = pipWin;

        // ── Copy all stylesheets from opener ──────────────────────────
        const openerSheets = Array.from(document.styleSheets);
        for (const sheet of openerSheets) {
          try {
            // Constructed / inline sheets
            if (sheet.cssRules) {
              const style = pipWin.document.createElement("style");
              style.textContent = Array.from(sheet.cssRules)
                .map((r) => r.cssText)
                .join("\n");
              pipWin.document.head.appendChild(style);
            }
          } catch {
            // Cross-origin sheet — copy via <link> href instead
            if (sheet.href) {
              const link = pipWin.document.createElement("link");
              link.rel = "stylesheet";
              link.href = sheet.href;
              pipWin.document.head.appendChild(link);
            }
          }
        }

        // Also copy any <style> tags injected by Vite HMR / Tailwind
        document.querySelectorAll("style").forEach((s) => {
          const clone = pipWin.document.createElement("style");
          clone.textContent = s.textContent;
          pipWin.document.head.appendChild(clone);
        });

        // ── Inherit CSS custom properties from :root ──────────────────
        const rootStyle = getComputedStyle(document.documentElement);
        const vars = Array.from(rootStyle).filter((k) => k.startsWith("--"));
        if (vars.length > 0) {
          const varStyle = pipWin.document.createElement("style");
          varStyle.textContent =
            `:root { ${vars.map((v) => `${v}: ${rootStyle.getPropertyValue(v)};`).join(" ")} }`;
          pipWin.document.head.appendChild(varStyle);
        }

        // ── Dark background to match app theme ────────────────────────
        const baseStyle = pipWin.document.createElement("style");
        baseStyle.textContent = `
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { background: transparent; overflow: hidden; height: 100%; width: 100%; }
          #overlay-root { width: 100%; height: 100%; }
        `;
        pipWin.document.head.appendChild(baseStyle);

        // ── Create the portal root ────────────────────────────────────
        const overlayRoot = pipWin.document.createElement("div");
        overlayRoot.id = "overlay-root";
        pipWin.document.body.appendChild(overlayRoot);

        // ── Expose pipDoc to React ────────────────────────────────────
        setPipDoc(pipWin.document);

        // ── Cleanup when PiP window is closed by user ─────────────────
        pipWin.addEventListener("pagehide", () => {
          setPipDoc(null);
          pipWinRef.current = null;
        });

      } catch (err) {
        // User dismissed the prompt or API threw — fail silently
        console.warn("[useDocumentPiP] Could not open PiP window:", err);
        setPipDoc(null);
      }
    }

    openPiP();

    return () => {
      cancelled = true;
      // Close PiP window on effect teardown (overlay hidden / component unmount)
      if (pipWinRef.current && !pipWinRef.current.closed) {
        try { pipWinRef.current.close(); } catch { /* ignore */ }
      }
      pipWinRef.current = null;
      setPipDoc(null);
    };
  }, [enabled]);

  return pipDoc;
}
