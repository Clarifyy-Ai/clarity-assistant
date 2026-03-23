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
  MoreHorizontal, Plus, ChevronUp, Settings2,
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
  short_hints:   "Short",
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
    <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-white/8 bg-[#0f0f1a]/60 shrink-0 overflow-x-auto scrollbar-hide">

      {/* ── LEFT: Mic ─────────────────────────────────────────────── */}
      <IconButton
        icon={isMuted ? MicOff : Mic}
        label={isMuted ? "Unmute mic" : "Mute mic"}
        active={isCapturing && !isMuted}
        activeColor="text-red-400 bg-red-500/15"
        onClick={onToggleMic}
      />

      {/* ── CENTER: Labeled action buttons (ParakeetAI style) ─────── */}
      <div className="flex items-center gap-1 flex-1 justify-center">

        {/* AI Help */}
        <LabelButton
          icon={Zap}
          label="AI Help"
          active={isGenerating}
          activeClass="text-amber-300 bg-amber-500/20 border-amber-500/30"
          inactiveClass="text-white/80 bg-white/8 border-white/10 hover:bg-white/12 hover:text-white"
          onClick={onGenerate}
          disabled={isGenerating}
          pulse={isGenerating}
        />

        {/* Analyze Screen */}
        <LabelButton
          icon={Monitor}
          label="Analyze Screen"
          active={isScreenshotLoading}
          activeClass="text-blue-300 bg-blue-500/20 border-blue-500/30"
          inactiveClass="text-white/80 bg-white/8 border-white/10 hover:bg-white/12 hover:text-white"
          onClick={() => captureAndAnalyseCodingProblem()}
          disabled={isScreenshotLoading}
          pulse={isScreenshotLoading}
        />

        {/* Chat */}
        <LabelButton
          icon={undefined}
          label="Chat"
          active={activeTab === "chat"}
          activeClass="text-brand-300 bg-brand-500/20 border-brand-500/30"
          inactiveClass="text-white/80 bg-white/8 border-white/10 hover:bg-white/12 hover:text-white"
          onClick={() => useOverlayStore.getState().setActiveTab("chat")}
        />

      </div>

      {/* ── RIGHT: Timer + more menu + collapse + end ─────────────── */}
      <div className="flex items-center gap-1 shrink-0">

        {/* Session timer */}
        <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/8 text-[11px] font-mono text-white/70 shrink-0">
          <OverlayActivityTimer />
        </div>

        {/* ⋯ More menu */}
        <div className="relative" ref={moreMenuRef}>
          <button
            onClick={() => setShowMoreMenu((p) => !p)}
            title="More options"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/8 transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {showMoreMenu && (
            <div className="absolute top-full right-0 mt-1 w-56 bg-[#13131f] border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">

              {/* System Audio */}
              {onToggleSystemAudio && (
                <MenuRow
                  icon={hasSystemAudio ? Volume2 : VolumeX}
                  label={hasSystemAudio ? "System audio ON" : "System audio OFF"}
                  active={hasSystemAudio}
                  onClick={onToggleSystemAudio}
                />
              )}

              {/* Stealth */}
              <MenuRow
                icon={isStealth ? EyeOff : Eye}
                label={isStealth ? "Exit stealth" : "Enter stealth"}
                active={isStealth}
                activeColor="text-violet-400"
                onClick={() => { toggleAppStealthMode(); setShowMoreMenu(false); }}
              />

              {/* Auto-generate */}
              <MenuRow
                icon={RefreshCw}
                label={autoGenerate ? "Auto-generate ON" : "Auto-generate OFF"}
                active={autoGenerate}
                activeColor="text-emerald-400"
                onClick={() => useOverlayStore.getState().setAutoGenerate(!autoGenerate)}
              />

              {/* Simple language */}
              <MenuRow
                icon={Type}
                label={simpleLanguage ? "Simple language ON" : "Simple language"}
                active={simpleLanguage}
                activeColor="text-sky-400"
                onClick={() => useOverlayStore.getState().setSimpleLanguage(!simpleLanguage)}
              />

              <div className="my-1 border-t border-white/5" />

              {/* Hint style */}
              <div className="px-3 py-1.5">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">Hint Style</p>
                <div className="flex gap-1">
                  {(["full_answer", "short_hints", "keywords_only"] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => useOverlayStore.getState().setHintStyle(style)}
                      className={cn(
                        "flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all",
                        hintStyle === style
                          ? "bg-brand-500/20 text-brand-300 border border-brand-500/30"
                          : "bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/8 border border-transparent"
                      )}
                    >
                      {HINT_STYLE_LABELS[style]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="my-1 border-t border-white/5" />

              {/* Model picker */}
              <div className="px-3 py-1.5">
                <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1.5">AI Model</p>
                {MODEL_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { useOverlayStore.getState().setActiveModel(m.id); setShowMoreMenu(false); }}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-lg text-[11px] transition-all flex items-center justify-between",
                      activeModel === m.id
                        ? "text-brand-300 bg-brand-500/10 font-semibold"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <span>{m.label}</span>
                    {m.note && <span className="text-[10px] text-white/25">({m.note})</span>}
                  </button>
                ))}
              </div>

              <div className="my-1 border-t border-white/5" />

              {/* Resume quick-peek */}
              <MenuRow
                icon={FileText}
                label={resumePoints ? "Resume snapshot" : "No resume loaded"}
                active={!!resumePoints}
                activeColor="text-brand-300"
                onClick={() => { setShowResumeQuickPeek((p) => !p); setShowMoreMenu(false); }}
              />

              {/* Pinned hints */}
              <MenuRow
                icon={Star}
                label={pinnedHints.length > 0 ? `Pinned hints (${pinnedHints.length})` : "No pinned hints"}
                active={pinnedHints.length > 0}
                activeColor="text-amber-300"
                onClick={() => { setShowPinnedMenu((p) => !p); setShowMoreMenu(false); }}
              />

              {/* Keyboard shortcuts */}
              <MenuRow
                icon={Settings2}
                label="Keyboard shortcuts"
                active={false}
                onClick={() => { setShowHotkeyRef((p) => !p); setShowMoreMenu(false); }}
              />

              <div className="my-1 border-t border-white/5" />

              {/* Panic */}
              <MenuRow
                icon={AlertCircle}
                label="Panic"
                active={false}
                activeColor="text-red-400"
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
              ? "text-amber-400 bg-amber-500/15"
              : "text-white/40 hover:text-white hover:bg-white/8"
          )}
        >
          {isMinimal ? <Plus className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </button>

        {/* End session */}
        <button
          onClick={onEndSession}
          title="End session"
          className="flex items-center gap-1 px-2 py-1 h-7 bg-red-600/20 hover:bg-red-600/35 border border-red-500/25 text-red-400 text-[11px] font-semibold rounded-lg transition-all shrink-0"
        >
          <Square className="w-3 h-3" />
          <span>End</span>
        </button>
      </div>

      {/* ── Floating popover: Resume snapshot ─────────────────────── */}
      {showResumeQuickPeek && (
        <div
          ref={resumeQuickPeekRef}
          className="absolute top-12 right-2 w-64 bg-[#13131f] border border-white/10 rounded-xl shadow-2xl z-50 p-3 space-y-2"
        >
          <p className="text-[11px] font-semibold text-brand-300/60 uppercase tracking-wider">Resume Snapshot</p>
          {!resumePoints ? (
            <p className="text-[11px] text-white/30 italic">No resume loaded for this session.</p>
          ) : (
            <>
              <p className="text-[11px] text-white/80 leading-snug">
                {resumePoints.intro.length > 120 ? resumePoints.intro.slice(0, 119) + "…" : resumePoints.intro}
              </p>
              {resumePoints.skills_summary && (
                <div className="flex flex-wrap gap-1">
                  {resumePoints.skills_summary.split(", ").slice(0, 3).map((skill, i) => (
                    <span key={i} className="rounded-md border border-brand-500/20 bg-brand-500/10 px-1.5 py-0.5 text-[11px] text-brand-300">
                      {skill}
                    </span>
                  ))}
                </div>
              )}
              {resumePoints.experience_points.slice(0, 2).map((pt, i) => (
                <div key={i} className="flex gap-1.5 text-[11px] text-white/60">
                  <span className="shrink-0 text-brand-400">•</span>
                  <span>{pt}</span>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Floating popover: Pinned Hints ────────────────────────── */}
      {showPinnedMenu && (
        <div
          ref={pinnedMenuRef}
          className="absolute top-12 right-2 w-64 bg-[#13131f] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
            <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider">Pinned Hints</p>
            {pinnedHints.length > 0 && (
              <button
                onClick={() => useOverlayStore.getState().clearPinnedHints()}
                className="text-[11px] text-white/30 hover:text-red-400 transition-colors"
              >
                clear all
              </button>
            )}
          </div>
          {pinnedHints.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-white/30 italic text-center">
              Pin hints using the Pin button in the answer panel
            </div>
          ) : (
            <div className="max-h-56 overflow-y-auto py-1">
              {pinnedHints.slice(-6).reverse().map((pin) => (
                <div key={pin.id} className="px-3 py-2 hover:bg-white/5 transition-colors">
                  <p className="text-[10px] text-white/30 truncate mb-0.5">{pin.question || "No question"}</p>
                  <p className="text-[11px] text-white/70 line-clamp-2">{pin.hint}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <button
                      onClick={() => {
                        useOverlayStore.getState().setHintState("ready");
                        useOverlayStore.setState({ current_hint: pin.hint, current_question: pin.question });
                        useOverlayStore.getState().setActiveTab("answer");
                        setShowPinnedMenu(false);
                      }}
                      className="text-[11px] text-brand-300/60 hover:text-brand-300 transition-colors"
                    >
                      Jump to →
                    </button>
                    <button
                      onClick={() => useOverlayStore.getState().togglePinHint(pin.hint, pin.question)}
                      className="text-[11px] text-white/20 hover:text-red-400 transition-colors"
                    >
                      <Pin className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Floating popover: Keyboard shortcuts ──────────────────── */}
      {showHotkeyRef && (
        <div
          ref={hotkeyRefRef}
          className="absolute top-12 right-2 w-52 bg-[#13131f] border border-white/10 rounded-xl shadow-2xl z-50 p-3"
        >
          <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-2">Shortcuts</p>
          <div className="space-y-1.5">
            {HOTKEY_REFERENCE.map((hk) => (
              <div key={hk.label} className="flex items-center justify-between">
                <span className="text-[11px] text-white/50">{hk.label}</span>
                <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[11px] text-white/60 font-mono">
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

/** Labeled pill button — matches ParakeetAI's "AI Help", "Analyze Screen", "Chat" */
function LabelButton({
  icon: Icon,
  label,
  active,
  activeClass,
  inactiveClass,
  onClick,
  disabled,
  pulse,
}: {
  icon?: LucideIcon;
  label: string;
  active: boolean;
  activeClass: string;
  inactiveClass: string;
  onClick?: () => void;
  disabled?: boolean;
  pulse?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-all shrink-0 h-8",
        active ? activeClass : inactiveClass,
        disabled && "opacity-60 cursor-not-allowed",
        pulse && "animate-pulse",
      )}
    >
      {Icon && <Icon className="w-3.5 h-3.5" />}
      <span>{label}</span>
    </button>
  );
}

/** Icon-only button for mic etc. */
function IconButton({
  icon: Icon,
  label,
  active,
  activeColor,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  activeColor?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-lg border transition-all shrink-0",
        active
          ? cn(activeColor ?? "text-green-400 bg-green-500/15", "border-white/10")
          : "text-white/40 bg-white/5 border-white/8 hover:text-white hover:bg-white/10",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

/** Row item inside the "⋯ More" dropdown */
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
          ? "text-red-400/70 hover:text-red-400 hover:bg-red-500/10"
          : active
          ? cn(activeColor, "bg-white/5 font-semibold hover:bg-white/8")
          : "text-white/50 hover:text-white hover:bg-white/5"
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
      {active && !danger && (
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      )}
    </button>
  );
}
