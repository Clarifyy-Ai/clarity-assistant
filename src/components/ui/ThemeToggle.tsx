import { Sun, Moon } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// ThemeToggle
// Dark / light mode toggle — persisted in uiStore → localStorage.
// ─────────────────────────────────────────────────────────────────

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useUIStore();
  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "w-9 h-9 flex items-center justify-center rounded-xl",
        "bg-white/5 hover:bg-white/10 border border-white/10",
        "text-gray-400 hover:text-white transition-all",
        className
      )}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun  className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </button>
  );
}
