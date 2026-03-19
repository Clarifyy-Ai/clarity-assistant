import {
  forwardRef,
  useEffect,
  useRef,
  useLayoutEffect,
  type ReactNode,
  type Ref,
} from "react";
import { createDragHandler, getProctorSafePosition } from "@/lib/overlay/stealthMouse";
import type { OverlayPosition } from "@/store/overlayStore";

/**
 * Props:
 * - position: current top-left coordinate (CSS pixels)
 * - onPositionChange: callback when user drags or when we auto-adjust
 * - isProctorSafe: when true, we enforce a "safe" position that avoids proctor-detectable areas
 * - children: overlay content
 */
interface OverlayPositionManagerProps {
  position: OverlayPosition;
  onPositionChange: (pos: OverlayPosition) => void;
  isProctorSafe: boolean;
  children: ReactNode;
}

// Utility: merge forwarded ref with local ref
function setRefs<T>(...refs: (Ref<T> | undefined)[]) {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") ref(value);
      else {
        // @ts-expect-error: writeable ref
        ref.current = value;
      }
    });
  };
}

export const OverlayPositionManager = forwardRef<HTMLDivElement, OverlayPositionManagerProps>(
  function OverlayPositionManager(
    { position, onPositionChange, isProctorSafe, children },
    ref
  ) {
    const localRef = useRef<HTMLDivElement>(null);
    const mergedRef = setRefs<HTMLDivElement>(ref, localRef);

    // Attach drag handler to the current element; cleanup on unmount or element change
    useEffect(() => {
      const el = localRef.current;
      if (!el) return;

      const cleanup = createDragHandler(el, onPositionChange);
      return () => cleanup?.();
      // Depend only on callback identity; ref.current is read at runtime
    }, [onPositionChange]);

    // Enforce proctor-safe position on:
    // - toggle of isProctorSafe
    // - element size changes
    // - window resize (viewport change)
    useLayoutEffect(() => {
      const el = localRef.current;
      if (!el) return;

      // Handler to compute and set safe position
      const applySafe = () => {
        if (!isProctorSafe) return;
        const safePos = getProctorSafePosition(el.offsetWidth, el.offsetHeight);
        onPositionChange(safePos);
      };

      // Initial enforce (if enabled)
      applySafe();

      // Observe size changes
      const ro = new ResizeObserver(() => {
        applySafe();
      });
      ro.observe(el);

      // Observe viewport changes
      const onWinResize = () => applySafe();
      window.addEventListener("resize", onWinResize);

      return () => {
        ro.disconnect();
        window.removeEventListener("resize", onWinResize);
      };
    }, [isProctorSafe, onPositionChange]);

    // Keep the overlay absolutely/fixed positioned with GPU hinting
    return (
      <div
        ref={mergedRef}
        className="fixed animate-fade-in"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 9999,
          isolation: "isolate",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      >
        {children}
      </div>
    );
  }
);
