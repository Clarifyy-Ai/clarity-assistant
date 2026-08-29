export type PresetShape =
  | { kind: "box"; x: number; y: number; w: number; h: number; label: string; color?: string }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "label"; x: number; y: number; text: string; size?: number };

export interface SystemDesignPreset {
  id: string;
  label: string;
  description: string;
  shapes: PresetShape[];
}

export const SYSTEM_DESIGN_PRESETS: SystemDesignPreset[] = [
  {
    id: "twitter",
    label: "Twitter",
    description: "Timeline feed, tweet service, fan-out",
    shapes: [
      { kind: "label", x: 24, y: 16, text: "Twitter — High Level", size: 14 },
      { kind: "box", x: 40, y: 48, w: 100, h: 44, label: "Client", color: "#6366f1" },
      { kind: "box", x: 200, y: 48, w: 120, h: 44, label: "API Gateway", color: "#8b5cf6" },
      { kind: "box", x: 380, y: 32, w: 110, h: 40, label: "Tweet Svc", color: "#a78bfa" },
      { kind: "box", x: 380, y: 88, w: 110, h: 40, label: "Timeline", color: "#a78bfa" },
      { kind: "box", x: 540, y: 48, w: 100, h: 44, label: "Cache", color: "#22d3ee" },
      { kind: "box", x: 200, y: 140, w: 120, h: 44, label: "User DB", color: "#34d399" },
      { kind: "box", x: 380, y: 140, w: 120, h: 44, label: "Tweet DB", color: "#34d399" },
      { kind: "arrow", x1: 140, y1: 70, x2: 200, y2: 70 },
      { kind: "arrow", x1: 320, y1: 60, x2: 380, y2: 52 },
      { kind: "arrow", x1: 320, y1: 80, x2: 380, y2: 108 },
      { kind: "arrow", x1: 490, y1: 70, x2: 540, y2: 70 },
    ],
  },
  {
    id: "netflix",
    label: "Netflix",
    description: "CDN, encoding pipeline, recommendations",
    shapes: [
      { kind: "label", x: 24, y: 16, text: "Netflix — Streaming", size: 14 },
      { kind: "box", x: 40, y: 56, w: 90, h: 40, label: "Client", color: "#6366f1" },
      { kind: "box", x: 170, y: 56, w: 110, h: 40, label: "CDN Edge", color: "#f59e0b" },
      { kind: "box", x: 330, y: 40, w: 120, h: 40, label: "API / Auth", color: "#8b5cf6" },
      { kind: "box", x: 330, y: 100, w: 120, h: 40, label: "Recommend", color: "#a78bfa" },
      { kind: "box", x: 500, y: 40, w: 110, h: 40, label: "Catalog DB", color: "#34d399" },
      { kind: "box", x: 500, y: 100, w: 110, h: 40, label: "ML Pipeline", color: "#22d3ee" },
      { kind: "box", x: 170, y: 140, w: 140, h: 40, label: "Transcode Queue", color: "#f472b6" },
      { kind: "arrow", x1: 130, y1: 76, x2: 170, y2: 76 },
      { kind: "arrow", x1: 280, y1: 66, x2: 330, y2: 60 },
      { kind: "arrow", x1: 280, y1: 86, x2: 330, y2: 120 },
    ],
  },
  {
    id: "uber",
    label: "Uber",
    description: "Matching, geolocation, trip lifecycle",
    shapes: [
      { kind: "label", x: 24, y: 16, text: "Uber — Ride Hailing", size: 14 },
      { kind: "box", x: 30, y: 50, w: 90, h: 36, label: "Rider App", color: "#6366f1" },
      { kind: "box", x: 30, y: 110, w: 90, h: 36, label: "Driver App", color: "#6366f1" },
      { kind: "box", x: 180, y: 70, w: 120, h: 44, label: "Trip Service", color: "#8b5cf6" },
      { kind: "box", x: 350, y: 40, w: 110, h: 40, label: "Matching", color: "#a78bfa" },
      { kind: "box", x: 350, y: 100, w: 110, h: 40, label: "Geo Index", color: "#22d3ee" },
      { kind: "box", x: 510, y: 70, w: 100, h: 44, label: "Trip DB", color: "#34d399" },
      { kind: "box", x: 180, y: 150, w: 120, h: 40, label: "Location Stream", color: "#f472b6" },
      { kind: "arrow", x1: 120, y1: 68, x2: 180, y2: 82 },
      { kind: "arrow", x1: 120, y1: 128, x2: 180, y2: 98 },
      { kind: "arrow", x1: 300, y1: 82, x2: 350, y2: 60 },
      { kind: "arrow", x1: 300, y1: 98, x2: 350, y2: 120 },
    ],
  },
];

export function getSystemDesignPreset(id: string): SystemDesignPreset | undefined {
  return SYSTEM_DESIGN_PRESETS.find((p) => p.id === id);
}
