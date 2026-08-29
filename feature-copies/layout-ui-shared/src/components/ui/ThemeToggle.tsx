import { Sun, Moon, Monitor } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useUIStore((s) => s.theme);
  const resolvedTheme = useUIStore((s) => s.resolved_theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const label =
    theme === "light" ? "Switch to dark mode" :
    theme === "dark" ? "Switch to system theme" :
    "Switch to light mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      className={cn(
        "w-9 h-9 flex items-center justify-center rounded-xl transition-all",
        "bg-secondary/60 hover:bg-secondary border border-border",
        "text-muted-foreground hover:text-foreground",
        className
      )}
      aria-label={label}
      title={label}
    >
      {theme === "system" ? (
        <Monitor className="w-4 h-4" />
      ) : resolvedTheme === "dark" ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}
