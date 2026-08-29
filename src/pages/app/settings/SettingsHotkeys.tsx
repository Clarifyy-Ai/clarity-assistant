// Sprint C: Hotkey customization UI
import { useEffect, useState } from "react";
import { DEFAULT_HOTKEYS, type HotkeyId, isMac } from "@/lib/constants/hotkeys";
import { RotateCcw, Check, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import { useIsMobile } from "@/hooks/use-mobile";

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

function getEffectiveCombo(id: HotkeyId, overrides: Overrides): string {
  const def = DEFAULT_HOTKEYS[id];
  return overrides[id] ?? (isMac() && def.mac ? def.mac : def.keys);
}

function findConflicts(overrides: Overrides): Map<string, HotkeyId[]> {
  const byCombo = new Map<string, HotkeyId[]>();
  for (const id of Object.keys(DEFAULT_HOTKEYS) as HotkeyId[]) {
    const combo = getEffectiveCombo(id, overrides).toLowerCase();
    const list = byCombo.get(combo) ?? [];
    list.push(id);
    byCombo.set(combo, list);
  }
  const conflicts = new Map<string, HotkeyId[]>();
  for (const [combo, ids] of byCombo) {
    if (ids.length > 1) conflicts.set(combo, ids);
  }
  return conflicts;
}

/** Combos the browser often intercepts before the app can handle them. */
const BROWSER_RESERVED = new Set([
  "ctrl+w",
  "ctrl+shift+w",
  "ctrl+t",
  "ctrl+n",
  "ctrl+shift+n",
  "ctrl+tab",
  "ctrl+shift+tab",
  "alt+f4",
  "⌘+w",
  "⌘+shift+w",
  "⌘+t",
  "⌘+n",
  "⌘+shift+n",
]);

function isBrowserReservedCombo(combo: string): boolean {
  return BROWSER_RESERVED.has(combo.trim().toLowerCase());
}

function isAllowedHotkeyKey(key: string): boolean {
  if (!key || key.length === 0) return false;
  if (["Tab", "CapsLock", "Escape", "Enter", "Backspace", "Delete", "Insert", "Home", "End",
    "PageUp", "PageDown", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ContextMenu",
    "PrintScreen", "Pause", "ScrollLock", "NumLock", "Space", "Spacebar"].includes(key)) {
    return false;
  }
  if (/^F\d{1,2}$/.test(key)) return false;
  return key.length === 1 || /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':",./<>?\\|`~]$/.test(key);
}

function captureCombo(e: KeyboardEvent): string | null {
  const rawKey = e.key;
  if (["Control", "Shift", "Alt", "Meta", "Dead"].includes(rawKey)) return null;
  if (!isAllowedHotkeyKey(rawKey)) return null;

  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.metaKey) parts.push(isMac() ? "⌘" : "Meta");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  const key = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  parts.push(key);

  const combo = parts.join("+");
  return combo.trim() && combo.length <= 32 ? combo : null;
}

export default function SettingsHotkeys() {
  const isMobile = useIsMobile();
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
      if (isBrowserReservedCombo(combo)) {
        toast.warning(
          `${combo} is reserved by the browser (e.g. closes a tab/window). Choose a different shortcut.`,
        );
        setRecordingId(null);
        return;
      }
      const next = { ...overrides, [recordingId]: combo };
      const conflict = (Object.keys(DEFAULT_HOTKEYS) as HotkeyId[]).find(
        (id) => id !== recordingId && getEffectiveCombo(id, next) === combo,
      );
      if (conflict) {
        toast.warning(
          `Conflict: ${combo} is already assigned to "${DEFAULT_HOTKEYS[conflict].description}"`,
        );
      }
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
  const conflicts = findConflicts(overrides);
  const conflictingIds = new Set(
    [...conflicts.values()].flatMap((ids) => ids),
  );
  const grouped = entries.reduce<Record<string, [HotkeyId, any][]>>((acc, e) => {
    const cat = e[1].category ?? "general";
    (acc[cat] ??= []).push(e);
    return acc;
  }, {});

  return (
    <SettingsPageShell
      title="Keyboard shortcuts"
      description="Click a binding to record a new combination. Press Esc to cancel."
      className="max-w-3xl"
    >
      {isMobile && (
        <div
          role="note"
          className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-4 text-sm space-y-2"
        >
          <p className="font-semibold text-foreground">Desktop overlay required</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Live overlay, global hotkeys (Ctrl+Shift+H / Ctrl+Shift+P), and system-audio capture
            need a desktop browser or the Clarify desktop app. On mobile you can still complete
            setup and practice with the microphone, but overlay shortcuts are unavailable.
          </p>
        </div>
      )}
      {!isMobile && (
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <p className="font-medium">When shortcuts fire</p>
          <p className="text-muted-foreground text-xs mt-1 leading-relaxed">
            Overlay shortcuts run during an active Practice Coach or Mock Interview.
            In Chrome, Ctrl+Shift+H opens History and Ctrl+Shift+J opens DevTools —
            remap those here or use the Clarify desktop app for global hotkeys.
          </p>
        </div>
      )}
      <div className="flex justify-end -mt-2">
        <button
          onClick={resetAll}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-secondary flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset all
        </button>
      </div>

      {conflicts.size > 0 && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200/90">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <p>
            Duplicate hotkey bindings detected. Conflicting shortcuts may not work reliably —
            assign unique combinations for each action.
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">
            {cat}
          </h2>
          <ul className="space-y-2">
            {items.map(([id, def]) => {
              const current = getEffectiveCombo(id, overrides);
              const isCustom = !!overrides[id];
              const isRecording = recordingId === id;
              const hasConflict = conflictingIds.has(id);
              return (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{def.description}</p>
                    {isCustom && (
                      <p className="text-[10px] text-primary">Custom</p>
                    )}
                    {hasConflict && (
                      <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Duplicate binding
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setRecordingId(isRecording ? null : id)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-md border font-mono min-w-[110px] text-center",
                        isRecording
                          ? "border-primary bg-primary/10 text-primary/80 animate-pulse"
                          : hasConflict
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
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
    </SettingsPageShell>
  );
}
