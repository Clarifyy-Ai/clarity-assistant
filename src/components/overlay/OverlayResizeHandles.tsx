// src/components/overlay/OverlayResizeHandles.tsx
import { useCallback, useRef } from "react";
import { useOverlayStore } from "@/store/overlayStore";
      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      document.body.style.userSelect = "none";
      document.body.style.cursor = HANDLE_STYLES[edge].cursor as string;

      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newW = startW;
        let newH = startH;

        if (edge === "e" || edge === "se") newW = startW + dx;
        if (edge === "s" || edge === "se") newH = startH + dy;

        useOverlayStore.getState().setOverlaySize(newW, newH);
      };

      const onUp = () => {
        isResizing.current = false;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);

        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor;
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [containerRef]
  );

  return (
    <>
      {(["e", "s", "se"] as Edge[]).map((edge) => (
        <div
          key={edge}
          style={HANDLE_STYLES[edge]}
          onPointerDown={(e) => handlePointerDown(edge, e)}
          className="z-50 group touch-none"
          role="presentation"
        >
          {edge === "e" && (
            <div className="absolute inset-y-4 right-0 w-0.5 rounded-full bg-white/0 group-hover:bg-white/20 transition-colors" />
          )}
          {edge === "s" && (
            <div className="absolute bottom-0 inset-x-4 h-0.5 rounded-full bg-white/0 group-hover:bg-white/20 transition-colors" />
          )}
          {edge === "se" && (
            <svg
              className="absolute bottom-1 right-1 w-4 h-4 text-white/0 group-hover:text-white/30 transition-colors"
              viewBox="0 0 12 12"
              fill="currentColor"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="6" cy="10" r="1.5" />
              <circle cx="10" cy="6" r="1.5" />
              <circle cx="2" cy="10" r="1.5" />
              <circle cx="10" cy="2" r="1.5" />
            </svg>
          )}
        </div>
      ))}
    </>
  );
}

interface OverlayResizeHandlesProps {
  containerRef: React.RefObject<HTMLDivElement>;
}

type Edge = "e" | "s" | "se";

const HANDLE_STYLES: Record<Edge, React.CSSProperties> = {
  e: { position: "absolute", top: 8, right: -4, bottom: 8, width: 8, cursor: "ew-resize" },
  s: { position: "absolute", left: 8, right: 8, bottom: -4, height: 8, cursor: "ns-resize" },
  se: { position: "absolute", right: -4, bottom: -4, width: 16, height: 16, cursor: "nwse-resize" },
};

export function OverlayResizeHandles({ containerRef }: OverlayResizeHandlesProps) {
  const isResizing = useRef(false);

  const handlePointerDown = useCallback(
    (edge: Edge, e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const el = containerRef.current;
      if (!el || isResizing.current) return;

      isResizing.current = true;

      // ✅ pointer capture: smoother resizing even if cursor leaves the handle
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = el.offsetWidth;
      const startH = el.offsetHeight;

