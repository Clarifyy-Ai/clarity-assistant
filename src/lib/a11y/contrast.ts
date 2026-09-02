/** Relative luminance per WCAG 2.1 (sRGB). */
function relativeLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const transform = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [lr, lg, lb] = [transform(r), transform(g), transform(b)];
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Contrast ratio between two #RRGGBB colors (1–21). */
export function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA minimum for normal text. */
export const WCAG_AA_NORMAL_TEXT = 4.5;

/** Convert CSS HSL (same numbers as `src/index.css` tokens) to #RRGGBB. */
export function hslToHex(h: number, sPercent: number, lPercent: number): string {
  const s = sPercent / 100;
  const l = lPercent / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Theme pairs that must stay WCAG AA. Keep in lockstep with `src/index.css`. */
export const THEME_CONTRAST_PAIRS = {
  lightMutedOnBackground: {
    fg: hslToHex(215, 16, 38),
    bg: hslToHex(216, 33, 97),
  },
  darkMutedOnBackground: {
    fg: hslToHex(215, 16, 72),
    bg: hslToHex(221, 49, 8),
  },
  lightForegroundOnBackground: {
    fg: hslToHex(221, 49, 8),
    bg: hslToHex(216, 33, 97),
  },
  darkForegroundOnBackground: {
    fg: hslToHex(210, 40, 96),
    bg: hslToHex(221, 49, 8),
  },
} as const;
