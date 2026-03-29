// src/components/overlay/OverlayToolbar.tsx
import { useState, useRef, useEffect } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useAudioStore } from "@/store/audioStore";
import { useSessionStore } from "@/store/sessionStore";
import { toggleAppStealthMode } from "@/lib/stealth/stealthActions";
import { PANIC_RESPONSE } from "@/types/session.types";
import { captureAndAnalyseCodingProblem } from "@/lib/audio/screenshotCapture";
import {
  Mic, MicOff, Volume2, VolumeX, Zap, RefreshCw,
  Eye, EyeOff, Square, AlertCircle, Type, ChevronDown,
  Minimize2, Star, FileText, Pin, Camera, Monitor,
  MoreHorizontal, Plus, ChevronUp, Settings2, Sparkles, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import { OverlayActivityTimer } from "./OverlayActivityTimer";
import type { LucideIcon } from "lucide-react";
import type { PreferredAIModel } from "@/types/user.types";

const MODEL_OPTIONS: { id: PreferredAIModel; label: string; note?: string }[] = [
  { id: "gpt-4o",            label: "GPT-4o",      note: "via Gemini" },
  { id: "claude-3-5-sonnet", label: "Claude",       note: "via Gemini" },
  { id: "gemini-1-5-pro",    label: "Gemini Pro" },
  { id: "gemini-flash",      label: "Flash" },
];

const HINT_STYLE_LABELS: Record<string, string> = {
  full_answer:   "Full",
  short_hints:   "Hints",
  keywords_only: "Keys",
};

const HOTKEY_REFERENCE = [
  { keys: ["ctrl", "shift", "h"],   label: "Toggle overlay" },
  { keys: ["ctrl", "shift", "s"],   label: "Stealth mode" },
  { keys: ["ctrl", "shift", "y"],   label: "Cycle hint style" },
  { keys: ["ctrl", "shift", "c"],   label: "Screenshot + analyse" },
  { keys: ["ctrl", "shift", "p"],   label: "Panic button" },
  { keys: ["ctrl", "shift", "m"],   label: "Mute / unmute" },
  { keys: ["ctrl", "1-4"],          label: "Snap to corner" },
  { keys: ["ctrl", "shift", "esc"], label: "Emergency exit" },
  { keys: ["escape"],               label: "Clear hint" },
];

interface OverlayToolbarProps {
  onToggleMic?: () => void;
  onToggleSystemAudio?: () => void;
  onGenerate?: () => void;
  onEndSession?: () => void;
}

export function OverlayToolbar({
  onToggleMic,
  onToggleSystemAudio,
  onGenerate,
  onEndSession,
}: OverlayToolbarProps) {
  const isMuted             = useAudioStore((s) => s.is_muted);
  const isCapturing         = useAudioStore((s) => s.streams?.is_capturing ?? false);
  const hasSystemAudio      = useAudioStore((s) => !!s.streams?.system_stream);
  const isStealth           = useOverlayStore((s) => s.is_stealth_mode);
  const autoGenerate        = useOverlayStore((s) => s.auto_generate);
  const hintState           = useOverlayStore((s) => s.hint_state);
  const hintStyle           = useOverlayStore((s) => s.hint_style);
  const activeModel         = useOverlayStore((s) => s.active_model);
  const isMinimal           = useOverlayStore((s) => s.is_minimal_mode);
  const simpleLanguage      = useOverlayStore((s) => s.simple_language);
  const isScreenshotLoading = useOverlayStore((s) => s.is_screenshot_loading);
  const activeTab           = useOverlayStore((s) => s.active_tab);
  const pinnedHints         = useOverlayStore((s) => s.pinned_hints);
  const resumePoints        = useOverlayStore((s) => s.resume_talking_points);

  const [showMoreMenu,        setShowMoreMenu]        = useState(false);
  const [showModelMenu,       setShowModelMenu]       = useState(false);
  const [showHotkeyRef,       setShowHotkeyRef]       = useState(false);
  const [showPinnedMenu,      setShowPinnedMenu]      = useState(false);
  const [showResumeQuickPeek, setShowResumeQuickPeek] = useState(false);

  const moreMenuRef        = useRef<HTMLDivElement>(null);
  const modelMenuRef       = useRef<HTMLDivElement>(null);
  const hotkeyRefRef       = useRef<HTMLDivElement>(null);
  const pinnedMenuRef      = useRef<HTMLDivElement>(null);
  const resumeQuickPeekRef = useRef<HTMLDivElement>(null);

  const isGenerating = hintState === "generating" || hintState === "streaming";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current        && !moreMenuRef.current.contains(e.target as Node))        setShowMoreMenu(false);
      if (modelMenuRef.current       && !modelMenuRef.current.contains(e.target as Node))       setShowModelMenu(false);
      if (hotkeyRefRef.current       && !hotkeyRefRef.current.contains(e.target as Node))       setShowHotkeyRef(false);
      if (pinnedMenuRef.current      && !pinnedMenuRef.current.contains(e.target as Node))      setShowPinnedMenu(false);
      if (resumeQuickPeekRef.current && !resumeQuickPeekRef.current.contains(e.target as Node)) setShowResumeQuickPeek(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/[0.07] bg-[#0c0c1a]/50 shrink-0">

      {/* ── LEFT: Mic button ─────────────────────────────────────── */}
      <MicButton
        isMuted={isMuted}
        isCapturing={isCapturing}
        onClick={onToggleMic}
      />

      {/* ── CENTER: Primary actions ───────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-1 justify-center">

        {/* AI Help — primary CTA */}
        <PrimaryButton
          icon={Sparkles}
          label="AI Help"
          isActive={isGenerating}
          onClick={onGenerate}
          disabled={isGenerating}
          className={isGenerating
            ? "bg-gradient-to-r from-indigo-600/40 to-violet-600/30 border-indigo-500/40 text-indigo-200"
            : "bg-gradient-to-r from-indigo-600/25 to-violet-600/15 border-indigo-500/30 text-indigo-300 hover:from-indigo-600/35 hover:to-violet-600/25 hover:text-indigo-200"
          }
        />

        {/* Analyze Screen */}
        <PrimaryButton
          icon={Monitor}
          label="Screen"
          isActive={isScreenshotLoading}
          onClick={() => captureAndAnalyseCodingProblem()}
          disabled={isScreenshotLoading}
          className={isScreenshotLoading
            ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
            : "bg-white/6 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90"
          }
        />

        {/* Chat */}
        <PrimaryButton
          icon={MessageSquare}
          label="Chat"
          isActive={activeTab === "chat"}
          onClick={() => useOverlayStore.getState().setActiveTab("chat")}
          className={activeTab === "chat"
            ? "bg-brand-500/20 border-brand-500/30 text-brand-300"
            : "bg-white/6 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/90"
          }
        />
      </div>

      {/* ── RIGHT: Timer + actions ────────────────────────────────── */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Session timer */}
        <div className="shrink-0">
          <OverlayActivityTimer />
        </div>

        {/* ⋯ More menu */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu((p) => !p)}
            title="More options"
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-lg transition-all",
              showMoreMenu
                ? "bg-white/12 text-white"
                : "text-white/40 hover:text-white/80 hover:bg-white/8"
            )}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {showMoreMenu && (
            <div className="absolute top-full right-0 mt-2 w-60 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)] z-50 py-2 overflow-hidden animate-fade-in">

              {/* System Audio */}
              {onToggleSystemAudio && (
                <MenuRow
                  icon={hasSystemAudio ? Volume2 : VolumeX}
                  label={hasSystemAudio ? "System audio ON" : "System audio OFF"}
                  active={hasSystemAudio}
                  onClick={onToggleSystemAudio}
                />
              )}

              <MenuRow
                icon={isStealth ? EyeOff : Eye}
                label={isStealth ? "Exit stealth" : "Enter stealth"}
                active={isStealth}
                activeColor="text-violet-400"
                onClick={() => { toggleAppStealthMode(); setShowMoreMenu(false); }}
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

              {/* Hint Style */}
              <div className="px-3 py-2">
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2 font-semibold">Hint Style</p>
                <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
                  {(["full_answer", "short_hints", "keywords_only"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => useOverlayStore.getState().setHintStyle(style)}
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

              {/* Model picker */}
              <div className="px-3 py-1.5">
                <p className="text-[10px] text-white/25 uppercase tracking-widest mb-2 font-semibold">AI Model</p>
                <div className="space-y-0.5">
                  {MODEL_OPTIONS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { useOverlayStore.getState().setActiveModel(m.id); setShowMoreMenu(false); }}
                      className={cn(
                        "w-full text-left px-2.5 py-1.5 rounded-lg text-[12px] transition-all flex items-center justify-between",
                        activeModel === m.id
                          ? "text-indigo-300 bg-indigo-500/15 font-semibold"
                          : "text-white/45 hover:text-white hover:bg-white/5"
                      )}
                    >
                      <span>{m.label}</span>
                      <div className="flex items-center gap-1.5">
                        {m.note && <span className="text-[10px] text-white/20">({m.note})</span>}
                        {activeModel === m.id && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="my-2 border-t border-white/[0.06] mx-2" />

              <MenuRow
                icon={FileText}
                label={resumePoints ? "Resume snapshot" : "No resume loaded"}
                active={!!resumePoints}
                activeColor="text-brand-300"
                onClick={() => { setShowResumeQuickPeek((p) => !p); setShowMoreMenu(false); }}
              />

              <MenuRow
                icon={Star}
                label={pinnedHints.length > 0 ? `Pinned hints (${pinnedHints.length})` : "No pinned hints"}
                active={pinnedHints.length > 0}
                activeColor="text-amber-300"
                onClick={() => { setShowPinnedMenu((p) => !p); setShowMoreMenu(false); }}
              />

              <MenuRow
                icon={Settings2}
                label="Keyboard shortcuts"
                active={false}
                onClick={() => { setShowHotkeyRef((p) => !p); setShowMoreMenu(false); }}
              />

              <div className="my-2 border-t border-white/[0.06] mx-2" />

              <MenuRow
                icon={AlertCircle}
                label="Panic mode"
                active={false}
                danger
                onClick={() => { useOverlayStore.getState().showPanic(PANIC_RESPONSE); setShowMoreMenu(false); }}
              />
            </div>
          )}
        </div>

        {/* Minimal mode toggle */}
        <button
          onClick={() => useOverlayStore.getState().setMinimalMode(!isMinimal)}
          title={isMinimal ? "Exit minimal mode" : "Minimal mode"}
          className={cn(
            "w-7 h-7 flex items-center justify-center rounded-lg transition-all",
            isMinimal
              ? "text-amber-400 bg-amber-500/15 border border-amber-500/20"
              : "text-white/35 hover:text-white/70 hover:bg-white/8"
          )}
        >
          {isMinimal ? <Plus className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {/* End session */}
        <button
          onClick={onEndSession}
          title="End session"
          className="flex items-center gap-1 px-2 py-1 h-7 bg-red-600/15 hover:bg-red-600/30 border border-red-500/20 hover:border-red-500/35 text-red-400 hover:text-red-300 text-[11px] font-bold rounded-lg transition-all shrink-0"
        >
          <Square className="w-2.5 h-2.5 fill-current" />
          <span>End</span>
        </button>
      </div>

      {/* ── Floating: Resume snapshot ─────────────────────────────── */}
      {showResumeQuickPeek && (
        <div
          ref={resumeQuickPeekRef}
          className="absolute top-12 right-2 w-64 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-3.5 space-y-2.5 animate-fade-in"
        >
          <p className="text-[11px] font-bold text-brand-300/60 uppercase tracking-widest">Resume Snapshot</p>
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
                    <span key={i} className="rounded-lg border border-brand-500/20 bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-300">
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

      {/* ── Floating: Pinned Hints ────────────────────────────────── */}
      {showPinnedMenu && (
        <div
          ref={pinnedMenuRef}
          className="absolute top-12 right-2 w-64 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in"
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
            <p className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Pinned Hints</p>
            {pinnedHints.length > 0 && (
              <button
                onClick={() => useOverlayStore.getState().clearPinnedHints()}
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
              {pinnedHints.slice(-6).reverse().map((pin) => (
                <div key={pin.id} className="px-3 py-2.5 hover:bg-white/5 transition-colors border-b border-white/[0.04] last:border-0">
                  <p className="text-[10px] text-white/25 truncate mb-1">{pin.question || "No question"}</p>
                  <p className="text-[12px] text-white/65 line-clamp-2 leading-snug">{pin.hint}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={() => {
                        useOverlayStore.getState().setHintState("ready");
                        useOverlayStore.setState({ current_hint: pin.hint, current_question: pin.question });
                        useOverlayStore.getState().setActiveTab("answer");
                        setShowPinnedMenu(false);
                      }}
                      className="text-[11px] text-brand-300/60 hover:text-brand-300 transition-colors font-medium"
                    >
                      Jump to →
                    </button>
                    <button
                      onClick={() => useOverlayStore.getState().togglePinHint(pin.hint, pin.question)}
                      className="text-[11px] text-white/20 hover:text-red-400 transition-colors"
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Floating: Keyboard Shortcuts ─────────────────────────── */}
      {showHotkeyRef && (
        <div
          ref={hotkeyRefRef}
          className="absolute top-12 right-2 w-56 bg-[#0f0f1e] border border-white/[0.1] rounded-2xl shadow-2xl z-50 p-3.5 animate-fade-in"
        >
          <p className="text-[11px] font-bold text-white/35 uppercase tracking-widest mb-3">Shortcuts</p>
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

// ── Sub-components ──────────────────────────────────────────────────────────

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
      onClick={onClick}
      title={isMuted ? "Unmute mic" : "Mute mic"}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-xl border transition-all shrink-0 relative",
        isActive
          ? "bg-red-500/15 border-red-500/25 text-red-400"
          : isMuted
          ? "bg-white/5 border-white/10 text-white/35"
          : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80"
      )}
    >
      {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
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
}: {
  icon: LucideIcon;
  label: string;
  isActive: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[12px] font-semibold border transition-all shrink-0 h-8",
        className,
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
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
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-2 text-[12px] transition-all",
        danger
          ? "text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
          : active
          ? cn(activeColor, "bg-white/[0.04] font-semibold hover:bg-white/[0.07]")
          : "text-white/45 hover:text-white/80 hover:bg-white/[0.04]"
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {active && !danger && (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      )}
    </button>
  );
}
