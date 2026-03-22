import {
  forwardRef,
  useEffect,
  useRef,
  useLayoutEffect,
  type ReactNode,
  type Ref,
} from "react";
import { createDragHandler, createTouchDragHandler, getProctorSafePosition } from "@/lib/overlay/stealthMouse";
import type { OverlayPosition } from "@/store/overlayStore";

interface OverlayPositionManagerProps {
  position: OverlayPosition;
  onPositionChange: (pos: OverlayPosition) => void;
  isProctorSafe: boolean;
  children: ReactNode;
}

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
    const lastSafePos = useRef<OverlayPosition | null>(null);

    useEffect(() => {
      const el = localRef.current;
      if (!el) return;

      const cleanupMouse = createDragHandler(el, onPositionChange);
      const cleanupTouch = createTouchDragHandler(el, onPositionChange);
      return () => {
        cleanupMouse?.();
        cleanupTouch?.();
      };
    }, [onPositionChange]);

    useLayoutEffect(() => {
      const el = localRef.current;
      if (!el || !isProctorSafe) {
        lastSafePos.current = null;
        return;
      }

      const applySafe = () => {
        const safePos = getProctorSafePosition(el.offsetWidth, el.offsetHeight);
        const prev = lastSafePos.current;
        if (prev && prev.x === safePos.x && prev.y === safePos.y) return;
        lastSafePos.current = safePos;
        onPositionChange(safePos);
      };

      applySafe();

      const ro = new ResizeObserver(() => applySafe());
      ro.observe(el);

      const onWinResize = () => applySafe();
      window.addEventListener("resize", onWinResize);

      return () => {
        ro.disconnect();
        window.removeEventListener("resize", onWinResize);
      };
    }, [isProctorSafe, onPositionChange]);

    return (
      <div
        ref={mergedRef}
        className="fixed animate-fade-in"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 2147483647,
          pointerEvents: "auto",
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
