// src/components/overlay/OverlayPositionManager.tsx
import {
  forwardRef,
  useEffect,
  useRef,
  useLayoutEffect,
  type ReactNode,
  type Ref,
} from "react";
import {
  createDragHandler,
  createTouchDragHandler,
  getProctorSafePosition,
} from "@/lib/overlay/stealthMouse";
import type { OverlayPosition } from "@/store/overlayStore";

interface OverlayPositionManagerProps {
  position: OverlayPosition;
  onPositionChange: (pos: OverlayPosition) => void;
  isProctorSafe: boolean;
  overlayWidth: number;
  overlayHeight: number;
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
    { position, onPositionChange, isProctorSafe, overlayWidth, overlayHeight, children },
    ref
  ) {
    const localRef = useRef<HTMLDivElement | null>(null);
    const mergedRef = setRefs<HTMLDivElement>(ref, localRef);
    const lastSafePos = useRef<OverlayPosition | null>(null);
    const proctorSafeInitialized = useRef(false);

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
      if (!isProctorSafe) {
        lastSafePos.current = null;
        proctorSafeInitialized.current = false;
        return;
      }

      const applySafe = () => {
        const safePos = getProctorSafePosition(overlayWidth, overlayHeight);
        const prev = lastSafePos.current;
        if (prev && prev.x === safePos.x && prev.y === safePos.y) return;
        lastSafePos.current = safePos;
        onPositionChange(safePos);
      };

      if (!proctorSafeInitialized.current) {
        proctorSafeInitialized.current = true;
        applySafe();
      }

      // ✅ guard if window not available (PiP edge cases)
      if (typeof window === "undefined") return;

      const onWinResize = () => applySafe();
      window.addEventListener("resize", onWinResize);
      return () => {
        window.removeEventListener("resize", onWinResize);
      };
    }, [isProctorSafe, onPositionChange, overlayWidth, overlayHeight]);

    return (
      <div
        ref={mergedRef}
        className="fixed animate-fade-in"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 2147483647,
          // Wrapper passes through clicks; the inner panel toggles pointer-events
          // via `pointer-events-auto/none` based on visibility. This prevents the
          // hidden overlay from blocking underlying UI.
          pointerEvents: "none",
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
