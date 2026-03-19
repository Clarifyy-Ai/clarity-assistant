// ─────────────────────────────────────────────────────────────────────────────
// colors.ts — Design system color tokens.
// Maps semantic roles to Tailwind CSS class names and raw hex values.
// Single source of truth for all color usage across components and charts.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Brand Palette ────────────────────────────────────────────────────────────

export const BRAND = {
  primary:       "#6366f1",  // indigo-500
  primaryLight:  "#818cf8",  // indigo-400
  primaryDark:   "#4f46e5",  // indigo-600
  secondary:     "#8b5cf6",  // violet-500
  secondaryLight:"#a78bfa",  // violet-400
  secondaryDark: "#7c3aed",  // violet-600
  accent:        "#06b6d4",  // cyan-500
  accentLight:   "#22d3ee",  // cyan-400
} as const;

// ─── Semantic Colors ──────────────────────────────────────────────────────────

export const SEMANTIC = {
  success: "#22c55e",   // green-500
  warning: "#f59e0b",   // amber-500
  error:   "#ef4444",   // red-500
  info:    "#3b82f6",   // blue-500
  muted:   "#6b7280",   // gray-500
} as const;

// ─── Neutral Scale ────────────────────────────────────────────────────────────

export const NEUTRAL = {
  50:  "#f9fafb",
  100: "#f3f4f6",
  200: "#e5e7eb",
  300: "#d1d5db",
  400: "#9ca3af",
  500: "#6b7280",
  600: "#4b5563",
  700: "#374151",
  800: "#1f2937",
  900: "#111827",
  950: "#030712",
} as const;

// ─── Plan Colors ──────────────────────────────────────────────────────────────

