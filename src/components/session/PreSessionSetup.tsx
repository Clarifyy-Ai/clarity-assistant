import { useState, useEffect, useRef } from "react";
import { useDocumentStore } from "@/store/documentStore";
import { useAuthStore } from "@/store/authStore";
import { useOverlayStore } from "@/store/overlayStore";
import { setAppStealthMode } from "@/lib/stealth/stealthActions";
import {
  Mic, MicOff, Volume2, Briefcase, Brain, ChevronRight,
  Sparkles, Shield, FileText, Settings2, Check, AlertTriangle,
  Eye, Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { enumerateAudioDevices } from "@/lib/audio/audioCapture";
import type { AudioDevice } from "@/types/audio.types";
import type { LiveSessionConfig } from "@/types/session.types";
import type { PreferredAIModel, HintStyle, UserProfile } from "@/types/user.types";
import { CreditExhaustedState, useCreditExhaustedState } from "@/components/billing/CreditExhaustedState";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import {
  clampPreferredModel,
  MODEL_OPTIONS as CANONICAL_MODEL_OPTIONS,
} from "@/lib/ai/modelOptions";
import {
  getModelLockReason,
  providerForModel,
  providerUnavailableReason,
  refreshProviderAvailability,
  useProviderFlags,
} from "@/lib/ai/providerAvailability";
import { useUIStore } from "@/store/uiStore";
import { toast } from "sonner";

interface PreSessionSetupProps {
  onStart: (config: LiveSessionConfig) => void;
  sessionType?: "live" | "mock";
  initialConfig?: LiveSessionConfig;
}

const INTERVIEW_TYPES = [
  { value: "behavioral",   label: "Behavioural",    emoji: "🧠" },
  { value: "technical",    label: "Technical",      emoji: "💻" },
  { value: "system_design",label: "System Design",  emoji: "🏗️" },
  { value: "hr",           label: "HR / Culture",   emoji: "🤝" },
  { value: "mixed",        label: "Mixed",          emoji: "🎯" },
];

const HINT_STYLES: { value: HintStyle; label: string; desc: string }[] = [
  { value: "short_hints",    label: "Hints",       desc: "Key bullet points only" },
  { value: "full_answer",    label: "Full Answer",  desc: "Complete suggested response" },
  { value: "keywords_only",  label: "Keywords",    desc: "Trigger words to jog memory" },
];

export function PreSessionSetup({ onStart, sessionType = "live", initialConfig }: PreSessionSetupProps) {
  const { profile, planId } = useAuthStore();
  const { isExhausted: creditsExhausted } = useCreditExhaustedState();
  const resumes     = useDocumentStore((s) => s.resumes);
  const jds         = useDocumentStore((s) => s.jds);
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId     = useDocumentStore((s) => s.active_jd_id);

  const typedProfile = profile as unknown as UserProfile | null;
  useProviderFlags();
  useEffect(() => {
    void refreshProviderAvailability();
  }, []);

  const [step, setStep] = useState<"type" | "settings" | "audio">("type");
  const [interviewType, setInterviewType]   = useState(initialConfig?.interview_type ?? "behavioral");
  const [resumeId,      setResumeId]        = useState<string | null>(initialConfig?.resume_id ?? activeResumeId);
  const [jdId,          setJdId]            = useState<string | null>(initialConfig?.jd_id ?? activeJdId);
  const [company,       setCompany]         = useState(initialConfig?.company ?? "");
  const [role,          setRole]            = useState(initialConfig?.role ?? "");
  const [model,         setModel]           = useState<PreferredAIModel>(() =>
    clampPreferredModel(
      initialConfig?.model ?? typedProfile?.preferred_model,
      planId ?? typedProfile?.plan_id,
    )
  );
  const [hintStyle,     setHintStyle]       = useState<HintStyle>(typedProfile?.hint_style ?? "short_hints");
  const [stealthMode,   setStealthMode]     = useState(false);
  const [micDevices,    setMicDevices]      = useState<AudioDevice[]>([]);
  const [selectedMicId, setSelectedMicId]   = useState<string>("");
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [micPermission, setMicPermission]   = useState<"unknown" | "granted" | "denied" | "checking">("unknown");
  const [showAdvanced,  setShowAdvanced]    = useState(false);
  const micCheckedRef = useRef(false);

  useEffect(() => { setResumeId(activeResumeId); }, [activeResumeId]);
  useEffect(() => { setJdId(activeJdId); }, [activeJdId]);

  const checkMicPermission = async () => {
    setMicPermission("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
  };

  useEffect(() => {
    if (micCheckedRef.current) return;
    micCheckedRef.current = true;
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((r) => {
          if (r.state === "granted") setMicPermission("granted");
          else if (r.state === "denied") setMicPermission("denied");
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (micPermission !== "granted") return;
    enumerateAudioDevices()
      .then((devices) => {
        setMicDevices(devices);
        if (!selectedMicId && devices.length > 0) {
          setSelectedMicId((devices.find((d) => d.isDefault) ?? devices[0]).deviceId);
        }
      })
      .catch(() => {});
  }, [micPermission, selectedMicId]);

  function handleStart() {
    if (micPermission === "denied") return;
    const effectiveModel = clampPreferredModel(model, planId ?? typedProfile?.plan_id);
    const config: LiveSessionConfig = {
      company:             company || null,
      role:                role || null,
      hint_style:          hintStyle,
      model:               effectiveModel,
      smart_routing:       false,
      stealth_mode:        stealthMode,
      resume_id:           resumeId,
      jd_id:               jdId,
      interview_type:      interviewType,
      instructions:        "",
      enable_system_audio: false,
      mic_device_id:       selectedMicId || null,
      noise_suppression:   noiseSuppression,
    };
    const overlay = useOverlayStore.getState();
    overlay.setActiveModel(effectiveModel);
    overlay.setHintStyle(hintStyle);
    setAppStealthMode(stealthMode);
    onStart(config);
  }

  if (creditsExhausted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card">
          <CreditExhaustedState />
        </div>
      </div>
    );
  }

  const isMock = sessionType === "mock";
  const canProceed = micPermission !== "denied";

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl">

        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            {isMock ? "Mock Interview" : "Practice Coach"}
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            {isMock ? "Set up your mock interview" : "Configure your session"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            {isMock
              ? "Answer AI-generated questions, get real-time hints, and review your performance."
              : "AI listens, detects questions, and delivers hints directly to your overlay."}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            {isMock
              ? `Estimated: ~${AI_CREDIT_COSTS.generate_questions} credits to generate questions · ~${AI_CREDIT_COSTS.live_hint} credits/hint · Debrief ${AI_CREDIT_COSTS.session_debrief} credits`
              : `Estimated usage: ~${AI_CREDIT_COSTS.live_hint} credits/hint · ${AI_CREDIT_COSTS.live_answer} credits/full answer`}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">

          {/* ── Interview Type ── */}
          <div className="p-5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Interview type</p>
            <div className="grid grid-cols-5 gap-2">
              {INTERVIEW_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setInterviewType(t.value)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-all",
                    interviewType === t.value
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-background border-border text-muted-foreground hover:border-border hover:text-foreground"
                  )}
                >
                  <span className="text-lg leading-none">{t.emoji}</span>
                  <span className="text-center leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Role & Company (optional) ── */}
          <div className="p-5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Context (optional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Target company</label>
                <input
                  value={company ?? ""}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="e.g. Google, Infosys"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Role</label>
                <input
                  value={role ?? ""}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Software Engineer"
                  className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <FileText className="w-3 h-3" /> Resume
                </label>
                <select
                  value={resumeId ?? ""}
                  onChange={(e) => setResumeId(e.target.value || null)}
                  className="w-full bg-background border border-border text-foreground rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">No resume</option>
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>{r.title || (r as any).file_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">
                  <Briefcase className="w-3 h-3" /> Job Description
                </label>
                <select
                  value={jdId ?? ""}
                  onChange={(e) => setJdId(e.target.value || null)}
                  className="w-full bg-background border border-border text-foreground rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                >
                  <option value="">No JD</option>
                  {jds.map((j) => (
                    <option key={j.id} value={j.id}>{(j as any).title || j.company_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* ── Hint style ── */}
          <div className="p-5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI hint style</p>
            <div className="grid grid-cols-3 gap-2">
              {HINT_STYLES.map((hs) => (
                <button
                  key={hs.value}
                  type="button"
                  onClick={() => setHintStyle(hs.value)}
                  className={cn(
                    "flex flex-col gap-1 px-3 py-3 rounded-xl border text-left transition-all",
                    hintStyle === hs.value
                      ? "bg-primary/10 border-primary/40 text-primary"
                      : "bg-background border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span className="text-xs font-semibold">{hs.label}</span>
                  <span className="text-[11px] leading-tight opacity-70">{hs.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── AI Model + Advanced ── */}
          <div className="p-5 border-b border-border">
            <button
              type="button"
              onClick={() => setShowAdvanced((p) => !p)}
              className="flex items-center gap-2 w-full text-left"
            >
              <Settings2 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI model</span>
              <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform", showAdvanced && "rotate-90")} />
            </button>

            {showAdvanced && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {CANONICAL_MODEL_OPTIONS.map((m) => {
                  const lock = getModelLockReason(m.value, planId ?? typedProfile?.plan_id);
                  const locked = lock !== null;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        if (lock === "plan") {
                          useUIStore.getState().openUpgradeModal("pro");
                          toast.message("Upgrade to Pro to use GPT-4o and Claude.");
                          return;
                        }
                        if (lock === "provider") {
                          toast.error(providerUnavailableReason(providerForModel(m.value)));
                          return;
                        }
                        setModel(m.value);
                      }}
                      className={cn(
                        "text-left px-3 py-2.5 rounded-xl border transition-all",
                        locked && "opacity-50 cursor-not-allowed",
                        !locked && model === m.value
                          ? "bg-primary/10 border-primary/40"
                          : !locked && "bg-background border-border hover:border-border"
                      )}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={cn("text-xs font-semibold", !locked && model === m.value ? "text-primary" : "text-foreground")}>
                          {m.label}
                        </span>
                        {lock === "provider" ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-500/15 text-red-400 rounded-full">
                            Unavailable
                          </span>
                        ) : lock === "plan" ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-500/15 text-amber-400 rounded-full">
                            Pro
                          </span>
                        ) : (
                          m.badge === "Recommended" && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full">
                              {m.badge}
                            </span>
                          )
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">{m.desc}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Microphone ── */}
          <div className="p-5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Microphone</p>

            {micPermission === "granted" && (
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                  <Check className="w-3.5 h-3.5" />
                  Access granted
                </div>
              </div>
            )}

            {micPermission === "denied" && (
              <div className="flex items-start gap-2.5 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-red-400 font-medium">Microphone blocked</p>
                  <p className="text-xs text-red-400/70 mt-0.5">Click the lock icon in your browser address bar → allow microphone, then try again.</p>
                </div>
              </div>
            )}

            {micPermission !== "granted" && micPermission !== "denied" && (
              <button
                type="button"
                onClick={checkMicPermission}
                disabled={micPermission === "checking"}
                className="flex items-center gap-2 w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground hover:border-primary transition-all mb-3"
              >
                {micPermission === "checking"
                  ? <><div className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Checking…</>
                  : <><Mic className="w-4 h-4 text-muted-foreground" /> Allow microphone access</>
                }
              </button>
            )}

            {micPermission === "granted" && micDevices.length > 0 && (
              <div className="space-y-2.5">
                <select
                  value={selectedMicId}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                  className="w-full bg-background border border-border text-foreground rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary"
                >
                  {micDevices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={noiseSuppression}
                    onChange={(e) => setNoiseSuppression(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-xs text-muted-foreground">Noise suppression</span>
                </label>
              </div>
            )}

            {micPermission === "denied" && (
              <div className="flex gap-2">
                <button type="button" onClick={checkMicPermission} className="flex-1 py-2 bg-background border border-border rounded-xl text-sm text-foreground hover:border-primary">
                  Try again
                </button>
                <button type="button" onClick={() => window.location.reload()} className="flex-1 py-2 bg-background border border-border rounded-xl text-sm text-muted-foreground">
                  Reload
                </button>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              {isMock ? "Mic is optional for mock interviews — you can type answers instead." : "Mic needed to detect spoken interview questions."}
            </p>
          </div>

          {/* ── Options ── */}
          <div className="p-5 border-b border-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Options</p>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                role="checkbox"
                aria-checked={stealthMode}
                tabIndex={0}
                onClick={() => setStealthMode((p) => !p)}
                onKeyDown={(e) => e.key === " " && setStealthMode((p) => !p)}
                className={cn(
                  "relative w-10 h-6 rounded-full transition-colors border-2 shrink-0",
                  stealthMode
                    ? "bg-primary border-primary"
                    : "bg-secondary border-border"
                )}
              >
                <div className={cn(
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                  stealthMode && "translate-x-4"
                )} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Discrete UI</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Dims the overlay when not in use. Nav labels stay neutral during screen share.
                </p>
              </div>
            </label>
          </div>

          {/* ── Start ── */}
          <div className="p-5">
            <button
              type="button"
              onClick={handleStart}
              disabled={!canProceed}
              className={cn(
                "w-full py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-2.5 transition-all",
                canProceed
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              <Sparkles className="w-4 h-4" />
              {isMock ? "Start mock interview" : "Start session"}
              <ChevronRight className="w-4 h-4" />
            </button>

            {!canProceed && (
              <p className="text-center text-xs text-muted-foreground mt-2">
                Allow microphone access above to continue
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
