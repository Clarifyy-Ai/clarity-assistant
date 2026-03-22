import { useState } from 'react';
import { useOverlayStore } from '@/store/overlayStore';
import { setAppStealthMode } from '@/lib/stealth/stealthActions';
import { Settings, X, Eye, EyeOff, Shield, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * OverlaySettings Component
 *
 * Settings panel for overlay customization:
 * - Visibility and opacity
 * - Stealth mode toggle
 * - Proctor safety enforcement
 * - Position presets
 * - Hint style preferences
 * - Hotkey configuration
 * - Safety warnings
 */

interface OverlaySettingsProps {
  isOpen?: boolean;
  onClose?: () => void;
  className?: string;
}

interface SettingItem {
  id: string;
  label: string;
  description: string;
  type: 'toggle' | 'select' | 'slider' | 'text';
  value: any;
  onChange: (value: any) => void;
  options?: Array<{ value: any; label: string }>;
  min?: number;
  max?: number;
  step?: number;
}

export function OverlaySettings({
  isOpen = false,
  onClose,
  className,
}: OverlaySettingsProps) {
  const is_stealth_mode = useOverlayStore((s) => s.is_stealth_mode);
  const is_proctor_safe = useOverlayStore((s) => s.is_proctor_safe);
  const hint_style      = useOverlayStore((s) => s.hint_style);

  const stealth_opacity = useOverlayStore((s) => s.stealth_opacity);
  const is_minimal_mode = useOverlayStore((s) => s.is_minimal_mode);

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
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));

    // Apply settings immediately via getState() — avoids re-render loop
    const os = useOverlayStore.getState();
    switch (key) {
      case 'stealthMode':
        setAppStealthMode(value);
        break;
      case 'proctorSafe':
        os.setProctorSafe?.(value);
        break;
      case 'hintStyle':
        os.setHintStyle?.(value);
        break;
      case 'opacity':
        os.setStealthOpacity(value);
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn('overlay-settings max-w-sm', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 p-4">
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-white">Overlay Settings</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Warning Banner */}
      {showWarnings && (
        <div className="p-3 bg-warning/10 border-b border-warning/20 flex gap-2">
          <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-warning">
            <p className="font-semibold mb-1">Safety Reminder</p>
            <p>
              Do not enable unsafe settings during actual interviews. Use stealth
              & proctor-safe modes.
            </p>
          </div>
          <button
            onClick={() => setShowWarnings(false)}
            className="text-warning/50 hover:text-warning ml-auto"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Settings Content */}
      <div className="p-4 space-y-4 max-h-96 overflow-y-auto">
        {/* Stealth Mode */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Stealth Mode
            </label>
            <div className="flex items-center gap-2">
              {settings.stealthMode ? (
                <EyeOff className="h-4 w-4 text-brand-400" />
              ) : (
                <Eye className="h-4 w-4 text-gray-500" />
              )}
              <input
                type="checkbox"
                checked={settings.stealthMode}
                onChange={(e) =>
                  handleSettingChange('stealthMode', e.target.checked)
                }
                className="w-4 h-4 rounded"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Hide cursor and pointer events to avoid detection
          </p>
        </div>

        {/* Minimal Mode */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Minimal Mode
            </label>
            <input
              type="checkbox"
              checked={is_minimal_mode}
              onChange={(e) =>
                useOverlayStore.getState().setMinimalMode(e.target.checked)
              }
              className="w-4 h-4 rounded"
            />
          </div>
          <p className="text-xs text-gray-500">
            Hides toolbar, tabs, chat, and stats for a compact view
          </p>
        </div>

        {/* Proctor Safe */}
        <div className="space-y-2 p-3 bg-white/[0.02] rounded border border-white/[0.05]">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Proctor Safe Position
            </label>
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-green-400" />
              <input
                type="checkbox"
                checked={settings.proctorSafe}
                onChange={(e) =>
                  handleSettingChange('proctorSafe', e.target.checked)
                }
                className="w-4 h-4 rounded"
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Enforce safe position away from detection zones
          </p>
        </div>

        {/* Hint Style */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-300">
            Hint Style
          </label>
          <select
            value={settings.hintStyle}
            onChange={(e) => handleSettingChange('hintStyle', e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded text-xs text-white"
          >
            <option value="hints">Hints Only</option>
            <option value="full_answer">Full Answer</option>
            <option value="outline">Outline</option>
            <option value="keywords">Keywords</option>
          </select>
        </div>

        {/* Opacity */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-300">
              Opacity
            </label>
            <span className="text-xs text-gray-500">{settings.opacity}%</span>
          </div>
          <input
            type="range"
            min="20"
            max="100"
            step="10"
            value={settings.opacity}
            onChange={(e) =>
              handleSettingChange('opacity', parseInt(e.target.value))
            }
            className="w-full"
          />
        </div>

        {/* Auto Hide */}
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded border border-white/[0.05]">
          <div>
            <label className="text-sm font-medium text-gray-300">
              Auto-Hide on Tab Blur
            </label>
            <p className="text-xs text-gray-500">
              Hide when switching tabs
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.autoHide}
            onChange={(e) => handleSettingChange('autoHide', e.target.checked)}
            className="w-4 h-4 rounded"
          />
        </div>

        {/* Screen Capture Detection */}
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded border border-white/[0.05]">
          <div>
            <label className="text-sm font-medium text-gray-300">
              Screen Capture Detection
            </label>
            <p className="text-xs text-gray-500">
              Detect when screen is being recorded
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.screenCaptureDetection}
            onChange={(e) =>
              handleSettingChange('screenCaptureDetection', e.target.checked)
            }
            className="w-4 h-4 rounded"
          />
        </div>

        {/* Window Visibility Tracking */}
        <div className="flex items-center justify-between p-3 bg-white/[0.02] rounded border border-white/[0.05]">
          <div>
            <label className="text-sm font-medium text-gray-300">
              Track Window Visibility
            </label>
            <p className="text-xs text-gray-500">
              Monitor for unfocused window/tab
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.windowVisibilityTracking}
            onChange={(e) =>
              handleSettingChange('windowVisibilityTracking', e.target.checked)
            }
            className="w-4 h-4 rounded"
          />
        </div>

        {/* Hotkeys */}
        <div className="space-y-2 p-3 bg-white/[0.02] rounded border border-white/[0.05]">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium text-gray-300">
              Hotkeys
            </label>
            <input
              type="checkbox"
              checked={settings.hotkeysEnabled}
              onChange={(e) =>
                handleSettingChange('hotkeysEnabled', e.target.checked)
              }
              className="w-4 h-4 rounded"
            />
          </div>
          <div className="space-y-1 text-xs text-gray-500 font-mono">
            <p>Ctrl+Shift+H - Toggle Overlay</p>
            <p>Ctrl+Shift+S - Stealth Mode</p>
            <p>Ctrl+Shift+P - Panic Button</p>
            <p>Ctrl+Shift+Y - Cycle Hint Style</p>
            <p>Escape - Clear/Hide</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 p-4 space-y-2">
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium rounded transition-colors"
        >
          Save & Close
        </button>
        <button
          onClick={() => {
            // Reset to defaults
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
          className="w-full px-4 py-2 bg-white/[0.05] hover:bg-white/[0.1] text-gray-300 text-sm font-medium rounded transition-colors"
        >
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}

export default OverlaySettings;
