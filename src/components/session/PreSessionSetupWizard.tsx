import { useState, useEffect, useMemo, useRef } from "react";
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
import { createLevelAnalyser, enumerateAudioDevices, enumerateAudioOutputDevices, playSpeakerTestTone } from "@/lib/audio/audioCapture";
import type { AudioDevice } from "@/types/audio.types";
import { useDocuments } from "@/hooks/useDocuments";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { practiceContextsDB } from "@/lib/supabase/database";
import {
  unspecifiedLabel,
  shouldHydrateLastPracticeSetup,
} from "@/lib/session/practiceContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { isElectronApp } from "@/lib/platform/isElectron";
import { OverlaySetupGuidePanel } from "@/components/overlay/OverlaySetupGuidePanel";
import { OVERLAY_VISIBILITY_WARNING } from "@/lib/constants/overlaySetupGuide";
import { CreditExhaustedState, useCreditExhaustedState } from "@/components/billing/CreditExhaustedState";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  wizardRequiredFieldsBlocker,
  wizardStepBlocker,
} from "@/lib/session/wizardValidation";
import {
  isFreePlan,
  maxSessionMinutesForPlan,
} from "@/lib/constants/freeTier";
import {
  clampPreferredModel,
  hasProModelAccess,
  MODEL_OPTIONS as CANONICAL_MODEL_OPTIONS,
  normalizePreferredModel,
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
import { useAudioStore } from "@/store/audioStore";
import {
  formatPracticeSetupSummary,
  clearPracticeSetupDraft,
  loadLastPracticeSetup,
  loadPracticeSetupDraft,
  peekPendingPracticeSetup,
  savePracticeSetupDraft,
} from "@/lib/session/lastPracticeSetup";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import {
  INTERVIEW_COMPANIES,
  INTERVIEW_ROLES,
} from "@/lib/constants/interviewTargets";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_HOTKEYS } from "@/lib/constants/hotkeys";
import { Button } from "@/components/ui/Button";
import { SearchableCombobox } from "@/components/common/SearchableCombobox";
import { SessionContextChip } from "@/components/session/SessionContextChip";
import { AudioOkBadge } from "@/components/session/AudioOkBadge";
import { markPracticeStart } from "@/lib/analytics/uxMetrics";
import {
  RESPONSIBLE_USE_NOTICE,
  acceptResponsibleUseConsent,
  canStartCoachingSession,
} from "@/lib/overlay/responsibleUseConsent";

interface PreSessionSetupWizardProps {
  onStart: (config: LiveSessionConfig) => void;
  sessionType?: "live" | "mock";
}

import { INTERVIEW_TYPE_OPTIONS } from "@/lib/constants/interviewTypes";

