import type { HintStyle } from "@/types/user.types";

/** Canonical hint styles persisted on sessions (edge start-session). */
export type StartSessionHintStyle = "minimal" | "balanced" | "detailed";

const UI_TO_START: Record<HintStyle, StartSessionHintStyle> = {
  short_hints: "minimal",
  keywords_only: "balanced",
  full_answer: "detailed",
};

const START_TO_UI: Record<StartSessionHintStyle, HintStyle> = {
  minimal: "short_hints",
  balanced: "keywords_only",
  detailed: "full_answer",
};

/** Map overlay / wizard HintStyle to start-session canonical value. */
export function hintStyleForStartSession(
  style: HintStyle | string | null | undefined,
): StartSessionHintStyle {
  if (style === "minimal" || style === "balanced" || style === "detailed") {
    return style;
  }
  if (style === "short_hints" || style === "keywords_only" || style === "full_answer") {
    return UI_TO_START[style];
  }
  return "balanced";
}

/** Map server start-session hint_style back to overlay HintStyle. */
export function hintStyleFromStartSession(
  style: string | null | undefined,
): HintStyle {
  if (style === "minimal" || style === "balanced" || style === "detailed") {
    return START_TO_UI[style];
  }
  if (style === "short_hints" || style === "keywords_only" || style === "full_answer") {
    return style;
  }
  return "short_hints";
}
