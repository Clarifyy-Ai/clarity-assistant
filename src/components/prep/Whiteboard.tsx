// Sprint D: Lightweight whiteboard for system-design sketches.
// Pure HTML5 Canvas — zero dependencies. Pen + eraser + clear + export.
import { useEffect, useRef, useState } from "react";
import { Pen, Eraser, Trash2, Download } from "lucide-react";
import { cn } from "@/lib/utils";

type Tool = "pen" | "eraser";

interface WhiteboardProps {
  height?: number;
  className?: string;
}

export function Whiteboard({ height = 360, className }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#a78bfa");

  // Resize canvas to container width with devicePixelRatio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      // Preserve drawing on resize by snapshotting
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

  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
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
            onClick={clear}
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

function ToolBtn({
  active, onClick, icon, label,
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-xs rounded-md border flex items-center gap-1",
        active
          ? "border-violet-500 bg-violet-500/10 text-violet-300"
          : "border-border hover:bg-secondary"
      )}
    >
      {icon} {label}
    </button>
  );
}
