// Sprint C: Hotkey customization UI
import { useEffect, useState } from "react";
import { DEFAULT_HOTKEYS, type HotkeyId, isMac } from "@/lib/constants/hotkeys";
import { Keyboard, RotateCcw, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "clarify_custom_hotkeys";

type Overrides = Partial<Record<HotkeyId, string>>;

function loadOverrides(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveOverrides(o: Overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  window.dispatchEvent(new CustomEvent("clarify:hotkeys-changed", { detail: o }));
}

function captureCombo(e: KeyboardEvent): string | null {
  if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push(isMac() ? "⌘" : "Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
  return parts.join("+");
}

export default function SettingsHotkeys() {
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());
  const [recordingId, setRecordingId] = useState<HotkeyId | null>(null);

  useEffect(() => {
    if (!recordingId) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingId(null);
        return;
      }
      const combo = captureCombo(e);
      if (!combo) return;
      const next = { ...overrides, [recordingId]: combo };
      setOverrides(next);
      saveOverrides(next);
      setRecordingId(null);
      toast.success(`Bound ${combo}`);
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true } as any);
  }, [recordingId, overrides]);

  const reset = (id: HotkeyId) => {
    const { [id]: _, ...rest } = overrides;
    setOverrides(rest);
    saveOverrides(rest);
    toast.success("Reset to default");
  };

  const resetAll = () => {
    setOverrides({});
    saveOverrides({});
    toast.success("All hotkeys reset");
  };

  const entries = Object.entries(DEFAULT_HOTKEYS) as [HotkeyId, any][];
  const grouped = entries.reduce<Record<string, [HotkeyId, any][]>>((acc, e) => {
    const cat = e[1].category ?? "general";
    (acc[cat] ??= []).push(e);
    return acc;
  }, {});

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Keyboard className="w-5 h-5" /> Keyboard shortcuts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Click a binding to record a new combination. Press Esc to cancel.
          </p>
        </div>
        <button
          onClick={resetAll}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset all
        </button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
            {cat}
          </h2>
          <ul className="space-y-2">
            {items.map(([id, def]) => {
              const current = overrides[id] ?? (isMac() && def.mac ? def.mac : def.keys);
              const isCustom = !!overrides[id];
              const isRecording = recordingId === id;
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{def.description}</p>
                    {isCustom && (
                      <p className="text-[10px] text-violet-400">Custom</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRecordingId(isRecording ? null : id)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-md border font-mono min-w-[110px] text-center",
                        isRecording
                          ? "border-violet-500 bg-violet-500/10 text-violet-300 animate-pulse"
                          : "border-border hover:bg-secondary"
                      )}
                    >
                      {isRecording ? "Press keys…" : current}
                    </button>
                    {isCustom && !isRecording && (
                      <button
                        onClick={() => reset(id)}
                        className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
                        aria-label="Reset to default"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {isRecording && (
                      <button
                        onClick={() => setRecordingId(null)}
                        className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
                        aria-label="Cancel"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
