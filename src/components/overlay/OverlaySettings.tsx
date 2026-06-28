// src/components/overlay/OverlaySettings.tsx
import { useMemo, useState } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { setAppStealthMode } from "@/lib/stealth/stealthActions";
import {
  Settings,
  X,
  Eye,
  EyeOff,
  Shield,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlaySettingsProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

type LocalOnlySettings = {
  autoHide: boolean;
  hotkeysEnabled: boolean;
  screenCaptureDetection: boolean;
  windowVisibilityTracking: boolean;
};

const DEFAULT_LOCAL_SETTINGS: LocalOnlySettings = {
  autoHide: true,
  hotkeysEnabled: true,
  screenCaptureDetection: true,
  windowVisibilityTracking: true,
};

const HINT_STYLE_OPTIONS = [
  { v: "short_hints", l: "Hints" },
  { v: "full_answer", l: "Full" },
  { v: "outline", l: "Outline" },
  { v: "keywords_only", l: "Keys" },
] as const;

export function OverlaySettings({
  isOpen = false,
  onClose,
  className,
}: OverlaySettingsProps) {
  const isStealthMode = useOverlayStore((s) => s.is_stealth_mode);
  const isProctorSafe = useOverlayStore((s) => s.is_proctor_safe);
  const hintStyle = useOverlayStore((s) => s.hint_style);
  const simpleLanguage = useOverlayStore((s) => s.simple_language);
  const autoGenerate = useOverlayStore((s) => s.auto_generate);
  const autoAnswerSilenceSeconds = useOverlayStore((s) => s.auto_answer_silence_seconds);
  const stealthOpacity = useOverlayStore((s) => s.stealth_opacity);
  const fontSize = useOverlayStore((s) => s.font_size);
  const isMinimalMode = useOverlayStore((s) => s.is_minimal_mode);
  const pipOptIn = useOverlayStore((s) => s.pip_opt_in);

  const [localSettings, setLocalSettings] =
    useState<LocalOnlySettings>(DEFAULT_LOCAL_SETTINGS);
  const [showWarnings, setShowWarnings] = useState(true);
  const [pipConsentOpen, setPipConsentOpen] = useState(false);

  const currentSettings = useMemo(
    () => ({
      stealthMode: isStealthMode,
      proctorSafe: isProctorSafe,
      opacity: stealthOpacity,
      fontSize,
      hintStyle,
      simpleLanguage,
      autoGenerate,
      autoAnswerSilenceSeconds,
      minimalMode: isMinimalMode,
      pipOptIn,
      ...localSettings,
    }),
    [
      isStealthMode,
      isProctorSafe,
      stealthOpacity,
      fontSize,
      hintStyle,
      simpleLanguage,
      autoGenerate,
      autoAnswerSilenceSeconds,
      isMinimalMode,
      pipOptIn,
      localSettings,
    ]
  );

  const handleStoreSettingChange = (key: string, value: unknown) => {
    const os = useOverlayStore.getState();

    switch (key) {
      case "stealthMode":
        setAppStealthMode(Boolean(value));
        break;
      case "proctorSafe":
        os.setProctorSafe?.(Boolean(value));
        break;
      case "hintStyle":
        os.setHintStyle?.(value as typeof hintStyle);
        break;
      case "opacity":
        os.setStealthOpacity(Number(value));
        break;
      case "fontSize":
        os.setFontSize(Number(value));
        break;
      case "simpleLanguage":
        os.setSimpleLanguage?.(Boolean(value));
        break;
      case "autoGenerate":
        os.setAutoGenerate?.(Boolean(value));
        break;
      case "autoAnswerSilenceSeconds":
        os.setAutoAnswerSilenceSeconds(Number(value));
        break;
      case "minimalMode":
        os.setMinimalMode?.(Boolean(value));
        break;
    }
  };

  const handleLocalSettingChange = (
    key: keyof LocalOnlySettings,
    value: boolean
  ) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetToDefaults = () => {
    const os = useOverlayStore.getState();

    setAppStealthMode(false);
    os.setProctorSafe?.(false);
    os.setStealthOpacity(90);
    os.setFontSize(13);
    os.setHintStyle?.("short_hints");
    os.setSimpleLanguage?.(false);
    os.setAutoGenerate?.(false);
    os.setAutoAnswerSilenceSeconds(3);
    os.setMinimalMode?.(false);

    setLocalSettings(DEFAULT_LOCAL_SETTINGS);
  };

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "rounded-2xl overflow-hidden border border-white/[0.1] bg-[#0d0d1e] shadow-2xl max-w-sm relative",
        className
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Overlay settings"
    >
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
            <Settings className="h-3.5 w-3.5 text-indigo-400" aria-hidden="true" />
          </div>
          <h2 className="text-[13px] font-bold text-white/80">Overlay Settings</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close overlay settings"
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {showWarnings && (
        <div className="flex gap-2 p-3 bg-amber-500/8 border-b border-amber-500/12">
          <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-[12px] text-amber-400/80 flex-1">
            <p className="font-bold mb-0.5">Safety Reminder</p>
            <p className="text-amber-400/60 leading-snug">
              Use for authorized practice and productivity only. The overlay stays visible on
              screen share and proctoring tools.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowWarnings(false)}
            aria-label="Dismiss safety reminder"
            className="text-amber-400/30 hover:text-amber-400 transition-colors shrink-0"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="p-3 space-y-1.5 max-h-96 overflow-y-auto">
        <SettingRow
          label="Simple Language"
          description="Plain, jargon-free AI responses"
        >
          <Toggle
            checked={currentSettings.simpleLanguage}
            onChange={(v) => handleStoreSettingChange("simpleLanguage", v)}
            ariaLabel="Toggle simple language"
          />
        </SettingRow>

        <SettingRow
          label="Auto-Generate"
          description="Automatically generate on question detection"
        >
          <Toggle
            checked={currentSettings.autoGenerate}
            onChange={(v) => handleStoreSettingChange("autoGenerate", v)}
            ariaLabel="Toggle auto-generate"
          />
        </SettingRow>

        {currentSettings.autoGenerate && (
          <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[12px] font-semibold text-white/60">
                Silence trigger
              </p>
              <span className="text-[12px] font-mono text-white/40">
                {currentSettings.autoAnswerSilenceSeconds}s
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="1"
              value={currentSettings.autoAnswerSilenceSeconds}
              onChange={(e) =>
                handleStoreSettingChange(
                  "autoAnswerSilenceSeconds",
                  parseInt(e.target.value, 10),
                )
              }
              aria-label="Auto-answer silence trigger seconds"
              className="w-full accent-indigo-500 h-1.5 rounded-full bg-white/10 appearance-none cursor-pointer"
            />
            <p className="text-[10px] text-white/25 mt-1.5">
              Wait this long after the interviewer stops speaking before generating
            </p>
          </div>
        )}

        <SettingRow
          label="Minimal Mode"
          description="Compact pill view — toolbar collapses; expand to restore full panel"
        >
          <Toggle
            checked={currentSettings.minimalMode}
            onChange={(v) => handleStoreSettingChange("minimalMode", v)}
            ariaLabel="Toggle minimal mode"
          />
        </SettingRow>

        <SettingRow
          label="Picture-in-Picture"
          description="Float assistant in a separate always-on-top window (Chrome 116+)"
        >
          <Toggle
            checked={pipOptIn}
            onChange={(v) => {
              if (v && !pipOptIn) {
                setPipConsentOpen(true);
                return;
              }
              useOverlayStore.getState().setPipOptIn(false);
            }}
            ariaLabel="Toggle picture-in-picture"
          />
        </SettingRow>

        <div className="my-2 border-t border-white/[0.06]" />

        <SettingRow
          label="Discrete UI"
          description="Lower opacity until hover — still visible on screen share"
          icon={
            currentSettings.stealthMode ? (
              <EyeOff className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
            ) : (
              <Eye className="h-3.5 w-3.5 text-white/30" aria-hidden="true" />
            )
          }
        >
          <Toggle
            checked={currentSettings.stealthMode}
            onChange={(v) => handleStoreSettingChange("stealthMode", v)}
            color="bg-primary"
            ariaLabel="Toggle discrete UI mode"
          />
        </SettingRow>

        <SettingRow
          label="Corner snap layout"
          description="Snap overlay to a screen corner (layout only, not concealment)"
          icon={<Shield className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />}
        >
          <Toggle
            checked={currentSettings.proctorSafe}
            onChange={(v) => handleStoreSettingChange("proctorSafe", v)}
            color="bg-emerald-500"
            ariaLabel="Toggle proctor safe position"
          />
        </SettingRow>

        <div className="my-2 border-t border-white/[0.06]" />

        <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[12px] font-semibold text-white/60 mb-2">Hint Style</p>
          <div className="flex gap-1 bg-black/20 p-1 rounded-xl">
            {HINT_STYLE_OPTIONS.map(({ v, l }) => (
              <button
                key={v}
                type="button"
                onClick={() => handleStoreSettingChange("hintStyle", v)}
                aria-pressed={currentSettings.hintStyle === v}
                className={cn(
                  "flex-1 py-1 rounded-lg text-[11px] font-bold transition-all",
                  currentSettings.hintStyle === v
                    ? "bg-indigo-600/40 text-indigo-200"
                    : "text-white/30 hover:text-white/55"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-white/60">Font Size</p>
            <span className="text-[12px] font-mono text-white/40">
              {currentSettings.fontSize}px
            </span>
          </div>
          <input
            type="range"
            min="11"
            max="20"
            step="1"
            value={currentSettings.fontSize}
            onChange={(e) =>
              handleStoreSettingChange("fontSize", parseInt(e.target.value, 10))
            }
            aria-label="Overlay font size"
            className="w-full accent-indigo-500 h-1.5 rounded-full bg-white/10 appearance-none cursor-pointer"
          />
        </div>

        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-white/60">Opacity</p>
            <span className="text-[12px] font-mono text-white/40">
              {currentSettings.opacity}%
            </span>
          </div>
          <input
            type="range"
            min="20"
            max="100"
            step="10"
            value={currentSettings.opacity}
            onChange={(e) =>
              handleStoreSettingChange("opacity", parseInt(e.target.value, 10))
            }
            aria-label="Overlay opacity"
            className="w-full accent-indigo-500 h-1.5 rounded-full bg-white/10 appearance-none cursor-pointer"
          />
        </div>

        <div className="my-2 border-t border-white/[0.06]" />

        <SettingRow
          label="Auto-Hide on Tab Blur"
          description="Hide when switching tabs"
        >
          <Toggle
            checked={currentSettings.autoHide}
            onChange={(v) => handleLocalSettingChange("autoHide", v)}
            ariaLabel="Toggle auto-hide on tab blur"
          />
        </SettingRow>

        <SettingRow
          label="Screen Capture Detection"
          description="Detect when screen is being recorded"
        >
          <Toggle
            checked={currentSettings.screenCaptureDetection}
            onChange={(v) => handleLocalSettingChange("screenCaptureDetection", v)}
            ariaLabel="Toggle screen capture detection"
          />
        </SettingRow>

        <SettingRow
          label="Track Window Visibility"
          description="Monitor for unfocused window or tab"
        >
          <Toggle
            checked={currentSettings.windowVisibilityTracking}
            onChange={(v) => handleLocalSettingChange("windowVisibilityTracking", v)}
            ariaLabel="Toggle window visibility tracking"
          />
        </SettingRow>

        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-2">
            Shortcuts
          </p>
          <div className="space-y-1 text-[11px] font-mono text-white/25">
            <p>Ctrl+Shift+A — Generate answer</p>
            <p>Ctrl+Shift+H / C — Toggle Overlay</p>
            <p>Ctrl+Shift+S / D — Scroll answer up / down</p>
            <p>Ctrl+Shift+Q — Clear answer</p>
            <p>Ctrl+Shift+T — Discrete UI</p>
            <p>Ctrl+Shift+P — Calm coaching steps</p>
            <p>Ctrl+Shift+Y — Cycle Hint Style</p>
            <p>Escape — Clear / Hide</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/[0.07] p-3 space-y-2">
        <button
          type="button"
          onClick={onClose}
          className="w-full px-4 py-2 bg-indigo-600/25 hover:bg-indigo-600/35 border border-indigo-500/25 text-indigo-300 text-[12px] font-bold rounded-xl transition-all"
        >
          Save & Close
        </button>
        <button
          type="button"
          onClick={resetToDefaults}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-white/35 hover:text-white/60 text-[12px] font-medium rounded-xl transition-all"
        >
          <RefreshCw className="w-3 h-3" aria-hidden="true" />
          Reset to Defaults
        </button>
      </div>

      {pipConsentOpen && (
        <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-black/60 p-3">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0d0d1e] p-4 shadow-2xl space-y-3">
            <p className="text-sm font-semibold text-white">Enable Picture-in-Picture?</p>
            <p className="text-[11px] text-white/60 leading-relaxed">
              PiP opens a separate floating window that stays on top when you minimize the browser.
              It remains visible on screen share and recordings — same as the main overlay.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPipConsentOpen(false)}
                className="flex-1 py-2 text-[12px] font-medium text-white/50 hover:text-white/80 rounded-xl border border-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  useOverlayStore.getState().setPipOptIn(true);
                  setPipConsentOpen(false);
                }}
                className="flex-1 py-2 text-[12px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl"
              >
                Enable PiP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({
  label,
  description,
  icon,
  children,
}: {
  label: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl hover:bg-white/[0.03] transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-white/55 truncate">{label}</p>
          {description && (
            <p className="text-[11px] text-white/25 mt-0.5 leading-snug">
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  color = "bg-indigo-500",
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-all border",
        checked
          ? `${color} border-white/10 shadow-sm`
          : "bg-white/8 border-white/10"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

export default OverlaySettings;
