import { useEffect, useRef } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";

const HOTKEYS = [
  { keys: ["ctrl", "shift", "h"], label: "Toggle overlay" },
  { keys: ["ctrl", "shift", "s"], label: "Stealth mode" },
  { keys: ["ctrl", "shift", "y"], label: "Cycle hint style" },
  { keys: ["ctrl", "shift", "c"], label: "Screenshot + analyse" },
  { keys: ["ctrl", "shift", "p"], label: "Panic button" },
  { keys: ["ctrl", "shift", "m"], label: "Mute / unmute" },
  { keys: ["ctrl", "shift", "/"], label: "This help" },
  { keys: ["ctrl", "shift", "1-4"], label: "Quick dock positions" },
  { keys: ["escape"], label: "Clear hint / close" },
];

export function OverlayHotkeyHelp() {
  const isVisible = useOverlayStore((s) => s.is_hotkey_help_visible);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isVisible) return;

    timerRef.current = setTimeout(() => {
      useOverlayStore.getState().setHotkeyHelpVisible(false);
    }, 5000);

    function dismiss() {
      useOverlayStore.getState().setHotkeyHelpVisible(false);
    }

    window.addEventListener("keydown", dismiss);
    window.addEventListener("click", dismiss);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("click", dismiss);
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl">
      <div className="bg-[#12121a] border border-white/10 rounded-xl shadow-2xl p-4 w-[280px] animate-fade-in">
        <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
          Keyboard Shortcuts
        </p>
        <div className="space-y-2">
          {HOTKEYS.map((hk) => (
            <div key={hk.label} className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground/80">{hk.label}</span>
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[9px] text-muted-foreground font-mono">
                {hk.keys.includes("1-4")
                  ? "⌃⇧1–4"
                  : formatHotkeyLabel(hk.keys)}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground/40 mt-3 text-center">
          Auto-closes in 5s · Press any key to dismiss
        </p>
      </div>
    </div>
  );
}
