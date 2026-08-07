// src/components/overlay/OverlayToolbar.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useOverlayStore } from "@/store/overlayStore";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";

import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import { isCapturePrimaryForInterviewType } from "@/lib/constants/interviewTypes";
import { SERVER_AI_CREDIT_COSTS } from "@/lib/billing/creditsManager";
import { isCaptureBlockedByNetwork } from "@/lib/overlay/captureGating";
import { cn } from "@/lib/utils";

import { PANIC_RESPONSE } from "@/types/session.types";
import type { LucideIcon } from "lucide-react";

import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  RefreshCw,
  Eye,
  EyeOff,
  Square,
  AlertCircle,
  Type,
  Minimize2,
  Star,
  FileText,
  Pin,
  Monitor,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  MessageSquare,
  Crop,
  ScrollText,
  BarChart3,
} from "lucide-react";

import { OverlayActivityTimer } from "./OverlayActivityTimer";
import { OverlaySettings } from "./OverlaySettings";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import {
  MODEL_OPTIONS,
  hasProModelAccess,
  isModelAvailableForPlan,
} from "@/lib/ai/modelOptions";

const HINT_STYLE_LABELS: Record<string, string> = {
  full_answer: "Full",
  short_hints: "Hints",
  keywords_only: "Keys",
};

const HINT_STYLE_ARIA_LABELS: Record<string, string> = {
  full_answer: "Full answer hint style",
  short_hints: "Short hints style",
  keywords_only: "Keywords only hint style",
};

const HOTKEY_REFERENCE = [
  { keys: ["ctrl", "shift", "h"], label: "Minimize / restore overlay" },
  { keys: ["ctrl", "shift", "s"], label: "Discrete UI (opacity)" },
  { keys: ["ctrl", "shift", "y"], label: "Cycle hint style" },
  { keys: ["ctrl", "shift", "c"], label: "Screenshot + full answer (2 cr)" },
  { keys: ["ctrl", "shift", "p"], label: "Calm coaching steps" },
  { keys: ["ctrl", "shift", "m"], label: "Mute / unmute" },
  { keys: ["ctrl", "1-4"], label: "Snap to corner" },
  { keys: ["ctrl", "shift", "esc"], label: "Emergency exit" },
  { keys: ["escape"], label: "Clear hint" },
];

interface OverlayToolbarProps {
  onToggleMic?: () => void;
  onToggleSystemAudio?: () => void;
  onGenerate?: () => void;
  onCaptureCoding?: () => void;
  onAdjustRegion?: () => void;
  onEndSession?: () => void;
  onSetupNewSession?: () => void;
  interviewType?: string;
  /** Slim toolbar for mobile expanded overlay — secondary tools stay in More menu */
  compactMobile?: boolean;
}

