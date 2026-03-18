import { forwardRef, useEffect, useRef, type ReactNode } from "react";
import { createDragHandler, getProctorSafePosition } from "@/lib/overlay/stealthMouse";
import type { OverlayPosition } from "@/store/overlayStore";

interface OverlayPositionManagerProps {
  position: OverlayPosition;
  onPositionChange: (pos: OverlayPosition) => void;
  isProctorSafe: boolean;
  children: ReactNode;
}

export const OverlayPositionManager = forwardRef<HTMLDivElement, OverlayPositionManagerProps>(
  function OverlayPositionManager({ position, onPositionChange, isProctorSafe, children }, ref) {
    const internalRef = useRef<HTMLDivElement>(null);
    const overlayRef = (ref as React.RefObject<HTMLDivElement>) || internalRef;
    const cleanupRef = useRef<(() => void) | null>(null);

    // Attach drag handler
    useEffect(() => {
      const el = overlayRef.current;
      if (!el) return;

      cleanupRef.current = createDragHandler(el, onPositionChange);
      return () => {
        cleanupRef.current?.();
      };
    }, [overlayRef.current]);

    // Proctor-safe position override
    useEffect(() => {
      if (isProctorSafe && overlayRef.current) {
        const safePos = getProctorSafePosition(
          overlayRef.current.offsetWidth,
          overlayRef.current.offsetHeight
        );
        onPositionChange(safePos);
      }
    }, [isProctorSafe]);

    return (
      <div
        ref={overlayRef}
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