export const PLAN_COLORS = {
  free:       { bg: "bg-slate-100",  text: "text-slate-700",  border: "border-slate-300",  hex: "#64748b" },
  starter:    { bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-300",   hex: "#3b82f6" },
  pro:        { bg: "bg-violet-100", text: "text-violet-700", border: "border-violet-300", hex: "#8b5cf6" },
  elite:      { bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300",  hex: "#f59e0b" },
  enterprise: { bg: "bg-emerald-100",text: "text-emerald-700",border: "border-emerald-300",hex: "#10b981" },
} as const;

// ─── Interview Type Colors ────────────────────────────────────────────────────

export const INTERVIEW_TYPE_COLORS = {
  behavioral:    { bg: "bg-blue-100",   text: "text-blue-700",   hex: "#3b82f6" },
  technical:     { bg: "bg-violet-100", text: "text-violet-700", hex: "#8b5cf6" },
  "system-design":{ bg:"bg-indigo-100", text:"text-indigo-700",  hex: "#6366f1" },
  coding:        { bg: "bg-cyan-100",   text: "text-cyan-700",   hex: "#06b6d4" },
  hr:            { bg: "bg-rose-100",   text: "text-rose-700",   hex: "#f43f5e" },
  mixed:         { bg: "bg-orange-100", text: "text-orange-700", hex: "#f97316" },
} as const;

// ─── Score Colors (1–10 range) ────────────────────────────────────────────────

export const SCORE_COLORS = {
  excellent:  { range: [9, 10], hex: "#22c55e", label: "Excellent", tw: "text-green-500"  },
  good:       { range: [7, 8],  hex: "#84cc16", label: "Good",      tw: "text-lime-500"   },
  average:    { range: [5, 6],  hex: "#f59e0b", label: "Average",   tw: "text-amber-500"  },
  belowAvg:   { range: [3, 4],  hex: "#f97316", label: "Below Avg", tw: "text-orange-500" },
  poor:       { range: [1, 2],  hex: "#ef4444", label: "Poor",      tw: "text-red-500"    },
} as const;

/**
 * Get color info for a score value (1–10).
 */
export function getScoreColor(score: number): typeof SCORE_COLORS[keyof typeof SCORE_COLORS] {
  if (score >= 9) return SCORE_COLORS.excellent;
  if (score >= 7) return SCORE_COLORS.good;
  if (score >= 5) return SCORE_COLORS.average;
  if (score >= 3) return SCORE_COLORS.belowAvg;
  return SCORE_COLORS.poor;
}

// ─── Password Strength Colors ─────────────────────────────────────────────────

export const PASSWORD_STRENGTH_COLORS = {
  0: { hex: "#ef4444", tw: "bg-red-500",    label: "Very Weak"   },
  1: { hex: "#f97316", tw: "bg-orange-500", label: "Weak"        },
  2: { hex: "#eab308", tw: "bg-yellow-500", label: "Fair"        },
  3: { hex: "#3b82f6", tw: "bg-blue-500",   label: "Strong"      },
  4: { hex: "#22c55e", tw: "bg-green-500",  label: "Very Strong" },
} as const;

// ─── Network Quality Colors ───────────────────────────────────────────────────

export const NETWORK_QUALITY_COLORS = {
  excellent: { hex: "#22c55e", tw: "text-green-500",  bg: "bg-green-100"  },
  good:      { hex: "#84cc16", tw: "text-lime-500",   bg: "bg-lime-100"   },
  fair:      { hex: "#f59e0b", tw: "text-amber-500",  bg: "bg-amber-100"  },
  poor:      { hex: "#f97316", tw: "text-orange-500", bg: "bg-orange-100" },
  offline:   { hex: "#ef4444", tw: "text-red-500",    bg: "bg-red-100"    },
} as const;

// ─── Audio Level Colors ───────────────────────────────────────────────────────

export const AUDIO_LEVEL_COLORS = {
  silent:   "#6b7280",  // gray   — no signal
  low:      "#22c55e",  // green  — good
  medium:   "#84cc16",  // lime   — good
  high:     "#f59e0b",  // amber  — getting loud
  clipping: "#ef4444",  // red    — distortion
} as const;

/**
 * Get audio level color based on RMS amplitude (0–1).
 */
export function getAudioLevelColor(rms: number): string {
  if (rms < 0.01)  return AUDIO_LEVEL_COLORS.silent;
  if (rms < 0.15)  return AUDIO_LEVEL_COLORS.low;
  if (rms < 0.4)   return AUDIO_LEVEL_COLORS.medium;
  if (rms < 0.8)   return AUDIO_LEVEL_COLORS.high;
  return AUDIO_LEVEL_COLORS.clipping;
}

// ─── Filler Word Severity Colors ──────────────────────────────────────────────

export const FILLER_SEVERITY_COLORS = {
  low:    { hex: "#22c55e", label: "Great",    tw: "text-green-500"  },
  medium: { hex: "#f59e0b", label: "Okay",     tw: "text-amber-500"  },
  high:   { hex: "#ef4444", label: "Too Many", tw: "text-red-500"    },
} as const;

/**
 * Get filler severity based on fillers per minute.
 */
export function getFillerSeverity(fillersPerMinute: number): keyof typeof FILLER_SEVERITY_COLORS {
  if (fillersPerMinute < 3)  return "low";
  if (fillersPerMinute < 8)  return "medium";
  return "high";
}

// ─── WPM Colors ───────────────────────────────────────────────────────────────

export const WPM_COLORS = {
  tooSlow:   { hex: "#f97316", label: "Too Slow",  range: [0,   110] },
  ideal:     { hex: "#22c55e", label: "Ideal",     range: [111, 160] },
  tooFast:   { hex: "#f59e0b", label: "Too Fast",  range: [161, 200] },
  veryFast:  { hex: "#ef4444", label: "Very Fast", range: [201, Infinity] },
} as const;

export function getWPMColor(wpm: number): string {
  if (wpm <= 110) return WPM_COLORS.tooSlow.hex;
  if (wpm <= 160) return WPM_COLORS.ideal.hex;
  if (wpm <= 200) return WPM_COLORS.tooFast.hex;
  return WPM_COLORS.veryFast.hex;
}

// ─── Chart Palette ────────────────────────────────────────────────────────────

export const CHART_COLORS = [
  "#6366f1",  // indigo
  "#8b5cf6",  // violet
  "#06b6d4",  // cyan
  "#22c55e",  // green
  "#f59e0b",  // amber
  "#f43f5e",  // rose
  "#3b82f6",  // blue
  "#84cc16",  // lime
  "#f97316",  // orange
  "#a855f7",  // purple
] as const;

export type ChartColor = (typeof CHART_COLORS)[number];

// ─── Overlay Theme ────────────────────────────────────────────────────────────

export const OVERLAY_THEMES = {
  dark: {
    bg:         "#0f0f0f",
    bgSecondary:"#1a1a1a",
    border:     "#2a2a2a",
    text:       "#f9fafb",
    textMuted:  "#9ca3af",
    accent:     "#6366f1",
  },
  light: {
    bg:         "#ffffff",
    bgSecondary:"#f9fafb",
    border:     "#e5e7eb",
    text:       "#111827",
    textMuted:  "#6b7280",
    accent:     "#6366f1",
  },
  glass: {
    bg:         "rgba(15, 15, 15, 0.85)",
    bgSecondary:"rgba(26, 26, 26, 0.80)",
    border:     "rgba(255, 255, 255, 0.10)",
    text:       "#f9fafb",
    textMuted:  "#9ca3af",
    accent:     "#818cf8",
  },
} as const;

export type OverlayTheme = keyof typeof OVERLAY_THEMES;
