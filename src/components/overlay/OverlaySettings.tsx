// src/components/overlay/OverlaySettings.tsx
import { useState } from 'react';
import { useOverlayStore } from '@/store/overlayStore';
import { setAppStealthMode } from '@/lib/stealth/stealthActions';
import { Settings, X, Eye, EyeOff, Shield, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OverlaySettingsProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

export function OverlaySettings({
  isOpen = false,
  onClose,
  className,
}: OverlaySettingsProps) {
  const is_stealth_mode  = useOverlayStore((s) => s.is_stealth_mode);
  const is_proctor_safe  = useOverlayStore((s) => s.is_proctor_safe);
  const hint_style       = useOverlayStore((s) => s.hint_style);
  const simple_language  = useOverlayStore((s) => s.simple_language);
  const auto_generate    = useOverlayStore((s) => s.auto_generate);
  const stealth_opacity  = useOverlayStore((s) => s.stealth_opacity);
  const is_minimal_mode  = useOverlayStore((s) => s.is_minimal_mode);

  const [settings, setSettings] = useState({
    stealthMode: is_stealth_mode,
    proctorSafe: is_proctor_safe,
    opacity: stealth_opacity,
    hintStyle: hint_style,
    autoHide: true,
    hotkeysEnabled: true,
    screenCaptureDetection: true,
    windowVisibilityTracking: true,
  });

  const [showWarnings, setShowWarnings] = useState(true);

  const handleSettingChange = (key: string, value: any) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    const os = useOverlayStore.getState();
    switch (key) {
      case 'stealthMode':     setAppStealthMode(value); break;
      case 'proctorSafe':     os.setProctorSafe?.(value); break;
      case 'hintStyle':       os.setHintStyle?.(value); break;
      case 'opacity':         os.setStealthOpacity(value); break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      'rounded-2xl overflow-hidden border border-white/[0.1] bg-[#0d0d1e] shadow-2xl max-w-sm',
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center">
            <Settings className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <h2 className="text-[13px] font-bold text-white/80">Overlay Settings</h2>
        </div>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-md text-white/30 hover:text-white/70 hover:bg-white/8 transition-all"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Warning Banner */}
      {showWarnings && (
        <div className="flex gap-2 p-3 bg-amber-500/8 border-b border-amber-500/12">
          <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-[12px] text-amber-400/80 flex-1">
            <p className="font-bold mb-0.5">Safety Reminder</p>
            <p className="text-amber-400/60 leading-snug">
              Do not enable unsafe settings during actual interviews.
            </p>
          </div>
          <button
            onClick={() => setShowWarnings(false)}
            className="text-amber-400/30 hover:text-amber-400 transition-colors shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Content */}
      <div className="p-3 space-y-1.5 max-h-96 overflow-y-auto">

        {/* Simple Language */}
        <SettingRow
          label="Simple Language"
          description="Plain, jargon-free AI responses"
        >
          <Toggle
            checked={simple_language}
            onChange={(v) => useOverlayStore.getState().setSimpleLanguage(v)}
          />
        </SettingRow>

        {/* Auto-Generate */}
        <SettingRow
          label="Auto-Generate"
          description="Automatically generate on question detection"
        >
          <Toggle
            checked={auto_generate}
            onChange={(v) => useOverlayStore.getState().setAutoGenerate(v)}
          />
        </SettingRow>

        {/* Minimal Mode */}
        <SettingRow
          label="Minimal Mode"
          description="Hides toolbar, tabs, chat for compact view"
        >
          <Toggle
            checked={is_minimal_mode}
            onChange={(v) => useOverlayStore.getState().setMinimalMode(v)}
          />
        </SettingRow>

        <div className="my-2 border-t border-white/[0.06]" />

        {/* Stealth Mode */}
        <SettingRow
          label="Stealth Mode"
          description="Hide cursor and pointer events"
          icon={settings.stealthMode ? <EyeOff className="h-3.5 w-3.5 text-violet-400" /> : <Eye className="h-3.5 w-3.5 text-white/30" />}
        >
          <Toggle
            checked={settings.stealthMode}
            onChange={(v) => handleSettingChange('stealthMode', v)}
            color="bg-violet-500"
          />
        </SettingRow>

        {/* Proctor Safe */}
        <SettingRow
          label="Proctor Safe Position"
          description="Enforce safe position away from detection zones"
          icon={<Shield className="h-3.5 w-3.5 text-emerald-400" />}
        >
          <Toggle
            checked={settings.proctorSafe}
            onChange={(v) => handleSettingChange('proctorSafe', v)}
            color="bg-emerald-500"
          />
        </SettingRow>

        <div className="my-2 border-t border-white/[0.06]" />

        {/* Hint Style */}
        <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[12px] font-semibold text-white/60 mb-2">Hint Style</p>
          <div className="flex gap-1 bg-black/20 p-1 rounded-xl">
            {[
              { v: 'hints',       l: 'Hints' },
              { v: 'full_answer', l: 'Full' },
              { v: 'outline',     l: 'Outline' },
              { v: 'keywords',    l: 'Keys' },
            ].map(({ v, l }) => (
              <button
                key={v}
                onClick={() => handleSettingChange('hintStyle', v)}
                className={cn(
                  "flex-1 py-1 rounded-lg text-[11px] font-bold transition-all",
                  settings.hintStyle === v
                    ? "bg-indigo-600/40 text-indigo-200"
                    : "text-white/30 hover:text-white/55"
                )}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Opacity */}
        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-semibold text-white/60">Opacity</p>
            <span className="text-[12px] font-mono text-white/40">{settings.opacity}%</span>
          </div>
          <input
            type="range"
            min="20"
            max="100"
            step="10"
            value={settings.opacity}
            onChange={(e) => handleSettingChange('opacity', parseInt(e.target.value))}
            className="w-full accent-indigo-500 h-1.5 rounded-full bg-white/10 appearance-none cursor-pointer"
          />
        </div>

        <div className="my-2 border-t border-white/[0.06]" />

        <SettingRow label="Auto-Hide on Tab Blur" description="Hide when switching tabs">
          <Toggle
            checked={settings.autoHide}
            onChange={(v) => handleSettingChange('autoHide', v)}
          />
        </SettingRow>

        <SettingRow label="Screen Capture Detection" description="Detect when screen is being recorded">
          <Toggle
            checked={settings.screenCaptureDetection}
            onChange={(v) => handleSettingChange('screenCaptureDetection', v)}
          />
        </SettingRow>

        <SettingRow label="Track Window Visibility" description="Monitor for unfocused window/tab">
          <Toggle
            checked={settings.windowVisibilityTracking}
            onChange={(v) => handleSettingChange('windowVisibilityTracking', v)}
          />
        </SettingRow>

        {/* Hotkeys reference */}
        <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest mb-2">Shortcuts</p>
          <div className="space-y-1 text-[11px] font-mono text-white/25">
            <p>Ctrl+Shift+H — Toggle Overlay</p>
            <p>Ctrl+Shift+S — Stealth Mode</p>
            <p>Ctrl+Shift+P — Panic Button</p>
            <p>Ctrl+Shift+Y — Cycle Hint Style</p>
            <p>Escape — Clear / Hide</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/[0.07] p-3 space-y-2">
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-indigo-600/25 hover:bg-indigo-600/35 border border-indigo-500/25 text-indigo-300 text-[12px] font-bold rounded-xl transition-all"
        >
          Save & Close
        </button>
        <button
          onClick={() => {
            setSettings({
              stealthMode: false,
              proctorSafe: true,
              opacity: 90,
              hintStyle: 'short_hints',
              autoHide: true,
              hotkeysEnabled: true,
              screenCaptureDetection: true,
              windowVisibilityTracking: true,
            });
            useOverlayStore.getState().setStealthOpacity(90);
          }}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.07] text-white/35 hover:text-white/60 text-[12px] font-medium rounded-xl transition-all"
        >
          <RefreshCw className="w-3 h-3" />
          Reset to Defaults
        </button>
      </div>
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
          {description && <p className="text-[11px] text-white/25 mt-0.5 leading-snug">{description}</p>}
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
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-all border",
        checked
          ? `${color} border-white/10 shadow-sm`
          : "bg-white/8 border-white/10"
      )}
    >
      <span className={cn(
        "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
        checked ? "translate-x-[18px]" : "translate-x-0.5"
      )} />
    </button>
  );
}

export default OverlaySettings;
