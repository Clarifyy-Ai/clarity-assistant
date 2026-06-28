/** HSL tokens (without `hsl()`) applied to --primary and related vars. */
const ACCENT_HSL: Record<string, string> = {
  violet:  "239 84% 67%",
  blue:    "217 91% 60%",
  emerald: "142 71% 45%",
  rose:    "346 77% 60%",
  amber:   "38 92% 50%",
  cyan:    "189 94% 43%",
};

const FONT_SIZE_PX: Record<string, string> = {
  Small:   "14px",
  Default: "16px",
  Large:   "18px",
};

const DENSITY_RADIUS: Record<string, string> = {
  Compact:     "0.375rem",
  Default:     "0.625rem",
  Comfortable: "0.875rem",
};

const DENSITY_SPACING: Record<string, string> = {
  Compact:     "0.875",
  Default:     "1",
  Comfortable: "1.125",
};

export interface AppearancePreferences {
  accentColor?: string;
  fontSize?: string;
  density?: string;
}

/** Apply accent, font size, and density preferences to document.documentElement. */
export function applyAppearancePreferences({
  accentColor = "violet",
  fontSize = "Default",
  density = "Default",
}: AppearancePreferences = {}): void {
  const root = document.documentElement;
  const accentKey = accentColor.toLowerCase();
  const hsl = ACCENT_HSL[accentKey] ?? ACCENT_HSL.violet;

  root.style.setProperty("--primary", hsl);
  root.style.setProperty("--ring", hsl);
  root.style.setProperty("--sidebar-accent", hsl);
  root.style.setProperty("--sidebar-ring", hsl);
  root.style.setProperty("--chart-1", hsl);
  root.setAttribute("data-accent", accentKey);

  const fontPx = FONT_SIZE_PX[fontSize] ?? FONT_SIZE_PX.Default;
  root.style.setProperty("--app-font-size", fontPx);
  root.style.fontSize = fontPx;
  root.setAttribute("data-font-size", fontSize.toLowerCase());

  root.style.setProperty("--radius", DENSITY_RADIUS[density] ?? DENSITY_RADIUS.Default);
  root.style.setProperty(
    "--spacing-scale",
    DENSITY_SPACING[density] ?? DENSITY_SPACING.Default,
  );
  const densityKey = density.toLowerCase();
  root.setAttribute("data-density", densityKey);
  root.classList.remove("density-compact", "density-default", "density-comfortable");
  root.classList.add(`density-${densityKey}`);
}
