// Sprint D: Lightweight whiteboard for system-design sketches.
// Pure HTML5 Canvas — zero dependencies. Pen + eraser + clear + export + presets.
import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import { Pen, Eraser, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type PresetShape,
  getSystemDesignPreset,
} from "@/lib/prep/systemDesignPresets";

type Tool = "pen" | "eraser";

export interface WhiteboardHandle {
  loadPreset: (presetId: string) => void;
  loadShapes: (shapes: PresetShape[]) => void;
  clear: () => void;
}

interface WhiteboardProps {
  height?: number;
  className?: string;
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawPresetShape(
  ctx: CanvasRenderingContext2D,
  shape: PresetShape,
  dpr: number,
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (shape.kind === "box") {
    ctx.strokeStyle = shape.color ?? "#a78bfa";
    ctx.fillStyle = `${shape.color ?? "#a78bfa"}22`;
    ctx.lineWidth = 2;
    strokeRoundRect(ctx, shape.x, shape.y, shape.w, shape.h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shape.label, shape.x + shape.w / 2, shape.y + shape.h / 2);
  } else if (shape.kind === "arrow") {
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.stroke();
    const angle = Math.atan2(shape.y2 - shape.y1, shape.x2 - shape.x1);
    const head = 8;
    ctx.beginPath();
    ctx.moveTo(shape.x2, shape.y2);
    ctx.lineTo(
      shape.x2 - head * Math.cos(angle - Math.PI / 6),
      shape.y2 - head * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      shape.x2 - head * Math.cos(angle + Math.PI / 6),
      shape.y2 - head * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fillStyle = "#94a3b8";
    ctx.fill();
  } else if (shape.kind === "label") {
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `${shape.size ?? 12}px system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(shape.text, shape.x, shape.y);
  }

  ctx.restore();
}

export const Whiteboard = forwardRef<WhiteboardHandle, WhiteboardProps>(
  function Whiteboard({ height = 360, className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const drawingRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const hasContentRef = useRef(false);
    const toolRef = useRef<Tool>("pen");
    const colorRef = useRef("#a78bfa");
    const [tool, setTool] = useState<Tool>("pen");
    const [color, setColor] = useState("#a78bfa");

    useEffect(() => {
      toolRef.current = tool;
    }, [tool]);

    useEffect(() => {
      colorRef.current = color;
    }, [color]);

    const clearCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      hasContentRef.current = false;
    };

    const drawShapes = (shapes: PresetShape[]) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      clearCanvas();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      for (const shape of shapes) {
        drawPresetShape(ctx, shape, dpr);
      }
      hasContentRef.current = shapes.length > 0;
    };

    const drawPreset = (presetId: string) => {
      const preset = getSystemDesignPreset(presetId);
      if (!preset) return;
      drawShapes(preset.shapes);
    };

    useImperativeHandle(ref, () => ({
      loadPreset: drawPreset,
      loadShapes: drawShapes,
      clear: clearCanvas,
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      const parent = containerRef.current ?? canvas?.parentElement ?? null;
      if (!canvas || !parent) return;

      const resize = () => {
        const rect = parent.getBoundingClientRect();
        if (rect.width <= 0) return;

        const dpr = window.devicePixelRatio || 1;
        const snap = hasContentRef.current ? canvas.toDataURL() : "";
        canvas.width = Math.max(1, Math.floor(rect.width * dpr));
        canvas.height = Math.max(1, Math.floor(height * dpr));
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (snap) {
          const img = new Image();
          img.onload = () => {
            try {
              ctx.drawImage(img, 0, 0, rect.width, height);
            } catch {
              /* ignore decode failures */
            }
          };
          img.src = snap;
        }
      };

      resize();
      const ro = new ResizeObserver(() => resize());
      ro.observe(parent);
      return () => ro.disconnect();
    }, [height]);

    const getPos = (
      e: React.PointerEvent<HTMLCanvasElement>,
    ): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const pos = getPos(e);
      if (!pos) return;
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastRef.current = pos;
    };

    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const last = lastRef.current;
      const pos = getPos(e);
      if (!ctx || !last || !pos) return;

      const activeTool = toolRef.current;
      ctx.globalCompositeOperation =
        activeTool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = colorRef.current;
      ctx.lineWidth = activeTool === "eraser" ? 18 : 2.5;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastRef.current = pos;
      hasContentRef.current = true;
    };

    const onUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
      if (e && canvasRef.current?.hasPointerCapture?.(e.pointerId)) {
        try {
          canvasRef.current.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }
      drawingRef.current = false;
      lastRef.current = null;
    };

    const exportPng = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `whiteboard-${Date.now()}.png`;
      a.click();
    };

    return (
      <div
        className={cn(
          "min-w-0 w-full rounded-xl border border-border bg-card p-3",
          className,
        )}
        data-testid="whiteboard-root"
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <ToolBtn
            active={tool === "pen"}
            onClick={() => setTool("pen")}
            icon={<Pen className="w-3.5 h-3.5" />}
            label="Pen"
          />
          <ToolBtn
            active={tool === "eraser"}
            onClick={() => setTool("eraser")}
            icon={<Eraser className="w-3.5 h-3.5" />}
            label="Eraser"
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-7 h-7 rounded-md border border-border bg-transparent cursor-pointer"
            aria-label="Color"
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={clearCanvas}
              className="px-2 py-1 text-xs rounded-md border border-border hover:bg-secondary flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
            <button
              type="button"
              onClick={exportPng}
              className="px-2 py-1 text-xs rounded-md border border-border hover:bg-secondary flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>
        <div
          ref={containerRef}
          className="min-w-0 w-full bg-background rounded-lg overflow-hidden border border-border"
          data-testid="whiteboard-canvas-wrap"
        >
          <canvas
            ref={canvasRef}
            data-testid="whiteboard-canvas"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
            className="block touch-none cursor-crosshair w-full"
          />
        </div>
      </div>
    );
  },
);

function ToolBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "px-2 py-1 text-xs rounded-md border flex items-center gap-1",
        active
          ? "border-primary bg-primary/10 text-primary/80"
          : "border-border hover:bg-secondary",
      )}
    >
      {icon} {label}
    </button>
  );
}
