import { useEffect } from "react";

/**
 * Locks background/body scrolling while an overlay (mobile drawer, modal) is open.
 *
 * - Uses `position: fixed` on <body> so iOS Safari / Android Chrome cannot
 *   rubber-band or touch-scroll the page behind the overlay.
 * - Compensates for the scrollbar width so desktop layouts do not shift.
 * - Restores the exact previous scroll position on unlock.
 *
 * Safe to mount in multiple components: a simple reference count keeps the
 * lock active until the last consumer releases it.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  overscrollBehavior: string;
  paddingRight: string;
  htmlOverflow: string;
} | null = null;

function applyLock(): void {
  if (typeof document === "undefined") return;
  const { body, documentElement: html } = document;

  savedScrollY = window.scrollY || html.scrollTop || 0;
  savedStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    overscrollBehavior: body.style.overscrollBehavior,
    paddingRight: body.style.paddingRight,
    htmlOverflow: html.style.overflow,
  };

  const scrollbarWidth = window.innerWidth - html.clientWidth;

  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  body.style.overscrollBehavior = "none";
  html.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }
}

function releaseLock(): void {
  if (typeof document === "undefined" || !savedStyles) return;
  const { body, documentElement: html } = document;

  body.style.position = savedStyles.position;
  body.style.top = savedStyles.top;
  body.style.left = savedStyles.left;
  body.style.right = savedStyles.right;
  body.style.width = savedStyles.width;
  body.style.overflow = savedStyles.overflow;
  body.style.overscrollBehavior = savedStyles.overscrollBehavior;
  body.style.paddingRight = savedStyles.paddingRight;
  html.style.overflow = savedStyles.htmlOverflow;
  savedStyles = null;

  // Restore scroll position without animating.
  window.scrollTo({ top: savedScrollY, left: 0, behavior: "auto" });
}

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;

    lockCount += 1;
    if (lockCount === 1) applyLock();

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) releaseLock();
    };
  }, [locked]);
}

export default useBodyScrollLock;
