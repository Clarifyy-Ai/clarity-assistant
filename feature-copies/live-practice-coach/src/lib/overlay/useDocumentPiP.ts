// src/lib/overlay/useDocumentPiP.ts
import { useEffect, useRef, useState } from "react";

// Extend the window type for the Document Picture-in-Picture API (Chrome 116+)
declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options?: {
        width?:                  number;
        height?:                 number;
        disallowReturnToOpener?: boolean;
      }): Promise<Window & { document: Document }>;
      window: (Window & { document: Document }) | null;
    };
  }
}

/**
 * Opens a Document Picture-in-Picture window when `enabled` is true.
 *
 * - Copies all stylesheets (without duplication) from the opener into the PiP document.
 * - Creates <div id="overlay-root"> in the PiP body for React portal rendering.
 * - Returns the PiP document (or null when PiP is unavailable/closed).
 * - Cleans up automatically when the effect tears down or the PiP window closes.
 * - Closes the PiP window on `beforeunload` so it doesn't linger as a ghost.
 *
 * NOTE: DPiP is tied to the opener tab by spec — closing the tab closes the
 * PiP window. Do NOT attempt to outlive the opener tab.
 */
export function useDocumentPiP(enabled: boolean): Document | null {
  const [pipDoc, setPipDoc]  = useState<Document | null>(null);
  const pipWinRef            = useRef<(Window & { document: Document }) | null>(null);

  useEffect(() => {
    if (!enabled || !window.documentPictureInPicture) {
      setPipDoc(null);
      return;
    }

    let cancelled = false;

    // ── beforeunload: close PiP if the opener tab unloads ───────────────
    // FIX: without this, the PiP window can become a ghost after page nav.
    function handleBeforeUnload() {
      try { pipWinRef.current?.close(); } catch {}
    }
    window.addEventListener("beforeunload", handleBeforeUnload);

    async function openPiP() {
      try {
        const pipWin = await window.documentPictureInPicture!.requestWindow({
          width:                  440,
          height:                 560,
          disallowReturnToOpener: false,
        });

        // FIX: also clear pipWinRef if cancelled, not just close the window
        if (cancelled) {
          pipWinRef.current = null;
          try { pipWin.close(); } catch {}
          return;
        }

        pipWinRef.current = pipWin;

        // ── Copy stylesheets without duplication ────────────────────────
        // FIX: previously this block iterated both document.styleSheets AND
        //      document.querySelectorAll("style"), causing <style> tags created
        //      by Vite/Tailwind to be copied TWICE (once via cssRules, once
        //      via textContent). We now track hrefs we've already handled.
        const copiedHrefs = new Set<string>();

        for (const sheet of Array.from(document.styleSheets)) {
          try {
            if (sheet.cssRules) {
              // Inline / constructed sheet — copy via cssText
              const style = pipWin.document.createElement("style");
              style.textContent = Array.from(sheet.cssRules)
                .map((r) => r.cssText)
                .join("\n");
              pipWin.document.head.appendChild(style);
              if (sheet.href) copiedHrefs.add(sheet.href);
            } else if (sheet.href && !copiedHrefs.has(sheet.href)) {
              // Cross-origin sheet — copy via <link>
              const link = pipWin.document.createElement("link");
              link.rel  = "stylesheet";
              link.href = sheet.href;
              pipWin.document.head.appendChild(link);
              copiedHrefs.add(sheet.href);
            }
          } catch {
            // Cross-origin sheet without href — skip
          }
        }

        // Copy only <style> tags whose content isn't already included via styleSheets.
        // We identify them by checking if the ownerNode was a <style> element that
        // wasn't reachable through cssRules (e.g. Vite-injected tags in shadow DOM).
        document.querySelectorAll("style").forEach((s) => {
          // Skip empty tags
          if (!s.textContent?.trim()) return;
          // Skip if this tag's sheet was already copied above
          const ownerSheet = Array.from(document.styleSheets).find(
            (sh) => sh.ownerNode === s,
          );
          if (ownerSheet) return; // already handled in the loop above

          const clone = pipWin.document.createElement("style");
          clone.textContent = s.textContent;
          pipWin.document.head.appendChild(clone);
        });

        // ── Inherit CSS custom properties from :root ────────────────────
        const rootStyle = getComputedStyle(document.documentElement);
        const vars      = Array.from(rootStyle).filter((k) => k.startsWith("--"));
        if (vars.length > 0) {
          const varStyle = pipWin.document.createElement("style");
          varStyle.textContent =
            `:root { ${vars.map((v) => `${v}: ${rootStyle.getPropertyValue(v).trim()};`).join(" ")} }`;
          pipWin.document.head.appendChild(varStyle);
        }

        // ── Base styles for PiP window ──────────────────────────────────
        const baseStyle = pipWin.document.createElement("style");
        baseStyle.textContent = `
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { background: transparent; overflow: hidden; height: 100%; width: 100%; }
          #clarify-overlay-root { width: 100%; height: 100%; }
        `;
        pipWin.document.head.appendChild(baseStyle);

        // ── Portal root ─────────────────────────────────────────────────
        const overlayRoot = pipWin.document.createElement("div");
        overlayRoot.id    = "clarify-overlay-root";
        pipWin.document.body.appendChild(overlayRoot);

        // ── Expose to React ─────────────────────────────────────────────
        setPipDoc(pipWin.document);

        // ── Cleanup when the PiP window is closed by the user ──────────
        pipWin.addEventListener("pagehide", () => {
          setPipDoc(null);
          pipWinRef.current = null;
        });

      } catch (err) {
        // User dismissed the prompt or API unavailable — fail silently
        console.warn("[useDocumentPiP] Could not open PiP window:", err);
        setPipDoc(null);
      }
    }

    openPiP();

    return () => {
      cancelled = true;
      window.removeEventListener("beforeunload", handleBeforeUnload);

      if (pipWinRef.current) {
        try { pipWinRef.current.close(); } catch {}
        pipWinRef.current = null;
      }
      setPipDoc(null);
    };
  }, [enabled]);

  return pipDoc;
}
