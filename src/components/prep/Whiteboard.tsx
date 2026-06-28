// Sprint D: Lightweight whiteboard for system-design sketches.
// Pure HTML5 Canvas — zero dependencies. Pen + eraser + clear + export + presets.
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { Pen, Eraser, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type PresetShape,
  getSystemDesignPreset,
} from "@/lib/prep/systemDesignPresets";

type Tool = "pen" | "eraser";

export interface WhiteboardHandle {
  loadPreset: (presetId: string) => void;
  clear: () => void;
}

interface WhiteboardProps {
  height?: number;
  className?: string;
}

function drawPresetShape(
  ctx: CanvasRenderingContext2D,
  shape: PresetShape,
  dpr: number
): void {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (shape.kind === "box") {
    ctx.strokeStyle = shape.color ?? "#a78bfa";
    ctx.fillStyle = `${shape.color ?? "#a78bfa"}22`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(shape.x, shape.y, shape.w, shape.h, 6);
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
      shape.y2 - head * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      shape.x2 - head * Math.cos(angle + Math.PI / 6),
      shape.y2 - head * Math.sin(angle + Math.PI / 6)
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
    const drawingRef = useRef(false);
    const lastRef = useRef<{ x: number; y: number } | null>(null);
    const [tool, setTool] = useState<Tool>("pen");
    const [color, setColor] = useState("#a78bfa");

    const clearCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    const drawPreset = (presetId: string) => {
      const preset = getSystemDesignPreset(presetId);
      const canvas = canvasRef.current;
      if (!preset || !canvas) return;

      clearCanvas();
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      for (const shape of preset.shapes) {
        drawPresetShape(ctx, shape, dpr);
      }
    };

    useImperativeHandle(ref, () => ({
      loadPreset: drawPreset,
      clear: clearCanvas,
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const resize = () => {
        const rect = canvas.parentElement!.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const snap = canvas.toDataURL();
        canvas.width = rect.width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${height}px`;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height);
        img.src = snap;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(canvas.parentElement!);
      return () => ro.disconnect();
    }, [height]);

    const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      lastRef.current = getPos(e);
    };

    const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      const ctx = canvasRef.current!.getContext("2d")!;
      const pos = getPos(e);
      const last = lastRef.current!;
      ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = color;
      ctx.lineWidth = tool === "eraser" ? 18 : 2.5;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      lastRef.current = pos;
    };

    const onUp = () => {
      drawingRef.current = false;
      lastRef.current = null;
    };

    const exportPng = () => {
      const url = canvasRef.current!.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `whiteboard-${Date.now()}.png`;
      a.click();
    };

    return (
      <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
        <div className="flex items-center gap-2 mb-2">
          <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} icon={<Pen className="w-3.5 h-3.5" />} label="Pen" />
          <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} icon={<Eraser className="w-3.5 h-3.5" />} label="Eraser" />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-7 h-7 rounded-md border border-border bg-transparent cursor-pointer"
            aria-label="Color"
          />
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={clearCanvas}
              className="px-2 py-1 text-xs rounded-md border border-border hover:bg-secondary flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
            <button
              onClick={exportPng}
              className="px-2 py-1 text-xs rounded-md border border-border hover:bg-secondary flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>
        <div className="w-full bg-background rounded-lg overflow-hidden border border-border">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            className="block touch-none cursor-crosshair"
          />
        </div>
      </div>
    );
  }
);

function ToolBtn({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-xs rounded-md border flex items-center gap-1",
        active
          ? "border-primary bg-primary/10 text-primary/80"
          : "border-border hover:bg-secondary"
      )}
    >
      {icon} {label}
    </button>
  );
}
