import { useState } from "react";
import { useThemeStore } from "@/store/themeStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CheckCircle, Palette, Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// SettingsAppearance
// ─────────────────────────────────────────────────────────────────

const THEMES = [
  { id: "dark",      label: "Dark",       icon: Moon,    preview: "bg-[#0a0a0f]" },
  { id: "dim",       label: "Dim",        icon: Monitor, preview: "bg-[#13131f]" },
  { id: "midnight",  label: "Midnight",   icon: Moon,    preview: "bg-[#060610]" },
];

const ACCENT_COLORS = [
  { id: "violet", label: "Violet",  cls: "bg-violet-500" },
  { id: "blue",   label: "Blue",    cls: "bg-blue-500"   },
  { id: "emerald",label: "Emerald", cls: "bg-emerald-500"},
  { id: "rose",   label: "Rose",    cls: "bg-rose-500"   },
  { id: "amber",  label: "Amber",   cls: "bg-amber-500"  },
  { id: "cyan",   label: "Cyan",    cls: "bg-cyan-500"   },
];

const FONT_SIZES = ["Small", "Default", "Large"];
const DENSITIES  = ["Compact", "Default", "Comfortable"];

export default function SettingsAppearance() {
  const themeStore = useThemeStore();

  const [theme,    setTheme]    = useState(themeStore.theme    ?? "dark");
  const [accent,   setAccent]   = useState(themeStore.accent   ?? "violet");
  const [fontSize, setFontSize] = useState(themeStore.fontSize ?? "Default");
  const [density,  setDensity]  = useState(themeStore.density  ?? "Default");
  const [saved,    setSaved]    = useState(false);

  function handleSave() {
    themeStore.setTheme(theme);
    themeStore.setAccent(accent);
    themeStore.setFontSize(fontSize);
    themeStore.setDensity(density);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white">Appearance</h2>

      {/* Theme */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">Theme</h3>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={cn(
                "relative overflow-hidden rounded-xl border-2 aspect-video transition-all",
                theme === t.id
                  ? "border-violet-500"
                  : "border-white/10 hover:border-white/20"
              )}
            >
              <div className={cn("absolute inset-0", t.preview)} />
              <div className="absolute inset-x-0 bottom-0 p-2 bg-black/40">
                <p className="text-[10px] font-medium text-white">{t.label}</p>
              </div>
              {theme === t.id && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Accent color */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">Accent color</h3>
        <div className="flex gap-3 flex-wrap">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setAccent(c.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 group"
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-full border-2 transition-all",
                c.cls,
                accent === c.id
                  ? "border-white scale-110"
                  : "border-transparent hover:scale-105"
              )} />
              <span className="text-[10px] text-gray-500 group-hover:text-gray-300">
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      {/* Font size */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">Font size</h3>
        <div className="flex gap-2">
          {FONT_SIZES.map((f) => (
            <button
              key={f}
              onClick={() => setFontSize(f)}
              className={cn(
                "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                fontSize === f
                  ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                  : "bg-white/3 border-white/10 text-gray-500 hover:text-gray-300"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      {/* Density */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">Layout density</h3>
        <div className="flex gap-2">
          {DENSITIES.map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={cn(
                "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                density === d
                  ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                  : "bg-white/3 border-white/10 text-gray-500 hover:text-gray-300"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </Card>

      <Button
        variant={saved ? "success" : "primary"}
        size="md"
        onClick={handleSave}
        leftIcon={saved
          ? <CheckCircle className="w-4 h-4" />
          : <Palette className="w-4 h-4" />
        }
      >
        {saved ? "Applied!" : "Apply changes"}
      </Button>
    </div>
  );
}