const STEPS = [
  { id: 1, label: "Interview goal", icon: Users },
  { id: 2, label: "Context", icon: FileText },
  { id: 3, label: "Session settings", icon: Brain },
  { id: 4, label: "Device check", icon: Volume2 },
  { id: 5, label: "Review", icon: CheckCircle2 },
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
  const { profile, user } = useAuthStore();
  const { isExhausted: creditsExhausted } = useCreditExhaustedState();
  const {
    loadError: documentsLoadError,
    reload: reloadDocuments,
    allAnswers,
  } = useDocuments();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const overlayVisible = useOverlayStore((s) => s.is_visible);
  const resumes        = useDocumentStore((s) => s.resumes);
  const jds            = useDocumentStore((s) => s.jds);
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId     = useDocumentStore((s) => s.active_jd_id);

  const typedProfile = profile as unknown as UserProfile | null;
  const freePlan = isFreePlan(typedProfile?.plan_id);
  const canUseProModels = hasProModelAccess(typedProfile?.plan_id);
  useProviderFlags();
  useEffect(() => {
    void refreshProviderAvailability();
  }, []);
  const maxDuration = maxSessionMinutesForPlan(typedProfile?.plan_id);
  const durationOptions = freePlan ? [5] : [15, 30, 45, 60];

  const lastSetup = useMemo(() => loadLastPracticeSetup(), []);
  const practiceContextId = searchParams.get("context");
  const [showWizard, setShowWizard] = useState(
    () => sessionType === "live" || !lastSetup || Boolean(practiceContextId),
  );
  const [practiceQuestion, setPracticeQuestion] = useState<string | null>(null);
  const [contextLoadError, setContextLoadError] = useState<string | null>(null);
  const [quickAudioReady, setQuickAudioReady] = useState(false);

  const [step, setStep] = useState(1);

  // Step 1 — Session Type
  const [sessionCallType,  setSessionCallType]  = useState<"interview" | "regular_call">("interview");
  const [company,          setCompany]          = useState("");
  const [role,             setRole]             = useState("");
  const [interviewType,    setInterviewType]    = useState("behavioral");
  const [seniority,        setSeniority]        = useState("");
  const [industry,         setIndustry]         = useState("");
  const [interviewStage,   setInterviewStage]   = useState("");
  const [focusCompetencies, setFocusCompetencies] = useState<string[]>([]);
  const [topicsToAvoid,    setTopicsToAvoid]    = useState<string[]>([]);

  // Step 2 — Language & AI Settings
  const [language,         setLanguage]         = useState("English");
  const [simpleLanguage,   setSimpleLanguage]   = useState(false);
  const [instructions,     setInstructions]     = useState("");
  const [model,            setModel]            = useState<PreferredAIModel>(() =>
    clampPreferredModel(typedProfile?.preferred_model, typedProfile?.plan_id)
  );
  const [smartRouting,     setSmartRouting]     = useState(false);
  const [hintStyle,        setHintStyle]        = useState<HintStyle>(
    typedProfile?.hint_style ?? "short_hints"
  );
  const [textVoiceMode, setTextVoiceMode] = useState<"text" | "voice">("voice");
  const [ttsVoice, setTtsVoice] = useState<string | null>(null);
  const [availableTtsVoices, setAvailableTtsVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [followUpDepth, setFollowUpDepth] = useState<"none" | "light" | "deep">("light");
  const [feedbackStyle, setFeedbackStyle] = useState<"concise" | "balanced" | "detailed">("balanced");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("medium");
  const [answerBankContextIds, setAnswerBankContextIds] = useState<string[]>([]);
  const [durationMinutes, setDurationMinutes] = useState(freePlan ? 5 : 30);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const updateVoices = () => setAvailableTtsVoices(window.speechSynthesis.getVoices());
    updateVoices();
    window.speechSynthesis.addEventListener("voiceschanged", updateVoices);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", updateVoices);
  }, []);

  // Step 3 — Documents
  const [resumeId,         setResumeId]         = useState<string | null>(activeResumeId);
  const [jdId,             setJdId]             = useState<string | null>(activeJdId);
  const [extraDocIds,      setExtraDocIds]      = useState<string[]>([]);

  const skipDraftSave = useRef(true);
  useEffect(() => {
    const draft = loadPracticeSetupDraft();
    if (!draft) return;
    if (typeof draft.step === "number" && draft.step >= 1) setStep(draft.step);
    if (draft.company) setCompany(draft.company);
    if (draft.role) setRole(draft.role);
    if (draft.interviewType) setInterviewType(draft.interviewType);
    if (draft.resumeId) setResumeId(draft.resumeId);
    if (draft.jdId) setJdId(draft.jdId);
    if (draft.sessionCallType) setSessionCallType(draft.sessionCallType);
    if (draft.language) setLanguage(draft.language);
    if (draft.seniority) setSeniority(draft.seniority);
    if (draft.industry) setIndustry(draft.industry);
    if (draft.interviewStage) setInterviewStage(draft.interviewStage);
    if (draft.focusCompetencies) setFocusCompetencies(draft.focusCompetencies);
    if (draft.topicsToAvoid) setTopicsToAvoid(draft.topicsToAvoid);
    if (draft.answerBankContextIds) setAnswerBankContextIds(draft.answerBankContextIds);
    if (draft.textVoiceMode) setTextVoiceMode(draft.textVoiceMode);
    if (draft.ttsVoice) setTtsVoice(draft.ttsVoice);
    if (draft.followUpDepth) setFollowUpDepth(draft.followUpDepth);
    if (draft.feedbackStyle) setFeedbackStyle(draft.feedbackStyle);
    if (draft.durationMinutes) setDurationMinutes(draft.durationMinutes);
    if (draft.model) setModel(clampPreferredModel(draft.model as PreferredAIModel, typedProfile?.plan_id));
  }, []);

  useEffect(() => {
    if (skipDraftSave.current) {
      skipDraftSave.current = false;
      return;
    }
    savePracticeSetupDraft({
      step,
      company,
      role,
      interviewType,
      resumeId,
      jdId,
      sessionCallType,
      language,
      seniority,
      industry,
      interviewStage,
      focusCompetencies,
      topicsToAvoid,
      answerBankContextIds,
      textVoiceMode,
      ttsVoice,
      followUpDepth,
      feedbackStyle,
      durationMinutes,
      model,
    });
  }, [step, company, role, interviewType, resumeId, jdId, sessionCallType, language, seniority, industry, interviewStage, focusCompetencies, topicsToAvoid, answerBankContextIds, textVoiceMode, ttsVoice, followUpDepth, feedbackStyle, durationMinutes, model]);

  // Step 4 — Auto-Generate
  const [autoGenerate,     setAutoGenerate]     = useState(false);

  // Step 5 — Save Transcript
  const [saveTranscript,   setSaveTranscript]   = useState(true);

  // Step 6 — Connect
  const [enableSystemAudio, setEnableSystemAudio] = useState(true);
  const [stealthMode,        setStealthMode]       = useState(false);
  const [micPermission,      setMicPermission]     = useState<"unknown" | "granted" | "denied" | "checking">("unknown");
  const [micDevices,         setMicDevices]        = useState<AudioDevice[]>([]);
  const [selectedMicId,      setSelectedMicId]     = useState<string | null>(null);
  const [speakerDevices,     setSpeakerDevices]    = useState<AudioDevice[]>([]);
  const [selectedSpeakerId,  setSelectedSpeakerId] = useState<string | null>(null);
  const [speakerTested,      setSpeakerTested]     = useState(false);
  const [audioLevel,         setAudioLevel]        = useState(0);
  const permissionStreamRef = useRef<MediaStream | null>(null);
  const levelAnalyserRef = useRef<ReturnType<typeof createLevelAnalyser> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deepgramStatus = useAudioStore((state) => state.deepgram_status);
  const isCapturingAudio = useAudioStore((state) => state.streams?.is_capturing ?? false);
  const [speakerTesting,     setSpeakerTesting]    = useState(false);
  const [isOnline,           setIsOnline]          = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [preflight,          setPreflight]         = useState<PreflightReport | null>(null);
  const [preflightLoading,   setPreflightLoading]  = useState(false);
  const [visibilityAck,      setVisibilityAck]     = useState(false);
  const [responsibleUseAck,  setResponsibleUseAck] = useState(false);

  const systemAudioSupported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    "getDisplayMedia" in navigator.mediaDevices;

  useEffect(() => {
    if (!showWizard) setResumeId(activeResumeId);
  }, [activeResumeId, showWizard]);
  useEffect(() => {
    if (!showWizard) setJdId(activeJdId);
  }, [activeJdId, showWizard]);

  useEffect(() => {
    if (sessionType === "mock" && showWizard && lastSetup && shouldHydrateLastPracticeSetup({ practiceContextId })) {
      applyLastSetup(lastSetup);
    }
  }, [showWizard, lastSetup, practiceContextId, sessionType]);

  // Interview Day (and similar) can pass company/role via query or pending stash.
  // Answer Bank `?context=` must not merge lastSetup / pending / practicePrompt.
  useEffect(() => {
    if (practiceContextId) return;
    const pending = peekPendingPracticeSetup();
    const companyParam = searchParams.get("company")?.trim() || "";
    const roleParam = searchParams.get("role")?.trim() || "";
    if (pending) {
      applyLastSetup(pending);
      setShowWizard(true);
      if (pending.company || pending.role) {
        setCompany(pending.company ?? companyParam);
        setRole(pending.role ?? roleParam);
      }
      return;
    }
    if (companyParam || roleParam) {
      setShowWizard(true);
      if (companyParam) setCompany(companyParam);
      if (roleParam) setRole(roleParam);
    }
    const practicePrompt =
      typeof (location.state as { practicePrompt?: unknown } | null)?.practicePrompt === "string"
        ? (location.state as { practicePrompt: string }).practicePrompt.trim()
        : "";
    if (practicePrompt) {
      setShowWizard(true);
      setInstructions((prev) =>
        prev.includes(practicePrompt) ? prev : [practicePrompt, prev].filter(Boolean).join("\n\n"),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply once on mount / query change
  }, [searchParams, practiceContextId]);

  useEffect(() => {
    if (!practiceContextId || !user?.id) return;
    setShowWizard(true);
    setContextLoadError(null);
    let cancelled = false;
    void (async () => {
      try {
        const row = await practiceContextsDB.getOwned(user.id, practiceContextId);
        if (cancelled) return;
        if (!row) {
          setContextLoadError("This practice launch could not be found or you do not own it.");
          return;
        }
        const status = String(row.status ?? "");
        if (status === "expired" || status === "consumed") {
          setContextLoadError("This practice launch is no longer available.");
          return;
        }
        const question = String(row.question_text ?? "").trim();
        setPracticeQuestion(question || null);
        if (typeof row.role === "string" && row.role.trim()) setRole(row.role.trim());
        if (typeof row.company === "string" && row.company.trim()) setCompany(row.company.trim());
        if (typeof row.resume_id === "string" && row.resume_id) setResumeId(row.resume_id);
        if (typeof row.jd_id === "string" && row.jd_id) setJdId(row.jd_id);
        if (question) {
          setInstructions((prev) =>
            prev.includes(question) ? prev : [question, prev].filter(Boolean).join("\n\n"),
          );
        }
      } catch {
        if (!cancelled) setContextLoadError("Could not load this practice launch.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [practiceContextId, user?.id]);

  const activeSteps = STEPS;
  const totalSteps = activeSteps.length;
  const connectStep = 4;
  const resumeStep = 2;
  const voiceRequired = textVoiceMode === "voice";

  // Keep step in range when switching mobile ↔ desktop layouts (avoids
  // activeSteps[step - 1] being undefined → TypeError reading `.label`).
  useEffect(() => {
    setStep((prev) => {
      const max = activeSteps.length;
      if (prev < 1) return 1;
      if (prev > max) return max;
      return prev;
    });
  }, [activeSteps.length]);

  const currentStepMeta = activeSteps[Math.max(0, Math.min(step, activeSteps.length) - 1)];
  const currentStepLabel = currentStepMeta?.label ?? "Session Setup";

  function applyProfileDefaults() {
    const ownedResume =
      resumes.some((r) => r.id === activeResumeId) ? activeResumeId : (resumes[0]?.id ?? null);
    const ownedJd =
      jds.some((j) => j.id === activeJdId) ? activeJdId : (jds[0]?.id ?? null);
    setResumeId(ownedResume);
    setJdId(ownedJd);
    setModel(clampPreferredModel(typedProfile?.preferred_model, typedProfile?.plan_id));
    setHintStyle(typedProfile?.hint_style ?? "short_hints");
    setLanguage("English");
    setAutoGenerate(false);
    setSaveTranscript(true);
    setDurationMinutes(freePlan ? 5 : 30);
    setSessionCallType("interview");
    setInterviewType("behavioral");
    setSeniority("");
    setIndustry("");
    setInterviewStage("");
    setFocusCompetencies([]);
    setTopicsToAvoid([]);
    setAnswerBankContextIds([]);
    setEnableSystemAudio(systemAudioSupported);
    setStealthMode(false);
    setTextVoiceMode("voice");
    setTtsVoice(null);
    setFollowUpDepth("light");
    setFeedbackStyle("balanced");
    setDifficulty("medium");
  }

  function applyLastSetup(setup: LiveSessionConfig) {
    setSessionCallType(setup.session_call_type ?? "interview");
    setCompany(setup.company ?? "");
    setRole(setup.role ?? "");
    setInterviewType(setup.interview_type ?? "behavioral");
    setSeniority(setup.seniority ?? "");
    setIndustry(setup.industry ?? "");
    setInterviewStage(setup.interview_stage ?? "");
    setFocusCompetencies(setup.focus_competencies ?? []);
    setTopicsToAvoid(setup.topics_to_avoid ?? []);
    setAnswerBankContextIds(setup.answer_bank_context_ids ?? []);
    setLanguage(setup.language ?? "English");
    setSimpleLanguage(setup.simple_language ?? false);
    setInstructions(setup.instructions ?? "");
    setModel(
      clampPreferredModel(
        setup.model ?? typedProfile?.preferred_model,
        typedProfile?.plan_id,
      ),
    );
    setSmartRouting(setup.smart_routing ?? false);
    setHintStyle(setup.hint_style ?? typedProfile?.hint_style ?? "short_hints");
    // Never reuse another account's document IDs from localStorage (causes RLS 406).
    const ownedResumeId =
      (setup.resume_id && resumes.some((r) => r.id === setup.resume_id)
        ? setup.resume_id
        : null) ??
      (resumes.some((r) => r.id === activeResumeId) ? activeResumeId : null) ??
      resumes[0]?.id ??
      null;
    const ownedJdId =
      (setup.jd_id && jds.some((j) => j.id === setup.jd_id) ? setup.jd_id : null) ??
      (jds.some((j) => j.id === activeJdId) ? activeJdId : null) ??
      jds[0]?.id ??
      null;
    setResumeId(ownedResumeId);
    setJdId(ownedJdId);
    const primaryIds = new Set(
      [ownedResumeId, ownedJdId].filter((id): id is string => Boolean(id)),
    );
    const ctxIds = setup.context_document_ids ?? [];
    setExtraDocIds(ctxIds.filter((id) => !primaryIds.has(id)));
    setSaveTranscript(setup.save_transcript ?? true);
    const duration = setup.duration_minutes ?? (freePlan ? 5 : 30);
    setDurationMinutes(Math.min(duration, maxDuration));
    setEnableSystemAudio(setup.enable_system_audio ?? systemAudioSupported);
    setStealthMode(setup.stealth_mode ?? false);
    setTextVoiceMode(setup.text_voice_mode ?? "voice");
    setTtsVoice(setup.tts_voice ?? null);
    setFollowUpDepth(setup.follow_up_depth ?? "light");
    setFeedbackStyle(setup.feedback_style ?? "balanced");
    setDifficulty(setup.difficulty ?? "medium");
  }

  function handleUseDefaults() {
    applyProfileDefaults();
    if (isMobile) {
      setStep(connectStep);
    } else {
      setStep(connectStep);
    }
  }

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

  const checkMicPermission = async () => {
    setMicPermission("checking");
    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedMicId
          ? { deviceId: { exact: selectedMicId } }
          : true,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      permissionStreamRef.current?.getTracks().forEach((track) => track.stop());
      permissionStreamRef.current = stream;
      setMicPermission("granted");
      const devices = await enumerateAudioDevices();
      setMicDevices(devices);
      if (!selectedMicId && devices.length > 0) {
        setSelectedMicId((devices.find((d) => d.isDefault) ?? devices[0]).deviceId);
      }
      const outputs = await enumerateAudioOutputDevices();
      setSpeakerDevices(outputs);
      if (!selectedSpeakerId && outputs.length > 0) {
        setSelectedSpeakerId((outputs.find((d) => d.isDefault) ?? outputs[0]).deviceId);
      }
    } catch {
      setMicPermission("denied");
    }
  };

  useEffect(() => {
    if (!voiceRequired || micPermission !== "granted") return;
    const stream = permissionStreamRef.current;
    if (!stream) return;
    levelAnalyserRef.current?.disconnect();
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    try {
      levelAnalyserRef.current = createLevelAnalyser(stream);
      levelTimerRef.current = setInterval(() => {
        setAudioLevel(levelAnalyserRef.current?.getLevel() ?? 0);
      }, 100);
    } catch {
      setAudioLevel(0);
    }
    return () => {
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
      levelAnalyserRef.current?.disconnect();
      levelAnalyserRef.current = null;
      permissionStreamRef.current?.getTracks().forEach((track) => track.stop());
      permissionStreamRef.current = null;
    };
  }, [micPermission, voiceRequired]);

  useEffect(() => {
    if (step !== connectStep || !voiceRequired) return;
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
  }, [step, micPermission, connectStep, voiceRequired]);

  // Auto-prompt mic when landing on Connect (QA-078) — skip if already decided.
  useEffect(() => {
    if (step !== connectStep || !voiceRequired) return;
    if (micPermission !== "unknown") return;
    void checkMicPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- prompt once per visit to Connect
  }, [step, connectStep, voiceRequired]);

  useEffect(() => {
    if (micPermission !== "granted") return;
    void enumerateAudioDevices()
      .then((devices) => {
        setMicDevices(devices);
        if (!selectedMicId && devices.length > 0) {
          setSelectedMicId((devices.find((d) => d.isDefault) ?? devices[0]).deviceId);
        }
      })
      .catch(() => {});
    void enumerateAudioOutputDevices()
      .then((outputs) => {
        setSpeakerDevices(outputs);
        if (!selectedSpeakerId && outputs.length > 0) {
          setSelectedSpeakerId((outputs.find((d) => d.isDefault) ?? outputs[0]).deviceId);
        }
      })
      .catch(() => {});
  }, [micPermission, selectedMicId, selectedSpeakerId]);

  async function handleSpeakerTest() {
    setSpeakerTesting(true);
    try {
      const ok = await playSpeakerTestTone(selectedSpeakerId);
      if (ok) {
        setSpeakerTested(true);
        toast.success("Speaker test played — confirm you heard the beep.");
      } else {
        setSpeakerTested(false);
        toast.error("Could not play speaker test. Check your output device.");
      }
    } finally {
      setSpeakerTesting(false);
    }
  }

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  function handleStart() {
    const requiredBlocker = wizardRequiredFieldsBlocker({
      sessionCallType,
      role,
      hintStyle,
      model,
      smartRouting,
      resumeId,
    });
    if (requiredBlocker) {
      toast.message(requiredBlocker);
      return;
    }
    const gate = canStartCoachingSession({
      visibilityAcknowledged: visibilityAck,
      responsibleUseAcknowledged: responsibleUseAck,
      micGranted: !voiceRequired || micPermission === "granted",
    });
    if (!gate.ok) return;
    if (voiceRequired && preflight && !preflight.ready) return;
    if (!isOnline) return;
    if (voiceRequired && !speakerTested) {
      toast.message("Play the speaker test so we know you can hear session audio.");
      return;
    }
    acceptResponsibleUseConsent();
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
      model: smartRouting
        ? "gemini-flash"
        : clampPreferredModel(model, typedProfile?.plan_id),
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
      mic_device_id:        selectedMicId || null,
      practice_context_id:  practiceContextId,
      source_type:          practiceContextId ? "answer_bank" : undefined,
      seniority: seniority || null,
      industry: industry || null,
      interview_stage: interviewStage || null,
      focus_competencies: focusCompetencies,
      topics_to_avoid: topicsToAvoid,
      answer_bank_context_ids: answerBankContextIds,
      text_voice_mode: textVoiceMode,
      tts_voice: textVoiceMode === "voice" ? ttsVoice : null,
      follow_up_depth: followUpDepth,
      feedback_style: feedbackStyle,
      difficulty,
    };

    // Sync document selections into documentStore so AI context is correct
    const docStore = useDocumentStore.getState();
    docStore.setActiveResumeId(resumeId);
    docStore.setActiveJDId(jdId);

    const overlay = useOverlayStore.getState();
    overlay.setActiveModel(
      smartRouting
        ? "gemini-flash"
        : clampPreferredModel(model, typedProfile?.plan_id),
    );
    overlay.setHintStyle(hintStyle);
    overlay.setAutoGenerate(autoGenerate);
    overlay.setSimpleLanguage(simpleLanguage);
    overlay.setSaveTranscript(saveTranscript);
    overlay.setSessionCallType(sessionCallType);
    overlay.setSessionLanguage(language);
    setAppStealthMode(stealthMode);

    markPracticeStart({ source: "wizard" });
    onStart(config);
  }

  function startFromSavedSetup() {
    if (!lastSetup) return;
    const requiredBlocker = wizardRequiredFieldsBlocker({
      sessionCallType: lastSetup.session_call_type ?? "interview",
      role: lastSetup.role ?? "",
      hintStyle: lastSetup.hint_style,
      model: lastSetup.model,
      smartRouting: lastSetup.smart_routing,
      resumeId: lastSetup.resume_id,
    });
    if (requiredBlocker) {
      applyLastSetup(lastSetup);
      setShowWizard(true);
      toast.message(requiredBlocker);
      return;
    }
    applyLastSetup(lastSetup);
    const overlay = useOverlayStore.getState();
    overlay.setActiveModel(
      clampPreferredModel(lastSetup.model ?? typedProfile?.preferred_model, typedProfile?.plan_id),
    );
    overlay.setHintStyle(lastSetup.hint_style);
    overlay.setSimpleLanguage(lastSetup.simple_language ?? false);
    overlay.setSaveTranscript(lastSetup.save_transcript ?? true);
    overlay.setSessionCallType(lastSetup.session_call_type ?? "interview");
    overlay.setSessionLanguage(lastSetup.language ?? "English");
    setAppStealthMode(lastSetup.stealth_mode ?? false);
    useDocumentStore.getState().setActiveResumeId(lastSetup.resume_id ?? null);
    useDocumentStore.getState().setActiveJDId(lastSetup.jd_id ?? null);
    markPracticeStart({ source: "wizard" });
    onStart(lastSetup);
  }

  const canProceed = step < totalSteps;
  const isLastStep = step === totalSteps;
  const fieldOpts = {
    sessionCallType,
    role,
    hintStyle,
    model,
    smartRouting,
    resumeId,
  };
  const selectedResume = resumes.find((item) => item.id === resumeId);
  const selectedJd = jds.find((item) => item.id === jdId);
  const resumeParseStatus = String((selectedResume as { parse_status?: string } | undefined)?.parse_status ?? "");
  const jdParseStatus = String((selectedJd as { parse_status?: string } | undefined)?.parse_status ?? "");
  const documentBlocker =
    sessionCallType === "interview" && !selectedResume
      ? "Select a resume you own before continuing."
      : resumeParseStatus && !["ready", "completed"].includes(resumeParseStatus)
        ? "Wait for the selected resume to finish processing before continuing."
        : jdId && !selectedJd
          ? "The selected job description is no longer available. Choose it again."
          : jdParseStatus && !["ready", "completed"].includes(jdParseStatus)
            ? "Wait for the selected job description to finish processing before continuing."
            : null;
  const modelLock = smartRouting ? null : getModelLockReason(model, typedProfile?.plan_id);
  const modelBlocker =
    modelLock === "provider"
      ? "The selected AI provider is unavailable. Choose an available configured model."
      : modelLock === "plan"
        ? "The selected AI model requires a higher plan."
        : null;
  const stepBlocker = wizardStepBlocker({
    step,
    resumeStep,
    ...fieldOpts,
  });
  const startBlocker = wizardRequiredFieldsBlocker(fieldOpts) ?? documentBlocker ?? modelBlocker;

  useEffect(() => {
    if (isMobile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && canProceed) {
        const target = e.target as HTMLElement;
        if (target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
        const blocker = wizardStepBlocker({
          step,
          resumeStep,
          ...fieldOpts,
        });
        if (blocker) {
          toast.message(blocker);
          return;
        }
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
  }, [step, canProceed, isMobile, resumeStep, sessionCallType, role, hintStyle, model, smartRouting, resumeId]);

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

  if (contextLoadError) {
    return (
      <div className="w-full">
        <InlineErrorRetry
          message={contextLoadError}
          onRetry={() => {
            setContextLoadError(null);
            navigate("/app/answer-bank");
          }}
        />
      </div>
    );
  }

  if (sessionType === "mock" && !showWizard && lastSetup && !practiceContextId) {
    const quickResumeTitle =
      resumes.find((r) => r.id === (lastSetup.resume_id ?? activeResumeId))?.title ?? null;
    const quickLanguage = lastSetup.language ?? "English";

    return (
      <div className="w-full space-y-5">
          <div className="text-left sm:text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium">
              <Radio className="w-3.5 h-3.5 animate-pulse" aria-hidden />
              Ready to practice
            </div>
            <h2 className="text-xl font-bold text-foreground">Start {PRODUCT_NAMES.practiceCoach}</h2>
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
          <AudioOkBadge onReady={setQuickAudioReady} />
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
            onClick={() => {
              applyLastSetup(lastSetup);
              if (quickAudioReady) {
                startFromSavedSetup();
                return;
              }
              setShowWizard(true);
              setStep(connectStep);
            }}
          >
            {quickAudioReady ? "Start Practice Session" : "Continue — check mic & speaker"}
          </Button>
          <button
            type="button"
            onClick={() => {
              applyLastSetup(lastSetup);
              setShowWizard(true);
              setStep(1);
            }}
            className="w-full text-sm text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            Change setup
          </button>
        </div>
    );
  }

  return (
    <div className="w-full space-y-6">

        {/* Header */}
        <div className="text-left sm:text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium mb-4">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            Session Setup
          </div>
          <h2 className="text-xl font-bold text-foreground">
            {currentStepLabel}
          </h2>
          <div className="mt-2 flex justify-center">
            {step !== resumeStep && (
            <SessionContextChip
              resumeLabel={
                resumes.find((r) => r.id === resumeId)?.title ??
                (resumeId ? "Selected resume" : null)
              }
              language={language}
            />
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Estimated usage: ~{AI_CREDIT_COSTS.live_hint} credits/hint ·{" "}
            {AI_CREDIT_COSTS.live_answer} credits/full answer
          </p>
          {lastSetup && !practiceContextId && (
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Back to one-click start
            </button>
          )}
        </div>

        {practiceContextId && (
          <div
            className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left space-y-2"
            data-testid="practice-context-review"
          >
            <p className="text-sm font-semibold text-foreground">
              Practicing answer: {practiceQuestion || unspecifiedLabel(null)}
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li>Role: {unspecifiedLabel(role)}</li>
              <li>Company: {unspecifiedLabel(company)}</li>
              <li>
                Resume:{" "}
                {unspecifiedLabel(resumes.find((r) => r.id === resumeId)?.title ?? null)}
              </li>
              <li>
                Job description:{" "}
                {unspecifiedLabel(jds.find((j) => j.id === jdId)?.role_title ?? null)}
              </li>
            </ul>
            <p className="text-[11px] text-amber-200">
              These fields stay Not specified unless you set them. Profile values are optional defaults — they are never applied silently.
            </p>
            <button
              type="button"
              onClick={() => applyProfileDefaults()}
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Use profile defaults
            </button>
            {overlayVisible && (
              <p className="text-xs text-amber-300">
                A session is already running. Starting this practice will replace it.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            </div>
            {allAnswers.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Answer Bank context</label>
                <select
                  multiple
                  value={answerBankContextIds}
                  onChange={(e) => setAnswerBankContextIds(Array.from(e.target.selectedOptions).map((option) => option.value).slice(0, 10))}
                  className="w-full min-h-20 bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm"
                >
                  {allAnswers.slice(0, 50).map((answer) => (
                    <option key={answer.id} value={answer.id}>{answer.question || answer.title || "Saved answer"}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

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
          {activeSteps.map((s, i) => {
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
                {i < activeSteps.length - 1 && (
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Company (optional)
                    </label>
                      <SearchableCombobox
                        value={company}
                        onChange={setCompany}
                        options={[...INTERVIEW_COMPANIES]}
                        placeholder="Search or type a company…"
                        searchPlaceholder="Search companies…"
                        allowCustom
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                      Role {sessionCallType === "interview" ? "(required)" : "(optional)"}
                    </label>
                      <SearchableCombobox
                        value={role}
                        onChange={setRole}
                        options={[...INTERVIEW_ROLES]}
                        placeholder="Search or type a role…"
                        searchPlaceholder="Search roles…"
                        allowCustom
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      ["Seniority", seniority, setSeniority, ["Intern", "Junior", "Mid", "Senior", "Lead", "Manager"]],
                      ["Interview stage", interviewStage, setInterviewStage, ["Phone screen", "Technical", "Onsite", "Final round", "HR"]],
                      ["Industry", industry, setIndustry, ["Technology", "Finance", "Healthcare", "Consulting", "Education", "Other"]],
                    ].map(([label, value, setter, options]) => (
                      <div key={String(label)}>
                        <label className="block text-xs font-medium text-muted-foreground mb-1.5">{String(label)}</label>
                        <select
                          value={String(value)}
                          onChange={(e) => (setter as (value: string) => void)(e.target.value)}
                          className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-4 py-2.5 text-sm"
                        >
                          <option value="">Not specified</option>
                          {(options as string[]).map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Practice objective</label>
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value.slice(0, 2000))}
                      placeholder="What do you want to improve in this session?"
                      rows={2}
                      className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-4 py-2.5 text-sm resize-none"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Step 2: Language & AI Settings ────────────────── */}
          {step === 3 && (
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
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {canUseProModels
                        ? "Routes to the optimal model based on question complexity."
                        : "Free plans use Gemini. Upgrade to Pro for GPT-4o and Claude routing."}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {CANONICAL_MODEL_OPTIONS.map((m) => {
                      const lock = getModelLockReason(m.value, typedProfile?.plan_id);
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
                            "text-left px-3 py-2 rounded-xl border text-sm transition-all",
                            locked && "opacity-50 cursor-not-allowed",
                            !locked && model === m.value
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                              : !locked && "bg-secondary/40 border-border text-muted-foreground hover:border-border"
                          )}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <p className="font-medium text-xs">{m.label}</p>
                            {lock === "provider" && (
                              <span className="text-[9px] font-semibold text-red-400">Unavailable</span>
                            )}
                            {lock === "plan" && (
                              <span className="text-[9px] font-semibold text-amber-400">Pro</span>
                            )}
                          </div>
                          <p className="text-[10px] mt-0.5 opacity-60">{m.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Response mode</label>
                  <select value={textVoiceMode} onChange={(e) => setTextVoiceMode(e.target.value as "text" | "voice")} className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm">
                    <option value="voice">Voice</option><option value="text">Text only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Follow-up depth</label>
                  <select value={followUpDepth} onChange={(e) => setFollowUpDepth(e.target.value as typeof followUpDepth)} className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm">
                    <option value="none">No follow-ups</option><option value="light">Light</option><option value="deep">Deep</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Feedback style</label>
                  <select value={feedbackStyle} onChange={(e) => setFeedbackStyle(e.target.value as typeof feedbackStyle)} className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm">
                    <option value="concise">Concise</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option>
                  </select>
                </div>
                {textVoiceMode === "voice" && (
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">TTS voice</label>
                    <select value={ttsVoice ?? ""} onChange={(e) => setTtsVoice(e.target.value || null)} className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm">
                      <option value="">Browser default</option>
                      {availableTtsVoices.map((voice) => (
                        <option key={`${voice.name}-${voice.lang}`} value={voice.name}>{voice.name} ({voice.lang})</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Difficulty</label>
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as typeof difficulty)} className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm">
                    <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Duration</label>
                  <select value={durationMinutes} onChange={(e) => setDurationMinutes(Math.min(Number(e.target.value), maxDuration))} className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm">
                    {durationOptions.map((duration) => <option key={duration} value={duration}>{duration} minutes</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3 / Mobile step 1: Documents ─────────────────────────────── */}
          {step === resumeStep && (
            <div className="space-y-5">
              <p className="text-xs text-muted-foreground">Attach documents to give the AI more context about you and the role.</p>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                  <FileText className="w-3.5 h-3.5" /> Resume {sessionCallType === "interview" ? "(required)" : "(optional)"}
                </label>
                {resumeId && resumes.some((r) => r.id === resumeId) ? (
                  <p className="text-sm text-foreground rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
                    Using <span className="font-medium">{resumes.find((r) => r.id === resumeId)?.title || "your selected resume"}</span>
                    <button
                      type="button"
                      className="ml-2 text-xs text-primary hover:underline"
                      onClick={() => setResumeId(null)}
                    >
                      Change
                    </button>
                  </p>
                ) : (
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
                )}
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
                    <option key={j.id} value={j.id}>
                      {(j as { title?: string; role_title?: string }).title ||
                        (j as { role_title?: string }).role_title ||
                        j.company_name ||
                        "Untitled JD"}
                    </option>
                  ))}
                </select>
              </div>

              {documentsLoadError && (
                <InlineErrorRetry
                  message={`Could not load documents: ${documentsLoadError}`}
                  onRetry={() => void reloadDocuments()}
                  compact
                />
              )}

              {resumes.length === 0 && jds.length === 0 && !documentsLoadError && (
                <EmptyState
                  icon={BookOpen}
                  title="No documents uploaded yet"
                  description="Upload a resume or JD in Documents, then return here."
                  actionLabel="Open Documents"
                  onAction={() => navigate("/app/documents")}
                  compact
                  className="bg-secondary/20 border border-border rounded-xl"
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Focus competencies</label>
                  <input value={focusCompetencies.join(", ")} onChange={(e) => setFocusCompetencies(e.target.value.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 8))} placeholder="Leadership, system design, SQL" className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Topics to avoid</label>
                  <input value={topicsToAvoid.join(", ")} onChange={(e) => setTopicsToAvoid(e.target.value.split(",").map((v) => v.trim()).filter(Boolean).slice(0, 8))} placeholder="Optional" className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              {allAnswers.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Answer Bank context</label>
                  <select multiple value={answerBankContextIds} onChange={(e) => setAnswerBankContextIds(Array.from(e.target.selectedOptions).map((option) => option.value).slice(0, 10))} className="w-full min-h-20 bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 text-sm">
                    {allAnswers.slice(0, 50).map((answer) => <option key={answer.id} value={answer.id}>{answer.question || answer.title || "Saved answer"}</option>)}
                  </select>
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
          {step === 3 && sessionCallType === "regular_call" && autoGenerate && (
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
          {step === 3 && sessionCallType === "regular_call" && saveTranscript && (
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

          {/* ── Step 6 / Mobile step 2: Connect ───────────────────────────────── */}
          {step === connectStep && (
            <div className="space-y-5">
              {!isMobile && (
              <>
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
                  {!isMobile && (
                    <li>For <strong className="text-foreground">system audio</strong> capture, enable "Share tab audio" when screen-sharing</li>
                  )}
                </ol>
              </div>
              </>
              )}

              {isMobile && (
                <div className="bg-blue-500/5 border border-blue-500/15 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-blue-400">Ready on mobile</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Allow microphone access below. The coach opens as a bottom sheet — tap <strong className="text-foreground">Expand</strong> anytime for full controls.
                  </p>
                </div>
              )}

              {!isMobile && (
              <>
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Session Summary</p>
                {[
                  { label: "Type",          value: sessionCallType === "interview" ? `Interview · ${INTERVIEW_TYPE_OPTIONS.find(t=>t.value===interviewType)?.label ?? interviewType}` : "Regular Call" },
                  { label: "Model",         value: smartRouting ? "Smart Routing" : CANONICAL_MODEL_OPTIONS.find(m=>m.value===normalizePreferredModel(model))?.label },
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
              </>
              )}

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

              <div className="rounded-xl border border-border bg-secondary/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Audio activity</span>
                  <span className="text-[11px] text-muted-foreground">
                    {voiceRequired ? `${Math.round(audioLevel * 100)}%` : "Text-only mode"}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Microphone audio level"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(audioLevel * 100)}
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div className="h-full rounded-full bg-emerald-500 transition-[width]" style={{ width: `${Math.min(100, Math.round(audioLevel * 100))}%` }} />
                </div>
                {voiceRequired && micPermission === "granted" && audioLevel < 0.01 && (
                  <p className="text-[11px] text-amber-300">Speak near the selected microphone to confirm activity.</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-border px-3 py-2">
                  <span className="text-muted-foreground">STT / WebSocket</span>
                  <strong className="ml-2 capitalize text-foreground">{voiceRequired ? deepgramStatus : "not required"}</strong>
                </div>
                <div className="rounded-lg border border-border px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Desktop application</span>
                  <strong className="ml-2 text-foreground">{isElectronApp() ? "available" : "optional — browser mode active"}</strong>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <span className="text-muted-foreground">Audio</span>
                  <strong className="ml-2 text-foreground">{isCapturingAudio ? "capturing" : voiceRequired ? "ready to connect" : "text input"}</strong>
                </div>
                <div className="rounded-lg border border-border px-3 py-2">
                  <span className="text-muted-foreground">Network</span>
                  <strong className="ml-2 text-foreground">{isOnline ? "online" : "offline"}</strong>
                </div>
              </div>

              {!isMobile && (
              <div className="bg-primary/5 border border-primary/15 rounded-xl p-3 space-y-2">
                <p className="text-xs font-semibold text-primary/80">Coding capture</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  During a session, click <strong className="text-foreground">Capture</strong> (or{" "}
                  <kbd className="hotkey-badge">{DEFAULT_HOTKEYS.CAPTURE_CODING.keys}</kbd>) to share your screen once, drag a box around the
                  question, and get a full AI answer. Costs 2 credits per capture answer.
                </p>
              </div>
              )}

              {!isMobile && (
              <details className="rounded-xl border border-border bg-secondary/10 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                  Install guide &amp; system settings
                </summary>
                <div className="mt-3 pt-3 border-t border-border/60">
                  <OverlaySetupGuidePanel compact showDesktopInstall showTroubleshooting={false} />
                </div>
              </details>
              )}

              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-border bg-secondary/10 p-3 min-h-11">
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

              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 min-h-11">
                <input
                  type="checkbox"
                  checked={responsibleUseAck}
                  onChange={(e) => setResponsibleUseAck(e.target.checked)}
                  className="mt-0.5 rounded border-border bg-secondary/40 text-emerald-500"
                />
                <div>
                  <p className="text-sm font-medium text-foreground">Responsible use</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                    {RESPONSIBLE_USE_NOTICE}
                  </p>
                </div>
              </label>

              {micPermission === "granted" && micDevices.length > 0 && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                    <Volume2 className="w-3.5 h-3.5" /> Microphone
                  </label>
                  <select
                    value={selectedMicId ?? ""}
                    onChange={(e) => setSelectedMicId(e.target.value || null)}
                    className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
                  >
                    {micDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {micPermission === "granted" && (
                <div className="space-y-2">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Volume2 className="w-3.5 h-3.5" /> Speakers / headphones
                  </label>
                  {speakerDevices.length > 0 ? (
                    <select
                      value={selectedSpeakerId ?? ""}
                      onChange={(e) => {
                        setSelectedSpeakerId(e.target.value || null);
                        setSpeakerTested(false);
                      }}
                      className="w-full bg-secondary/40 border border-border text-foreground rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
                    >
                      {speakerDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Speaker ${d.deviceId.slice(0, 6)}`}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      Using system default output. Play a test tone to confirm you can hear audio.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleSpeakerTest()}
                    disabled={speakerTesting}
                    className={cn(
                      "w-full py-2.5 border font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm",
                      speakerTested
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                        : "bg-secondary/40 hover:bg-secondary/60 border-border text-foreground",
                    )}
                  >
                    {speakerTesting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                        Playing test…
                      </>
                    ) : speakerTested ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Speaker OK — play again
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4" />
                        Play speaker test
                      </>
                    )}
                  </button>
                  {!speakerTested && (
                    <p className="text-[10px] text-muted-foreground">
                      Required before starting so you can hear coaching audio.
                    </p>
                  )}
                </div>
              )}

              {!isOnline && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
                    You appear to be offline. Reconnect before starting a session.
                  </p>
                </div>
              )}

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

          {step === 5 && (
            <div className="space-y-4" aria-live="polite">
              <p className="text-sm text-muted-foreground">Review every setting before starting. You can go back to change any value.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {[
                  ["Interview type", INTERVIEW_TYPE_OPTIONS.find((item) => item.value === interviewType)?.label ?? interviewType],
                  ["Target role", role || "Not specified"],
                  ["Company", company || "Not specified"],
                  ["Seniority", seniority || "Not specified"],
                  ["Industry", industry || "Not specified"],
                  ["Interview stage", interviewStage || "Not specified"],
                  ["Language", language],
                  ["Resume", resumes.find((item) => item.id === resumeId)?.title ?? (resumeId ? "Selected" : "None")],
                  ["Job Description", jds.find((item) => item.id === jdId)?.role_title ?? (jdId ? "Selected" : "None")],
                  ["Difficulty", difficulty],
                  ["Duration", `${durationMinutes} minutes`],
                  ["Mode", textVoiceMode === "voice" ? "Voice" : "Text only"],
                  ["TTS voice", textVoiceMode === "voice" ? (ttsVoice || "Browser default") : "Not used"],
                  ["Follow-up depth", followUpDepth],
                  ["Feedback", feedbackStyle],
                  ["AI model", smartRouting ? "Configured smart routing" : (CANONICAL_MODEL_OPTIONS.find((item) => item.value === normalizePreferredModel(model))?.label ?? model)],
                  ["Focus competencies", focusCompetencies.length ? focusCompetencies.join(", ") : "None"],
                  ["Topics to avoid", topicsToAvoid.length ? topicsToAvoid.join(", ") : "None"],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 rounded-lg border border-border bg-secondary/20 px-3 py-2">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-right font-medium text-foreground">{value}</span>
                  </div>
                ))}
              </div>
              {textVoiceMode === "text" && (
                <p className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-blue-200">
                  Text-only fallback is selected. Microphone, speaker, and speech-to-text checks are not required.
                </p>
              )}
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-xs text-muted-foreground space-y-1.5">
                <p className="font-semibold text-foreground">Privacy and session controls</p>
                <p><strong className="text-foreground">Overlay:</strong> visible to anyone viewing your screen; normal screen sharing does not hide it.</p>
                <p><strong className="text-foreground">Transcript:</strong> {saveTranscript ? "saved for your account and review" : "shown during the session but not retained"}.</p>
                <p><strong className="text-foreground">Audio:</strong> used for the selected voice/STT session and not silently captured outside the active session.</p>
                <p><strong className="text-foreground">Credits:</strong> AI answers, hints, and debrief generation use the displayed plan credits.</p>
                <p><strong className="text-foreground">End:</strong> use End Session in the session controls or the configured session shortcut.</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex flex-col gap-2">
          {isMobile && step === resumeStep && (
            <button
              type="button"
              onClick={handleUseDefaults}
              className="w-full py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl transition-colors min-h-11"
            >
              Use defaults — skip to microphone
            </button>
          )}
        {isLastStep && <AudioOkBadge />}

        {stepBlocker && !isLastStep && (
          <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
            {stepBlocker}
          </p>
        )}
        {isLastStep && startBlocker && (
          <p role="status" className="text-xs text-amber-600 dark:text-amber-400">
            {startBlocker}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              clearPracticeSetupDraft();
              navigate("/app/dashboard");
            }}
            className="px-4 py-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-xl"
          >
            Save and Exit
          </button>
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
                Boolean(startBlocker) ||
                (voiceRequired && micPermission !== "granted") ||
                !visibilityAck ||
                !responsibleUseAck ||
                preflightLoading ||
                !isOnline ||
                (voiceRequired && !speakerTested)
              }
              className={cn(
                "flex-1 py-3.5 font-semibold rounded-xl transition-all flex items-center justify-center gap-2",
                Boolean(startBlocker) ||
                  (voiceRequired && micPermission !== "granted") ||
                  !visibilityAck ||
                  !responsibleUseAck ||
                  preflightLoading ||
                  !isOnline ||
                  (voiceRequired && !speakerTested)
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-foreground"
              )}
            >
              <Zap className="w-4 h-4" />
              {sessionType === "live" ? "Start Practice Session" : "Start Mock Session"}
            </button>
          ) : (
            <button
              onClick={() => {
                if (stepBlocker || (step === resumeStep && documentBlocker) || (step === 3 && modelBlocker)) {
                  toast.message(stepBlocker ?? documentBlocker ?? modelBlocker ?? "");
                  return;
                }
                setStep((p) => p + 1);
              }}
              disabled={Boolean(stepBlocker || (step === resumeStep && documentBlocker) || (step === 3 && modelBlocker))}
              className="flex-1 flex items-center justify-center gap-1.5 py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-foreground font-semibold rounded-xl transition-all text-sm"
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
