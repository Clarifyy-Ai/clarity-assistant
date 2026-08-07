import { useEffect } from "react";
import { useLocation } from "react-router-dom";

function scrollContainersToTop(): void {
  const main = document.getElementById("main-content");
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

function scrollToHashTarget(hash: string, attemptsLeft = 12): void {
  const id = hash.replace(/^#/, "");
  if (!id) {
    scrollContainersToTop();
    return;
  }

  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "auto", block: "start" });
    return;
  }

  if (attemptsLeft <= 0) {
    scrollContainersToTop();
    return;
  }

  // Lazy route panels (e.g. guide sections) may mount a few frames later.
  window.setTimeout(() => scrollToHashTarget(hash, attemptsLeft - 1), 50);
}

/**
 * Resets scroll position on SPA navigations.
 * Marketing pages scroll the window; the authenticated app scrolls `#main-content`.
 * Hash deep-links scroll the matching element into view after the route paints.
 */
export function ScrollToTop(): null {
  const { pathname, search, hash } = useLocation();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (hash) {
        scrollToHashTarget(hash);
      } else {
        scrollContainersToTop();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [pathname, search, hash]);

  return null;
}

export default ScrollToTop;