export function OverlayToolbar({
  onToggleMic,
  onToggleSystemAudio,
  onGenerate,
  onCaptureCoding,
  onAdjustRegion,
  onEndSession,
  onSetupNewSession,
  interviewType = "behavioral",
  compactMobile = false,
}: OverlayToolbarProps) {
  const isMuted = useAudioStore((s) => s.is_muted);
  const isCapturing = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystemAudio = useAudioStore((s) => !!s.streams?.system_stream);

  const isStealth = useOverlayStore((s) => s.is_stealth_mode);
  const autoGenerate = useOverlayStore((s) => s.auto_generate);
  const hintState = useOverlayStore((s) => s.hint_state);
  const hintStyle = useOverlayStore((s) => s.hint_style);
  const activeModel = useOverlayStore((s) => s.active_model);
  const planId = useAuthStore((s) => s.planId);
  const canUseProModels = hasProModelAccess(planId);

  const isMinimal = useOverlayStore((s) => s.is_minimal_mode);
  const simpleLanguage = useOverlayStore((s) => s.simple_language);
  const isScreenshotLoading = useOverlayStore((s) => s.is_screenshot_loading);
  const hasRecropSource = useOverlayStore((s) => s.has_recrop_source);
  const networkColor = useOverlayStore((s) => s.network_color);

  const activeTab = useOverlayStore((s) => s.active_tab);
  const pinnedHints = useOverlayStore((s) => s.pinned_hints);
  const resumePoints = useOverlayStore((s) => s.resume_talking_points);

  const isPeekActive = useOverlayStore((s) => s.is_peek_active);
  const isVisible = useOverlayStore((s) => s.is_visible);

  const sessionStatus = useSessionStore((s) => s.status);
  const isSessionActive = sessionStatus === "active";
  const showSessionTools =
    sessionStatus === "active" || sessionStatus === "paused" || sessionStatus === "warming_up";

  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showHotkeyRef, setShowHotkeyRef] = useState(false);
  const [showOverlaySettings, setShowOverlaySettings] = useState(false);
  const [showPinnedMenu, setShowPinnedMenu] = useState(false);
  const [showResumeQuickPeek, setShowResumeQuickPeek] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  const moreMenuRef = useRef<HTMLDivElement>(null);
  const hotkeyRefRef = useRef<HTMLDivElement>(null);
  const overlaySettingsRef = useRef<HTMLDivElement>(null);
  const pinnedMenuRef = useRef<HTMLDivElement>(null);
  const resumeQuickPeekRef = useRef<HTMLDivElement>(null);
  const endConfirmRef = useRef<HTMLDivElement>(null);

  const isGenerating = hintState === "generating" || hintState === "streaming";
  const captureCreditCost = SERVER_AI_CREDIT_COSTS.screenshotAnswer;
  const capturePrimary = isCapturePrimaryForInterviewType(interviewType);
  const captureOffline = networkColor === "red" || isCaptureBlockedByNetwork();

  const runCapture = () => {
    if (captureOffline) {
      toast.error("You're offline — screen capture is paused until your connection returns.");
      return;
    }
    if (!onCaptureCoding) {
      toast.error("Start a Practice Coach session before capturing the screen.");
      return;
    }
    void onCaptureCoding();
  };

  const runAdjustRegion = () => {
    if (captureOffline) {
      toast.error("You're offline — screen capture is paused until your connection returns.");
      return;
    }
    if (!onAdjustRegion) {
      toast.error("Capture the screen first, then adjust the region.");
      return;
    }
    void onAdjustRegion();
  };

  const pillToggleTitle = useMemo(() => {
    if (isPeekActive && !isVisible) return "Restore overlay";
    return isMinimal ? "Expand panel" : "Minimize to pill";
  }, [isPeekActive, isVisible, isMinimal]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (moreMenuRef.current && !moreMenuRef.current.contains(t)) setShowMoreMenu(false);
      if (hotkeyRefRef.current && !hotkeyRefRef.current.contains(t)) setShowHotkeyRef(false);
      if (overlaySettingsRef.current && !overlaySettingsRef.current.contains(t)) {
        setShowOverlaySettings(false);
      }
      if (pinnedMenuRef.current && !pinnedMenuRef.current.contains(t)) setShowPinnedMenu(false);
      if (resumeQuickPeekRef.current && !resumeQuickPeekRef.current.contains(t)) {
        setShowResumeQuickPeek(false);
      }
      if (endConfirmRef.current && !endConfirmRef.current.contains(t)) {
        setEndConfirmOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Open settings when TabBar "More tools → Overlay settings" fires
  useEffect(() => {
    function openSettings() {
      setShowOverlaySettings(true);
      setShowHotkeyRef(false);
      setShowMoreMenu(false);
    }
    window.addEventListener("clarify:open-overlay-settings", openSettings);
    return () => window.removeEventListener("clarify:open-overlay-settings", openSettings);
  }, []);

  const handlePillToggle = () => {
    const store = useOverlayStore.getState();

    if (isPeekActive && !isVisible && typeof store.toggleMinimize === "function") {
      store.toggleMinimize();
      return;
    }

    store.setMinimalMode(!isMinimal);
  };

  return (
    <div
      className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/[0.07] bg-[#0c0c1a]/50 shrink-0"
      role="toolbar"
      aria-label="Overlay controls"
    >
      <MicButton isMuted={isMuted} isCapturing={isCapturing} onClick={onToggleMic} />

      <div className="flex items-center gap-1.5 flex-1 justify-center">
        <PrimaryButton
          icon={Sparkles}
          label={compactMobile ? "Hint" : "AI Help"}
          isActive={isGenerating}
          onClick={onGenerate}
          disabled={isGenerating || !onGenerate}
          className={
            isGenerating
              ? "bg-gradient-to-r from-indigo-600/40 to-primary/30 border-indigo-500/40 text-indigo-200"
              : "bg-gradient-to-r from-indigo-600/25 to-primary/15 border-indigo-500/30 text-indigo-300 hover:from-indigo-600/35 hover:to-primary/25 hover:text-indigo-200"
          }
        />

        {!compactMobile && capturePrimary && (
          <>
            <PrimaryButton
              icon={Monitor}
              label={`Capture · ${captureCreditCost} cr`}
              isActive={isScreenshotLoading}
              onClick={runCapture}
              disabled={isScreenshotLoading || !onCaptureCoding || captureOffline}
              title={
                captureOffline
                  ? "Offline — capture paused"
                  : `Select the question on screen and generate a full answer (${captureCreditCost} credits)`
              }
              className={
                isScreenshotLoading
                  ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                  : captureOffline
                    ? "bg-white/4 border-white/8 text-white/30 cursor-not-allowed"
                    : "bg-white/6 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90"
              }
            />
            {hasRecropSource && onAdjustRegion && (
              <PrimaryButton
                icon={Crop}
                label="Adjust"
                isActive={false}
                onClick={runAdjustRegion}
                disabled={isScreenshotLoading || captureOffline}
                title={`Re-draw the selection box without re-sharing your screen (${captureCreditCost} credits)`}
                className="bg-white/6 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
              />
            )}
          </>
        )}

      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!compactMobile && (
          <div className="shrink-0">
            <OverlayActivityTimer />
          </div>
        )}

        {!compactMobile && (
        <button
          type="button"
          onClick={handlePillToggle}
          title={pillToggleTitle}
          aria-label={pillToggleTitle}
          aria-pressed={isMinimal || (isPeekActive && !isVisible)}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-lg transition-all",
            isPeekActive && !isVisible
              ? "bg-indigo-500/15 text-indigo-300 border border-indigo-500/20"
              : isMinimal
                ? "bg-amber-500/15 text-amber-400 border border-amber-500/20"
                : "text-white/35 hover:text-white/80 hover:bg-white/8"
          )}
        >
          {isPeekActive && !isVisible ? (
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          ) : isMinimal ? (
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
          )}
        </button>
        )}

        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setShowMoreMenu((p) => !p)}
            title="More"
            aria-label="More"
            aria-expanded={showMoreMenu}
            aria-haspopup="menu"
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg transition-all",
              showMoreMenu ? "bg-white/12 text-white" : "text-white/40 hover:text-white/80 hover:bg-white/8"
            )}
          >
            <MoreHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          {showMoreMenu && (
            <div className="absolute top-full right-0 mt-2 w-60 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)] z-50 py-2 overflow-hidden animate-fade-in">
              <p className="px-3 pb-1 text-[10px] text-white/25 uppercase tracking-widest font-semibold">
                Tools
              </p>
              {compactMobile && (
                <MenuRow
                  icon={Minimize2}
                  label="Collapse to hints"
                  active={false}
                  onClick={() => {
                    useOverlayStore.getState().setMinimalMode(true);
                    useOverlayStore.getState().setActiveTab("answer");
                    setShowMoreMenu(false);
                  }}
                />
              )}
              <MenuRow
                icon={MessageSquare}
                label="Chat"
                active={activeTab === "chat"}
                onClick={() => {
                  useOverlayStore.getState().setActiveTab("chat");
                  setShowMoreMenu(false);
                }}
              />
              <MenuRow
                icon={ScrollText}
                label="Transcript"
                active={activeTab === "transcript"}
                onClick={() => {
                  useOverlayStore.getState().setActiveTab("transcript");
                  setShowMoreMenu(false);
                }}
              />
              {showSessionTools && (
                <MenuRow
                  icon={FileText}
                  label="Resume context"
                  active={activeTab === "resume"}
                  onClick={() => {
                    useOverlayStore.getState().setActiveTab("resume");
                    setShowMoreMenu(false);
                  }}
                />
              )}
              <MenuRow
                icon={BarChart3}
                label="Status"
                active={activeTab === "audit"}
                onClick={() => {
                  useOverlayStore.getState().setActiveTab("audit");
                  setShowMoreMenu(false);
                }}
              />

              <div className="my-2 border-t border-white/[0.06] mx-2" />

              {onSetupNewSession && (
                <MenuRow
                  icon={Plus}
                  label="Setup new session"
                  active={false}
                  onClick={() => {
                    onSetupNewSession();
                    setShowMoreMenu(false);
                  }}
                />
              )}

              {!capturePrimary && onCaptureCoding && (
                <MenuRow
                  icon={Monitor}
                  label={
                    captureOffline
                      ? "Screen capture (offline)"
                      : `Screen capture (${captureCreditCost} cr)`
                  }
                  active={false}
                  onClick={() => {
                    runCapture();
                    setShowMoreMenu(false);
                  }}
                />
              )}

              {compactMobile && capturePrimary && onCaptureCoding && (
                <MenuRow
                  icon={Monitor}
                  label={
                    captureOffline
                      ? "Screen capture (offline)"
                      : `Screen capture (${captureCreditCost} cr)`
                  }
                  active={false}
                  onClick={() => {
                    runCapture();
                    setShowMoreMenu(false);
                  }}
                />
              )}

              {compactMobile && hasRecropSource && onAdjustRegion && (
                <MenuRow
                  icon={Crop}
                  label={`Adjust region (${captureCreditCost} cr)`}
                  active={false}
                  onClick={() => {
                    runAdjustRegion();
                    setShowMoreMenu(false);
                  }}
                />
              )}

              {!capturePrimary && hasRecropSource && onAdjustRegion && (
                <MenuRow
                  icon={Crop}
                  label={`Adjust region (${captureCreditCost} cr)`}
                  active={false}
                  onClick={() => {
                    runAdjustRegion();
                    setShowMoreMenu(false);
                  }}
                />
              )}

              {onToggleSystemAudio && (
                <MenuRow
                  icon={hasSystemAudio ? Volume2 : VolumeX}
                  label={hasSystemAudio ? "System audio ON" : "System audio OFF"}
                  active={hasSystemAudio}
                  onClick={async () => {
                    try {
                      await onToggleSystemAudio();
                    } catch (err) {
                      const msg = err instanceof Error ? err.message : "System audio toggle failed";
                      if (/permission|denied|NotAllowed/i.test(msg)) {
                        toast.error(
                          "System audio requires screen-share permission. Please allow it and pick a tab with audio."
                        );
                      } else {
                        toast.error(msg);
                      }
                    }
                  }}
                />
              )}

              <MenuRow
                icon={isStealth ? EyeOff : Eye}
                label={isStealth ? "Exit discrete UI" : "Discrete UI (opacity)"}
                active={isStealth}
                activeColor="text-primary"
                onClick={() => {
                  toggleAppStealthMode();
                  setShowMoreMenu(false);
                }}
              />

              <MenuRow
                icon={RefreshCw}
                label={autoGenerate ? "Auto-generate ON" : "Auto-generate OFF"}
                active={autoGenerate}
                activeColor="text-emerald-400"
                onClick={() => useOverlayStore.getState().setAutoGenerate(!autoGenerate)}
              />

              <MenuRow
                icon={Type}
                label={simpleLanguage ? "Simple language ON" : "Simple language"}
                active={simpleLanguage}
                activeColor="text-sky-400"
                onClick={() => useOverlayStore.getState().setSimpleLanguage(!simpleLanguage)}
              />

              <div className="my-2 border-t border-white/[0.06] mx-2" />

              <div className="px-3 py-2">
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2 font-semibold">
                  Hint Style
                </p>
                <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
                  {(["full_answer", "short_hints", "keywords_only"] as const).map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => useOverlayStore.getState().setHintStyle(style)}
                      aria-label={HINT_STYLE_ARIA_LABELS[style]}
                      aria-pressed={hintStyle === style}
                      className={cn(
                        "flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all",
                        hintStyle === style
                          ? "bg-indigo-600/40 text-indigo-200 shadow-sm"
                          : "text-white/35 hover:text-white/60"
                      )}
                    >
                      {HINT_STYLE_LABELS[style]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="my-2 border-t border-white/[0.06] mx-2" />

              <div className="px-3 py-1.5">
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2 font-semibold">
                  AI Model
                </p>
                <div className="space-y-0.5">
                  {MODEL_OPTIONS.map((m) => {
                    const locked = !isModelAvailableForPlan(m.value, planId);
                    return (
                      <button
                        key={m.value}
                        type="button"
                        disabled={locked}
                        onClick={() => {
                          if (locked) {
                            useUIStore.getState().openUpgradeModal("pro");
                            toast.message("Upgrade to Pro to use GPT-4o and Claude.");
                            return;
                          }
                          useOverlayStore.getState().setActiveModel(m.value);
                          setShowMoreMenu(false);
                        }}
                        aria-label={
                          locked
                            ? `${m.label} AI model (Pro)`
                            : `Select ${m.label} AI model`
                        }
                        aria-pressed={!locked && activeModel === m.value}
                        className={cn(
                          "w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] transition-all flex items-center justify-between",
                          locked && "opacity-40 cursor-not-allowed",
                          !locked && activeModel === m.value
                            ? "text-indigo-300 bg-indigo-500/15 font-semibold"
                            : !locked && "text-white/45 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <span>{m.label}</span>
                        <div className="flex items-center gap-1.5">
                          {locked ? (
                            <span className="text-[10px] text-amber-300/70">Pro</span>
                          ) : (
                            !canUseProModels && m.badge === "Recommended" && (
                              <span className="text-[10px] text-white/20">{m.badge}</span>
                            )
                          )}
                          {!locked && activeModel === m.value && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="my-2 border-t border-white/[0.06] mx-2" />

              <MenuRow
                icon={FileText}
                label={resumePoints ? "Resume snapshot" : "No resume loaded"}
                active={!!resumePoints}
                activeColor="text-brand-300"
                onClick={() => {
                  setShowResumeQuickPeek((p) => !p);
                  setShowMoreMenu(false);
                }}
              />

              <MenuRow
                icon={Star}
                label={pinnedHints.length > 0 ? `Pinned hints (${pinnedHints.length})` : "No pinned hints"}
                active={pinnedHints.length > 0}
                activeColor="text-amber-300"
                onClick={() => {
                  setShowPinnedMenu((p) => !p);
                  setShowMoreMenu(false);
                }}
              />

              <MenuRow
                icon={Settings2}
                label="Overlay settings"
                active={showOverlaySettings}
                onClick={() => {
                  setShowOverlaySettings((p) => !p);
                  setShowHotkeyRef(false);
                  setShowMoreMenu(false);
                }}
              />

              <MenuRow
                icon={Settings2}
                label="Keyboard shortcuts"
                active={showHotkeyRef}
                onClick={() => {
                  setShowHotkeyRef((p) => !p);
                  setShowOverlaySettings(false);
                  setShowMoreMenu(false);
                }}
              />

              <div className="my-2 border-t border-white/[0.06] mx-2" />

              <MenuRow
                icon={AlertCircle}
                label="Calm coaching steps"
                active={false}
                danger
                onClick={() => {
                  useOverlayStore.getState().showPanic(PANIC_RESPONSE);
                  setShowMoreMenu(false);
                }}
              />
            </div>
          )}
        </div>

        <div className="relative shrink-0" ref={endConfirmRef}>
          <button
            type="button"
            onClick={() => setEndConfirmOpen((open) => !open)}
            disabled={!onEndSession || !isSessionActive}
            title={!isSessionActive ? "Session not active" : "End session"}
            aria-label={!isSessionActive ? "Session not active" : "End session"}
            aria-expanded={endConfirmOpen}
            className={cn(
              "flex items-center gap-1 px-2 py-1 h-7 border text-[11px] font-bold rounded-lg transition-all shrink-0",
              !onEndSession || !isSessionActive
                ? "bg-white/5 border-white/10 text-white/20 cursor-not-allowed"
                : endConfirmOpen
                  ? "bg-red-600/25 border-red-500/35 text-red-300"
                  : "bg-red-600/15 hover:bg-red-600/30 border-red-500/20 hover:border-red-500/35 text-red-400 hover:text-red-300"
            )}
          >
            <Square className="w-2.5 h-2.5 fill-current" aria-hidden="true" />
            <span>End</span>
          </button>

          {endConfirmOpen && onEndSession && isSessionActive && (
            <div className="absolute top-full right-0 mt-1.5 w-52 rounded-xl border border-red-500/25 bg-[#0f0f1e] shadow-2xl z-[60] p-3 space-y-2.5 animate-fade-in">
              <p className="text-[11px] text-white/70 leading-snug">
                End this session? Progress will be saved.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEndConfirmOpen(false)}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] font-semibold text-white/70 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEndConfirmOpen(false);
                    onEndSession();
                  }}
                  className="flex-1 rounded-lg border border-red-500/30 bg-red-600/20 px-2 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-600/30"
                >
                  End session
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showResumeQuickPeek && (
        <div
          ref={resumeQuickPeekRef}
          className="absolute top-12 right-2 w-64 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-3.5 space-y-2.5 animate-fade-in"
        >
          <p className="text-[11px] font-bold text-brand-300/60 uppercase tracking-widest">
            Resume Snapshot
          </p>
          {!resumePoints ? (
            <p className="text-[12px] text-white/30 italic">No resume loaded for this session.</p>
          ) : (
            <>
              <p className="text-[12px] text-white/75 leading-snug">
                {resumePoints.intro.length > 120 ? resumePoints.intro.slice(0, 119) + "…" : resumePoints.intro}
              </p>

              {resumePoints.skills_summary && (
                <div className="flex flex-wrap gap-1">
                  {resumePoints.skills_summary.split(", ").slice(0, 4).map((skill, i) => (
                    <span
                      key={i}
                      className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-300"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              {resumePoints.experience_points.slice(0, 2).map((pt, i) => (
                <div key={i} className="flex gap-2 text-[12px] text-white/55">
                  <span className="shrink-0 text-brand-400 mt-0.5">•</span>
                  <span>{pt}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {showPinnedMenu && (
        <div
          ref={pinnedMenuRef}
          className="absolute top-12 right-2 w-64 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">
              Pinned Hints
            </p>
            {pinnedHints.length > 0 && (
              <button
                type="button"
                onClick={() => useOverlayStore.getState().clearPinnedHints()}
                aria-label="Clear all pinned hints"
                className="text-[11px] text-white/25 hover:text-red-400 transition-colors"
              >
                clear all
              </button>
            )}
          </div>

          {pinnedHints.length === 0 ? (
            <div className="px-3 py-5 text-[12px] text-white/25 italic text-center">
              Pin hints using the Pin button in the answer panel
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto py-1">
              {pinnedHints
                .slice(-6)
                .reverse()
                .map((pin) => (
                  <div
                    key={pin.id}
                    className="px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/[0.04] last:border-0"
                  >
                    <p className="text-[10px] text-white/25 truncate mb-1">
                      {pin.question || "No question"}
                    </p>
                    <p className="text-[12px] text-white/65 line-clamp-2 leading-snug">
                      {pin.hint}
                    </p>

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          useOverlayStore.getState().setHintState("ready");
                          useOverlayStore.setState({
                            current_hint: pin.hint,
                            current_question: pin.question,
                          });
                          useOverlayStore.getState().setActiveTab("answer");
                          setShowPinnedMenu(false);
                        }}
                        aria-label={`Jump to pinned hint: ${pin.question || "No question"}`}
                        className="text-[11px] text-brand-300/60 hover:text-brand-300 transition-colors font-medium"
                      >
                        Jump to →
                      </button>
                      <button
                        type="button"
                        onClick={() => useOverlayStore.getState().togglePinHint(pin.hint, pin.question)}
                        title="Unpin"
                        aria-label="Unpin hint"
                        className="text-[11px] text-white/20 hover:text-red-400 transition-colors"
                      >
                        <Pin className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {showOverlaySettings && (
        <div
          ref={overlaySettingsRef}
          className="absolute top-12 right-2 z-50 animate-fade-in"
        >
          <OverlaySettings
            isOpen
            onClose={() => setShowOverlaySettings(false)}
          />
        </div>
      )}

      {showHotkeyRef && (
        <div
          ref={hotkeyRefRef}
          className="absolute top-12 right-2 w-56 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-3.5 animate-fade-in"
        >
          <p className="text-[11px] font-bold text-white/35 uppercase tracking-widest mb-3">
            Shortcuts
          </p>
          <div className="space-y-2">
            {HOTKEY_REFERENCE.map((hk) => (
              <div key={hk.label} className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-white/45">{hk.label}</span>
                <kbd className="px-1.5 py-0.5 bg-white/8 border border-white/10 rounded-md text-[10px] text-white/55 font-mono shrink-0">
                  {formatHotkeyLabel(hk.keys)}
                </kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MicButton({
  isMuted,
  isCapturing,
  onClick,
}: {
  isMuted: boolean;
  isCapturing: boolean;
  onClick?: () => void;
}) {
  const isActive = isCapturing && !isMuted;
  return (
    <button
      type="button"
      onClick={onClick}
      title={isMuted ? "Unmute mic" : "Mute mic"}
      aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
      aria-pressed={!isMuted}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-xl border transition-all shrink-0 relative",
        isActive
          ? "bg-red-500/15 border-red-500/25 text-red-400"
          : isMuted
            ? "bg-white/5 border-white/10 text-white/35"
            : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
      )}
    >
      {isMuted ? (
        <MicOff className="w-3.5 h-3.5" aria-hidden="true" />
      ) : (
        <Mic className="w-3.5 h-3.5" aria-hidden="true" />
      )}
      {isActive && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 border border-[#0a0a14] animate-pulse" />
      )}
    </button>
  );
}

function PrimaryButton({
  icon: Icon,
  label,
  isActive,
  onClick,
  disabled,
  className,
  title,
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={isActive}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold border transition-all shrink-0 h-8",
        className,
        disabled && "opacity-60 cursor-not-allowed",
        isActive && "shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function MenuRow({
  icon: Icon,
  label,
  active,
  activeColor = "text-brand-300",
  danger,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  activeColor?: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={danger ? undefined : active}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-all",
        danger
          ? "text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
          : active
            ? cn(activeColor, "bg-white/[0.04] font-semibold hover:bg-white/[0.07]")
            : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]"
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-left">{label}</span>
      {active && !danger && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
    </button>
  );
}
