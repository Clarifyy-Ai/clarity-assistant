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
  createTouchDragHandler,
  getProctorSafePosition,
} from "@/lib/overlay/stealthMouse";
import type { OverlayPosition } from "@/store/overlayStore";
import { getOverlayPortalZIndex, type OverlayStackContext } from "@/lib/overlay/zIndexManager";

interface OverlayPositionManagerProps {
  position: OverlayPosition;
  onPositionChange: (pos: OverlayPosition) => void;
  isProctorSafe: boolean;
  overlayWidth: number;
  overlayHeight: number;
  stackContext?: OverlayStackContext;
  sessionActive?: boolean;
  /** When false, wrapper ignores pointer events (overlay hidden). */
  enableInteraction?: boolean;
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
    { position, onPositionChange, isProctorSafe, overlayWidth, overlayHeight, stackContext = "fullscreen", sessionActive = false, enableInteraction = true, children },
    ref
  ) {
    const localRef = useRef<HTMLDivElement | null>(null);
    const mergedRef = setRefs<HTMLDivElement>(ref, localRef);
    const lastSafePos = useRef<OverlayPosition | null>(null);
    const proctorSafeInitialized = useRef(false);

    useEffect(() => {
      const el = localRef.current;
      if (!el) return;

      const cleanupTouch = createTouchDragHandler(el, onPositionChange);

      return () => {
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
          zIndex: getOverlayPortalZIndex(stackContext, sessionActive),
          pointerEvents: enableInteraction ? "auto" : "none",
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
