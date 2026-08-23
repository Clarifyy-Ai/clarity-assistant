import type { PresetShape } from "@/lib/prep/systemDesignPresets";
import { sha256 } from "@/lib/utils/hashUtils";

export type DiagramSpecNode = {
  id: string;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  color?: string;
};

export type DiagramSpecEdge = {
  from: string;
  to: string;
  label?: string;
};

export type DiagramSpec = {
  nodes: DiagramSpecNode[];
  edges: DiagramSpecEdge[];
};

export type SystemDesignParseResult = {
  markdown: string;
  diagramSpec?: DiagramSpec;
  source?: string;
};

const diagramUrlCache = new Map<string, string>();

export function isDiagramSpec(value: unknown): value is DiagramSpec {
  if (!value || typeof value !== "object") return false;
  const spec = value as DiagramSpec;
  return Array.isArray(spec.nodes) && Array.isArray(spec.edges);
}

export function diagramSpecToPresetShapes(spec: DiagramSpec): PresetShape[] {
  const shapes: PresetShape[] = [];
  for (const node of spec.nodes) {
    shapes.push({
      kind: "box",
      x: node.x,
      y: node.y,
      w: node.w ?? 120,
      h: node.h ?? 48,
      label: node.label,
      color: node.color ?? "#a78bfa",
    });
  }
  for (const edge of spec.edges) {
    const from = spec.nodes.find((n) => n.id === edge.from);
    const to = spec.nodes.find((n) => n.id === edge.to);
    if (!from || !to) continue;
    const fx = from.x + (from.w ?? 120) / 2;
    const fy = from.y + (from.h ?? 48);
    const tx = to.x + (to.w ?? 120) / 2;
    const ty = to.y;
    shapes.push({ kind: "arrow", x1: fx, y1: fy, x2: tx, y2: ty });
    if (edge.label) {
      shapes.push({
        kind: "label",
        x: (fx + tx) / 2,
        y: (fy + ty) / 2 - 8,
        text: edge.label,
        size: 10,
      });
    }
  }
  return shapes;
}

export function parseSystemDesignResponse(raw: unknown): SystemDesignParseResult {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("{")) {
      try {
        return parseSystemDesignResponse(JSON.parse(trimmed) as unknown);
      } catch {
        return { markdown: trimmed };
      }
    }
    return { markdown: trimmed };
  }

  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const nested = obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : null;
    const markdown = String(
      obj.result ?? obj.markdown ?? obj.text ?? nested?.result ?? nested?.markdown ?? "",
    ).trim();
    const diagramRaw = obj.diagram_spec ?? obj.diagramSpec ?? nested?.diagram_spec ?? nested?.diagramSpec;
    const source = typeof obj.source === "string"
      ? obj.source
      : typeof nested?.source === "string"
        ? nested.source
        : undefined;

    return {
      markdown,
      diagramSpec: isDiagramSpec(diagramRaw) ? diagramRaw : undefined,
      source,
    };
  }

  return { markdown: "" };
}

export async function getCachedDiagramObjectUrl(
  spec: DiagramSpec,
  render: (canvas: HTMLCanvasElement, shapes: PresetShape[]) => void,
): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const hash = await sha256(JSON.stringify(spec));
  const cached = diagramUrlCache.get(hash);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 380;
  render(canvas, diagramSpecToPresetShapes(spec));
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  diagramUrlCache.set(hash, url);
  return url;
}

export function revokeDiagramObjectUrl(url: string): void {
  URL.revokeObjectURL(url);
  for (const [hash, cached] of diagramUrlCache.entries()) {
    if (cached === url) diagramUrlCache.delete(hash);
  }
}
