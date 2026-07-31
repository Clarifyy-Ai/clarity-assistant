import { useState, useEffect, useMemo } from "react";
import { useDocumentStore } from "@/store/documentStore";
import { useAuthStore } from "@/store/userStore";
import { useOverlayStore } from "@/store/overlayStore";
import { setAppStealthMode } from "@/lib/stealth/stealthActions";
import {
  Radio, FileText, Briefcase, Brain, Volume2,
  ChevronRight, ChevronLeft, Shield, Zap,
  Users, PhoneCall, ToggleLeft, ToggleRight,
  ScrollText, AlertTriangle, CheckCircle2, Sparkles,
  BookOpen, Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";
import type { PreferredAIModel, HintStyle, UserProfile } from "@/types/user.types";
import { runAudioPreflight, type PreflightReport } from "@/lib/validators/audioValidator";
import { useDocuments } from "@/hooks/useDocuments";
import { useIsMobile } from "@/hooks/use-mobile";
import { notifyOverlayVisibilityOnMobile } from "@/lib/overlay/overlayVisibilityNotice";
import { OverlaySetupGuidePanel } from "@/components/overlay/OverlaySetupGuidePanel";
import { OVERLAY_VISIBILITY_WARNING } from "@/lib/constants/overlaySetupGuide";
import { CreditExhaustedState, useCreditExhaustedState } from "@/components/billing/CreditExhaustedState";
import {
  isFreePlan,
  maxSessionMinutesForPlan,
} from "@/lib/constants/freeTier";
import {
  formatPracticeSetupSummary,
  loadLastPracticeSetup,
} from "@/lib/session/lastPracticeSetup";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/Button";
import { SessionContextChip } from "@/components/session/SessionContextChip";

interface PreSessionSetupWizardProps {
  onStart: (config: LiveSessionConfig) => void;
  sessionType?: "live" | "mock";
}

const MODEL_OPTIONS: { id: PreferredAIModel; label: string; desc: string }[] = [
  { id: "gpt-4o",            label: "GPT-4o",           desc: "Best for nuanced answers" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", desc: "Excellent reasoning" },
  { id: "gemini-1-5-pro",    label: "Gemini 1.5 Pro",   desc: "Fast, cost-effective" },
  { id: "gemini-flash",      label: "Gemini Flash",      desc: "Fastest response time" },
];

import { INTERVIEW_TYPE_OPTIONS } from "@/lib/constants/interviewTypes";

const STEPS = [
  { id: 1, label: "Session Type",       icon: Users },
  { id: 2, label: "AI Settings",        icon: Brain },
  { id: 3, label: "Documents",          icon: FileText },
  { id: 4, label: "Auto-Generate",      icon: Sparkles },
  { id: 5, label: "Save Transcript",    icon: ScrollText },
  { id: 6, label: "Connect",            icon: CheckCircle2 },
];

function BooleanSwitch({
  checked,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <Switch
      checked={checked}
      onCheckedChange={onChange}
      aria-label={ariaLabel}
    />
  );
}

export function PreSessionSetupWizard({ onStart, sessionType = "live" }: PreSessionSetupWizardProps) {
  const { profile } = useAuthStore();
  const { isExhausted: creditsExhausted } = useCreditExhaustedState();
  useDocuments();
  const isMobile = useIsMobile();
  const resumes        = useDocumentStore((s) => s.resumes);
  const jds            = useDocumentStore((s) => s.jds);
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId     = useDocumentStore((s) => s.active_jd_id);

  const typedProfile = profile as unknown as UserProfile | null;
  const freePlan = isFreePlan(typedProfile?.plan_id);
  const maxDuration = maxSessionMinutesForPlan(typedProfile?.plan_id);
  const durationOptions = freePlan ? [5] : [15, 30, 45, 60];

  const lastSetup = useMemo(() => loadLastPracticeSetup(), []);
  const [showWizard, setShowWizard] = useState(!lastSetup);

  const [step, setStep] = useState(1);

  // Step 1 — Session Type
  const [sessionCallType,  setSessionCallType]  = useState<"interview" | "regular_call">("interview");
  const [company,          setCompany]          = useState("");
  const [role,             setRole]             = useState("");
  const [interviewType,    setInterviewType]    = useState("behavioral");

  // Step 2 — Language & AI Settings
  const [language,         setLanguage]         = useState("English");
  const [simpleLanguage,   setSimpleLanguage]   = useState(false);
  const [instructions,     setInstructions]     = useState("");
  const [model,            setModel]            = useState<PreferredAIModel>(
    typedProfile?.preferred_model ?? "gemini-flash"
  );
  const [smartRouting,     setSmartRouting]     = useState(false);
  const [hintStyle,        setHintStyle]        = useState<HintStyle>(
    typedProfile?.hint_style ?? "short_hints"
  );

  // Step 3 — Documents
  const [resumeId,         setResumeId]         = useState<string | null>(activeResumeId);
  const [jdId,             setJdId]             = useState<string | null>(activeJdId);
  const [extraDocIds,      setExtraDocIds]      = useState<string[]>([]);

  // Step 4 — Auto-Generate
  const [autoGenerate,     setAutoGenerate]     = useState(true);

  // Step 5 — Save Transcript
  const [saveTranscript,   setSaveTranscript]   = useState(true);

  // Step 5b — Duration
  const [durationMinutes, setDurationMinutes] = useState(
    freePlan ? 5 : 30,
  );

  // Step 6 — Connect
  const [enableSystemAudio, setEnableSystemAudio] = useState(true);
  const [stealthMode,        setStealthMode]       = useState(false);
  const [micPermission,      setMicPermission]     = useState<"unknown" | "granted" | "denied" | "checking">("unknown");
  const [preflight,          setPreflight]         = useState<PreflightReport | null>(null);
  const [preflightLoading,   setPreflightLoading]  = useState(false);
  const [visibilityAck,      setVisibilityAck]     = useState(false);

  const systemAudioSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    "getDisplayMedia" in navigator.mediaDevices;

  useEffect(() => { setResumeId(activeResumeId); }, [activeResumeId]);
  useEffect(() => { setJdId(activeJdId); }, [activeJdId]);

  useEffect(() => {
    notifyOverlayVisibilityOnMobile();
  }, []);

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => {
        if (result.state === "granted") setMicPermission("granted");
        else if (result.state === "denied") setMicPermission("denied");
      }).catch((err) => {
        console.error("[PreSessionSetupWizard] microphone permissions query failed:", err);
      });
    }
  }, []);

  useEffect(() => {
    if (step !== 6) return;
    let cancelled = false;
    setPreflightLoading(true);
    void runAudioPreflight()
      .then((report) => {
        if (!cancelled) setPreflight(report);
      })
      .finally(() => {
        if (!cancelled) setPreflightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, micPermission]);

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

  function handleStart() {
    if (micPermission !== "granted") return;
    if (!visibilityAck) return;
    if (preflight && !preflight.ready) return;
    // NOTE: tab-audio guidance modal is shown at capture time via
    // confirmTabAudioCapture() inside useAudioSession.start(). We no longer
    // auto-acknowledge here so the user always sees the "tick Share tab
    // audio" instructions before the share picker appears.
    const contextDocIds = [
      ...(resumeId ? [resumeId] : []),
      ...(jdId ? [jdId] : []),
      ...extraDocIds,
    ];
    const config: LiveSessionConfig = {
      company:              company.trim() || null,
      role:                 role.trim() || null,
      hint_style:           hintStyle,
      model:                smartRouting ? "gemini-flash" : model,
      smart_routing:        smartRouting,
      stealth_mode:         stealthMode,
      resume_id:            resumeId,
      jd_id:                jdId,
      interview_type:       interviewType,
      instructions,
      enable_system_audio:  enableSystemAudio,
      simple_language:      simpleLanguage,
      save_transcript:      saveTranscript,
      session_call_type:    sessionCallType,
      context_document_ids: contextDocIds,
      language,
      duration_minutes:     durationMinutes > 0 ? durationMinutes : undefined,
    };

    // Sync document selections into documentStore so AI context is correct
    const docStore = useDocumentStore.getState();
    docStore.setActiveResumeId(resumeId);
    docStore.setActiveJDId(jdId);

    const overlay = useOverlayStore.getState();
    overlay.setActiveModel(smartRouting ? "gemini-flash" : model);
    overlay.setHintStyle(hintStyle);
    overlay.setAutoGenerate(autoGenerate);
    overlay.setSimpleLanguage(simpleLanguage);
    overlay.setSaveTranscript(saveTranscript);
    overlay.setSessionCallType(sessionCallType);
    overlay.setSessionLanguage(language);
    setAppStealthMode(stealthMode);

    onStart(config);
  }

  const canProceed = step < 6;
  const isLastStep = step === 6;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && canProceed) {
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
        e.preventDefault();
        setStep((p) => p + 1);
      }
      if (e.key === "Escape" && step > 1) {
        e.preventDefault();
        setStep((p) => p - 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step, canProceed]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const container = document.querySelector("[data-wizard-step]");
      const firstInput = container?.querySelector<HTMLElement>(
        "input:not([type=hidden]):not([type=checkbox]), select, textarea"
      );
      firstInput?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [step]);

  if (creditsExhausted) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card">
          <CreditExhaustedState />
        </div>
      </div>
    );
  }

  if (!showWizard && lastSetup) {
    const quickResumeTitle =
      resumes.find((r) => r.id === (lastSetup.resume_id ?? activeResumeId))?.title ?? null;
    const quickLanguage = lastSetup.language ?? "English";

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div className="w-full max-w-lg space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium">
              <Radio className="w-3.5 h-3.5 animate-pulse" aria-hidden />
              Ready to practice
            </div>
            <h1 className="text-2xl font-bold text-foreground">Start Practice Coach</h1>
            <p className="text-sm text-muted-foreground">
              {formatPracticeSetupSummary(lastSetup)}
            </p>
            <div className="flex justify-center pt-1">
              <SessionContextChip
                resumeLabel={quickResumeTitle}
                language={quickLanguage}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Typical cost: ~{AI_CREDIT_COSTS.live_answer + AI_CREDIT_COSTS.live_hint} credits per
              answer+hint · Session debrief {AI_CREDIT_COSTS.session_debrief} credits
            </p>
          </div>
          <div
            role="note"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
          >
            <strong>Practice only.</strong> This opens the Overlay session window. Interviewers
            cannot see the Overlay unless you share that window.
          </div>
          <Button
            variant="primary"
            className="w-full"
            size="lg"
            leftIcon={<Play className="w-4 h-4" />}
            onClick={() => onStart(lastSetup)}
          >
            Start Practice (same setup)
          </Button>
          <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="w-full text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Change setup
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium mb-4">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Session Setup
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {STEPS[step - 1].label}
          </h1>
          <div className="mt-2 flex justify-center">
            <SessionContextChip
              resumeLabel={
                resumes.find((r) => r.id === resumeId)?.title ??
                (resumeId ? "Selected resume" : null)
              }
              language={language}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Estimated usage: ~{AI_CREDIT_COSTS.live_hint} credits/hint ·{" "}
            {AI_CREDIT_COSTS.live_answer} credits/full answer
          </p>
          {lastSetup && (
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Back to one-click start
            </button>
          )}
        </div>

        {isMobile && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-[11px] text-amber-100/90 leading-relaxed">
              <p className="font-semibold text-amber-200">Visible to others on screen share</p>
              <p className="mt-0.5">{OVERLAY_VISIBILITY_WARNING}</p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => {
            const StepIcon = s.icon;
            const isActive = s.id === step;
            const isDone = s.id < step;
            return (
              <div key={s.id} className="flex-1 flex items-center gap-1">
                <div
                  className={cn(
                    "flex items-center justify-center w-7 h-7 rounded-full border text-[10px] font-bold shrink-0 transition-all",
                    isDone
                      ? "bg-emerald-500 border-emerald-500 text-foreground"
                      : isActive
                      ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
                      : "border-border text-muted-foreground/60"
                  )}
                >
                  {isDone ? <CheckCircle2 className="w-3.5 h-3.5" /> : <StepIcon className="w-3 h-3" />}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    "flex-1 h-px transition-colors",
                    isDone ? "bg-emerald-500/50" : "bg-border/50"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div data-wizard-step={step} className="bg-secondary/40 border border-border rounded-2xl p-6 space-y-5">

          {/* ── Step 1: Session Type ───────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "interview" as const,    label: "Interview",     icon: Users,      desc: "Practice or live interview. AI coach guides you." },
                  { value: "regular_call" as const, label: "Regular Call",  icon: PhoneCall,  desc: "Any meeting or call. AI assists naturally." },
                ].map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setSessionCallType(opt.value)}
                      className={cn(
                        "flex flex-col items-start gap-2 p-4 rounded-xl border text-left transition-all",
                        sessionCallType === opt.value
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                          : "bg-secondary/20 border-border text-muted-foreground hover:border-border/80"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-semibold text-sm">{opt.label}</span>
                      <span className="text-[11px] opacity-60">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>

              {sessionCallType === "interview" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Company (optional)</label>
                      <input
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="e.g. Google"
                        className="w-full bg-secondary/40 border border-border text-foreground placeholder:text-muted-foreground/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role (optional)</label>
                      <input
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        placeholder="e.g. Software Engineer"
                        className="w-full bg-secondary/40 border border-border text-foreground placeholder:text-muted-foreground/60 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Interview Type</label>
                    <select
                      value={interviewType}
                      onChange={(e) => setInterviewType(e.target.value)}
                      className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
                    >
                      {INTERVIEW_TYPE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Language & AI Settings ────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
                >
                  {["English","Spanish","French","German","Portuguese","Hindi","Mandarin","Japanese","Arabic","Dutch"].map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between p-3.5 bg-secondary/20 border border-border rounded-xl">
                <div>
                  <p className="text-sm font-medium text-foreground">Simple Language</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">AI replies in plain, jargon-free language</p>
                </div>
                <BooleanSwitch
                  checked={simpleLanguage}
                  onChange={setSimpleLanguage}
                  aria-label="Simple language"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Hint Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "full_answer" as HintStyle,   label: "Full Answer",  desc: "Complete 2-3 paragraph answer" },
                    { value: "short_hints" as HintStyle,   label: "Short Hints",  desc: "3-4 bullet talking points" },
                    { value: "keywords_only" as HintStyle, label: "Keywords",     desc: "5-8 key phrases only" },
                  ].map((hs) => (
                    <button
                      key={hs.value}
                      onClick={() => setHintStyle(hs.value)}
                      className={cn(
                        "flex flex-col items-start p-3 rounded-xl border text-left transition-all",
                        hintStyle === hs.value
                          ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400"
                          : "bg-secondary/20 border-border text-muted-foreground hover:border-border/80"
                      )}
                    >
                      <span className="text-xs font-semibold">{hs.label}</span>
                      <span className="text-[10px] opacity-60 mt-0.5">{hs.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Extra Context / Instructions</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Focus on STAR method, emphasise leadership examples…"
                  rows={2}
                  className="w-full bg-secondary/40 border border-border text-foreground placeholder:text-muted-foreground/60 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 text-sm resize-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Brain className="w-3.5 h-3.5" /> AI Model
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={smartRouting}
                      onChange={(e) => setSmartRouting(e.target.checked)}
                      className="rounded border-border bg-secondary/40 text-emerald-500"
                    />
                    <span className="text-[11px] text-muted-foreground">Smart routing</span>
                  </label>
                </div>
                {smartRouting ? (
                  <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
                    <p className="text-xs text-emerald-400 font-medium">Auto-select best model</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Routes to optimal model based on question complexity.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {MODEL_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        className={cn(
                          "text-left px-3 py-2 rounded-xl border text-sm transition-all",
                          model === m.id
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-secondary/40 border-border text-muted-foreground hover:border-border"
                        )}
                      >
                        <p className="font-medium text-xs">{m.label}</p>
                        <p className="text-[10px] mt-0.5 opacity-60">{m.desc}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 3: Documents ─────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">Attach documents to give the AI more context about you and the role.</p>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <FileText className="w-3.5 h-3.5" /> Resume
                </label>
                <select
                  value={resumeId ?? ""}
                  onChange={(e) => setResumeId(e.target.value || null)}
                  className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
                >
                  <option value="">None selected</option>
                  {resumes.map((r) => (
                    <option key={r.id} value={r.id}>{r.title || (r as any).file_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <Briefcase className="w-3.5 h-3.5" /> Job Description
                </label>
                <select
                  value={jdId ?? ""}
                  onChange={(e) => setJdId(e.target.value || null)}
                  className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
                >
                  <option value="">None selected</option>
                  {jds.map((j) => (
                    <option key={j.id} value={j.id}>{(j as any).title || j.company_name}</option>
                  ))}
                </select>
              </div>

              {resumes.length === 0 && jds.length === 0 && (
                <div className="bg-secondary/20 border border-border rounded-xl p-4 text-center">
                  <BookOpen className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Upload documents in the Documents section first.</p>
                </div>
              )}

              {/* Extra documents (all resumes + JDs as additional context) */}
              {(resumes.length > 1 || jds.length > 1) && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Additional Context Documents</label>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {resumes.filter((r) => r.id !== resumeId).map((r) => {
                      const isSelected = extraDocIds.includes(r.id);
                      return (
                        <label key={r.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/40 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) setExtraDocIds((p) => [...p, r.id]);
                              else setExtraDocIds((p) => p.filter((id) => id !== r.id));
                            }}
                            className="rounded border-border bg-secondary/40 text-emerald-500"
                          />
                          <span className="text-xs text-muted-foreground truncate">{r.title || "Resume"}</span>
                        </label>
                      );
                    })}
                    {jds.filter((j) => j.id !== jdId).map((j) => {
                      const isSelected = extraDocIds.includes(j.id);
                      return (
                        <label key={j.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-secondary/40 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) setExtraDocIds((p) => [...p, j.id]);
                              else setExtraDocIds((p) => p.filter((id) => id !== j.id));
                            }}
                            className="rounded border-border bg-secondary/40 text-emerald-500"
                          />
                          <span className="text-xs text-muted-foreground truncate">
                            {j.role_title}{j.company_name ? ` — ${j.company_name}` : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Auto-Generate ─────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <div className={cn(
                "flex flex-col gap-3 p-5 rounded-xl border transition-all cursor-pointer",
                autoGenerate
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-secondary/20 border-border"
              )}
                onClick={() => setAutoGenerate(true)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className={cn("w-5 h-5", autoGenerate ? "text-emerald-400" : "text-muted-foreground")} />
                    <span className={cn("font-semibold text-sm", autoGenerate ? "text-emerald-400" : "text-muted-foreground")}>
                      Auto-Generate ON
                    </span>
                  </div>
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                    autoGenerate ? "border-emerald-400" : "border-muted-foreground/40"
                  )}>
                    {autoGenerate && <div className="w-2 h-2 rounded-full bg-emerald-400" />}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  The AI automatically generates a response every time a question is detected. Best for fast-paced interviews where speed matters.
                </p>
              </div>

              <div className={cn(
                "flex flex-col gap-3 p-5 rounded-xl border transition-all cursor-pointer",
                !autoGenerate
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-secondary/20 border-border"
              )}
                onClick={() => setAutoGenerate(false)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className={cn("w-5 h-5", !autoGenerate ? "text-amber-400" : "text-muted-foreground")} />
                    <span className={cn("font-semibold text-sm", !autoGenerate ? "text-amber-400" : "text-muted-foreground")}>
                      Manual Trigger
                    </span>
                  </div>
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                    !autoGenerate ? "border-amber-400" : "border-muted-foreground/40"
                  )}>
                    {!autoGenerate && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  You control when the AI generates a response. Use the "Get AI Answer" button or keyboard shortcut. Better for thoughtful, deliberate practice.
                </p>
              </div>
            </div>
          )}

          {/* ── Step 5: Save Transcript ───────────────────────── */}
          {step === 5 && (
            <div className="space-y-5">
              <div className="flex items-center justify-between p-4 bg-secondary/20 border border-border rounded-xl">
                <div>
                  <p className="text-sm font-medium text-foreground">Save Transcript</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Store the session transcript for later review</p>
                </div>
                <BooleanSwitch
                  checked={saveTranscript}
                  onChange={setSaveTranscript}
                  aria-label="Save transcript"
                />
              </div>

              {/* Duration setting */}
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Session Duration (minutes)
                  {freePlan && (
                    <span className="ml-1 text-amber-500">— Free plan: 5 min max</span>
                  )}
                </label>
                <div className={cn("grid gap-2", freePlan ? "grid-cols-1" : "grid-cols-4")}>
                  {durationOptions.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDurationMinutes(Math.min(d, maxDuration))}
                      className={cn(
                        "py-2 rounded-xl border text-sm font-medium transition-all",
                        durationMinutes === d
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-secondary/20 border-border text-muted-foreground hover:border-border/80"
                      )}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">You'll get warnings at 5 min, 2 min, and 30 sec before time is up.</p>
              </div>

              <div className="flex gap-2.5 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-600 dark:text-amber-300/80 leading-relaxed space-y-1.5">
                  <p className="font-semibold text-amber-400">Legal Disclaimer — Transcription Consent</p>
                  <p>
                    Recording and transcribing conversations may be subject to local laws requiring all-party consent (e.g. California's CMIA, UK's RIPA, GDPR). By enabling transcript saving, you confirm that you have obtained all necessary consents from other participants, or that applicable law does not require it.
                  </p>
                  <p>
                    Clarify AI does not share your transcripts with third parties. Transcripts are stored securely and only accessible by you.
                  </p>
                  {!saveTranscript && (
                    <p className="text-emerald-400/80 font-medium">
                      Transcript saving is OFF. Real-time transcript will still be shown during the session but will not be persisted to our servers.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 6: Connect ───────────────────────────────── */}
          {step === 6 && (
            <div className="space-y-5">
              {/* Supported platforms */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Works with all platforms</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: "Zoom",       icon: "🎥" },
                    { name: "Google Meet", icon: "📹" },
                    { name: "MS Teams",    icon: "👥" },
                    { name: "HackerRank",  icon: "💻" },
                    { name: "CodeSignal",  icon: "⚡" },
                    { name: "LeetCode",    icon: "🧩" },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center gap-2 p-2.5 bg-secondary/20 border border-border rounded-xl">
                      <span className="text-lg">{p.icon}</span>
                      <span className="text-xs text-foreground font-medium">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* How to connect */}
              <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-blue-400">How it works</p>
                <ol className="text-[11px] text-muted-foreground space-y-1.5 list-decimal list-inside">
                  <li>Open your interview platform (Zoom, Meet, etc.) in a <strong className="text-foreground">browser tab</strong></li>
                  <li>Click "Start" below — Clarify AI will listen automatically</li>
                  <li>For <strong className="text-foreground">system audio</strong> capture, enable "Share tab audio" when screen-sharing</li>
                </ol>
              </div>

              {/* Summary */}
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Session Summary</p>
                {[
                  { label: "Type",          value: sessionCallType === "interview" ? `Interview · ${INTERVIEW_TYPE_OPTIONS.find(t=>t.value===interviewType)?.label ?? interviewType}` : "Regular Call" },
                  { label: "Model",         value: smartRouting ? "Smart Routing" : MODEL_OPTIONS.find(m=>m.id===model)?.label },
                  { label: "Hint Style",    value: hintStyle.replace("_", " ") },
                  { label: "Auto-Generate", value: autoGenerate ? "ON (automatic)" : "Manual trigger" },
                  { label: "Simple Language", value: simpleLanguage ? "ON" : "OFF" },
                  { label: "Save Transcript", value: saveTranscript ? "Yes" : "No (real-time only)" },
                  ...(company || role ? [{ label: "Role", value: [company, role].filter(Boolean).join(" — ") }] : []),
                  ...(resumeId ? [{ label: "Resume", value: resumes.find(r=>r.id===resumeId)?.title || "Selected" }] : []),
                  ...(jdId ? [{ label: "Job Description", value: (jds.find(j=>j.id===jdId) as any)?.title || "Selected" }] : []),
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="text-foreground font-medium capitalize">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="h-px bg-secondary/40" />

              <div className="flex items-center gap-4">
                <label className={cn(
                  "flex items-center gap-3 flex-1",
                  systemAudioSupported ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                )}>
                  <input
                    type="checkbox"
                    checked={enableSystemAudio}
                    onChange={(e) => setEnableSystemAudio(e.target.checked)}
                    disabled={!systemAudioSupported}
                    className="rounded border-border bg-secondary/40 text-emerald-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" /> System Audio
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {systemAudioSupported
                        ? "We'll ask you to share the interview tab and tick \"Share audio\"."
                        : "Not supported in this browser"}
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    checked={stealthMode}
                    onChange={(e) => setStealthMode(e.target.checked)}
                    className="rounded border-border bg-secondary/40 text-emerald-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" /> Discrete UI labels
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Neutral nav names only — overlay stays visible if you share your screen</p>
                  </div>
                </label>
              </div>

              {preflightLoading && (
                <p className="text-xs text-muted-foreground text-center">Checking audio readiness…</p>
              )}
              {preflight && preflight.errors.length > 0 && micPermission !== "denied" && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1">
                  {preflight.errors.map((err) => (
                    <p key={err} className="text-xs text-red-400">{err}</p>
                  ))}
                </div>
              )}
              {preflight && preflight.warnings.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1">
                  {preflight.warnings.map((w) => (
                    <p key={w} className="text-xs text-amber-600 dark:text-amber-300">{w}</p>
                  ))}
                </div>
              )}

              <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-primary/80">Coding capture</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  During a session, click <strong className="text-foreground">Capture</strong> (or{" "}
                  <kbd className="hotkey-badge">Ctrl+Shift+C</kbd>) to share your screen once, drag a box around the
                  question, and get a full AI answer. Costs 2 credits per capture answer.
                </p>
              </div>

              <details className="rounded-xl border border-border bg-secondary/10 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  Install guide &amp; system settings
                </summary>
                <div className="mt-3 pt-3 border-t border-border/60">
                  <OverlaySetupGuidePanel compact showDesktopInstall showTroubleshooting={false} />
                </div>
              </details>

              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-secondary/10 p-3">
                <input
                  type="checkbox"
                  checked={visibilityAck}
                  onChange={(e) => setVisibilityAck(e.target.checked)}
                  className="mt-0.5 rounded border-border bg-secondary/40 text-emerald-500"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Screen share visibility</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                    I understand the assistant remains visible to anyone viewing my screen share or recordings. It is not hidden from interviewers or proctors.
                  </p>
                </div>
              </label>

              {micPermission === "denied" && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-red-400 font-semibold">Microphone access blocked</p>
                      <p className="text-[11px] text-red-400/70 mt-0.5 leading-relaxed">
                        Your browser has blocked microphone access. Click the camera/lock icon in the address bar and allow microphone, then click "Try again" below.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={checkMicPermission}
                      className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 font-medium rounded-lg transition-all text-xs flex items-center justify-center gap-1.5"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      Try again
                    </button>
                    <button
                      onClick={() => window.location.reload()}
                      className="flex-1 py-2 bg-secondary/40 hover:bg-secondary/60 border border-border text-muted-foreground font-medium rounded-lg transition-all text-xs"
                    >
                      Reload page
                    </button>
                  </div>
                </div>
              )}

              {micPermission !== "granted" && micPermission !== "denied" && (
                <button
                  onClick={checkMicPermission}
                  disabled={micPermission === "checking"}
                  className="w-full py-2.5 bg-secondary/40 hover:bg-secondary/60 border border-border text-foreground font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                >
                  {micPermission === "checking" ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                      Checking permissions…
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      Allow microphone access
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((p) => p - 1)}
              className="flex items-center gap-1.5 px-5 py-3 bg-secondary/40 hover:bg-secondary/60 border border-border text-foreground rounded-xl transition-all text-sm font-medium"
            >
              <ChevronLeft className="w-4 h-4" />
              Back
            </button>
          )}

          {isLastStep ? (
            <button
              onClick={handleStart}
              disabled={
                micPermission === "denied" ||
                preflightLoading
              }
              className={cn(
                "flex-1 py-3.5 font-semibold rounded-xl transition-all flex items-center justify-center gap-2",
                micPermission === "denied" || preflightLoading
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-foreground"
              )}
            >
              <Zap className="w-4 h-4" />
              {sessionType === "live" ? "Start Practice Session" : "Start Mock Session"}
            </button>
          ) : (
            <button
              onClick={() => setStep((p) => p + 1)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-foreground font-semibold rounded-xl transition-all text-sm"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
