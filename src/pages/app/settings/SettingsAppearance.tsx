import { useState } from "react";
import { useUIStore, type Theme } from "@/store/uiStore";
import { useThemeStore } from "@/store/themeStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CheckCircle, Palette, Monitor, Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const THEMES = [
  { id: "light"  as const, label: "Light",  icon: Sun,     preview: "bg-[#fafafa]" },
  { id: "dark"   as const, label: "Dark",   icon: Moon,    preview: "bg-[#0a0a0f]" },
  { id: "system" as const, label: "System", icon: Monitor, preview: "bg-gradient-to-r from-[#fafafa] to-[#0a0a0f]" },
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
  const currentTheme = useUIStore((s) => s.theme);
  const setUITheme   = useUIStore((s) => s.setTheme);
  const extras       = useThemeStore();

  const [accent,   setAccent]   = useState(extras.accentColor ?? "violet");
  const [fontSize, setFontSize] = useState(extras.fontSize ?? "Default");
  const [density,  setDensity]  = useState(extras.density ?? "Default");
  const [saved,    setSaved]    = useState(false);

  function handleThemeClick(t: Theme) {
    setUITheme(t);
  }

  function handleSave() {
    extras.setAccentColor(accent);
    extras.setFontSize(fontSize);
    extras.setDensity(density);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Appearance</h2>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Theme</h3>
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleThemeClick(t.id)}
              className={cn(
                "relative overflow-hidden rounded-xl border-2 aspect-video transition-all",
                currentTheme === t.id
                  ? "border-violet-500"
                  : "border-border hover:border-muted-foreground/30"
              )}
            >
              <div className={cn("absolute inset-0", t.preview)} />
              <div className="absolute inset-x-0 bottom-0 p-2 bg-black/40">
                <div className="flex items-center gap-1.5">
                  <t.icon className="w-3 h-3 text-white" />
                  <p className="text-[10px] font-medium text-white">{t.label}</p>
                </div>
              </div>
              {currentTheme === t.id && (
                <div className="absolute top-2 right-2 w-4 h-4 bg-violet-500 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Accent color</h3>
        <div className="flex gap-3 flex-wrap">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c.id}
              onClick={() => setAccent(c.id)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className={cn(
                "w-8 h-8 rounded-full border-2 transition-all",
                c.cls,
                accent === c.id
                  ? "border-foreground scale-110"
                  : "border-transparent hover:scale-105"
              )} />
              <span className="text-[10px] text-muted-foreground group-hover:text-foreground">
                {c.label}
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Font size</h3>
        <div className="flex gap-2">
          {FONT_SIZES.map((f) => (
            <button
              key={f}
              onClick={() => setFontSize(f)}
              className={cn(
                "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                fontSize === f
                  ? "bg-violet-600/20 border-violet-500/30 text-violet-400 dark:text-violet-300"
                  : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Layout density</h3>
        <div className="flex gap-2">
          {DENSITIES.map((d) => (
            <button
              key={d}
              onClick={() => setDensity(d)}
              className={cn(
                "flex-1 py-2 rounded-xl border text-xs font-medium transition-all",
                density === d
                  ? "bg-violet-600/20 border-violet-500/30 text-violet-400 dark:text-violet-300"
                  : "bg-secondary/60 border-border text-muted-foreground hover:text-foreground"
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
