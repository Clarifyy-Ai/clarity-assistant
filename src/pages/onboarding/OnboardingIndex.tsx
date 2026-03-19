// ─────────────────────────────────────────────────────────────────────────────
// OnboardingIndex.tsx — Multi-step onboarding orchestrator.
// Manages step state, progress persistence, validation gating,
// animated transitions, and final profile commit to Supabase.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { useNavigate }                      from "react-router-dom";
import { motion, AnimatePresence }          from "framer-motion";

import { supabase }          from "@/integrations/supabase/client";
import { useAuthStore }      from "@/store";
import { ROUTES }            from "@/lib/constants";
import { cn }                from "@/lib/utils";

import { Button }            from "@/components/ui/button";
import { Progress }          from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
}                            from "@/components/ui/tooltip";

import {
  CheckCircle2, ChevronLeft,
  ChevronRight, Loader2, Sparkles,
}                            from "lucide-react";

import OnboardingStep1Role          from "./OnboardingStep1Role";
import OnboardingStep2Experience    from "./OnboardingStep2Experience";
import OnboardingStep3Preferences   from "./OnboardingStep3Preferences";
import OnboardingStep4AudioSetup    from "./OnboardingStep4AudioSetup";
import OnboardingStep5ResumeUpload  from "./OnboardingStep5ResumeUpload";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingData {
  // Step 1 — Role
  targetRole:       string;
  targetCompanies:  string[];
  interviewType:    string;

  // Step 2 — Experience
  yearsOfExperience: number;
  experienceLevel:   string;
  currentTitle:      string;
  techStack:         string[];

  // Step 3 — Preferences
  preferredModel:    string;
  preferredLanguage: string;
  overlayEnabled:    boolean;
  emailNotifications: boolean;

  // Step 4 — Audio
  audioDeviceId:     string;
  audioSetupSkipped: boolean;
  audioVerified:     boolean;

  // Step 5 — Resume
  resumeId:          string | null;
  resumeSkipped:     boolean;
}

interface StepConfig {
  id:          number;
  key:         keyof OnboardingData | "role" | "experience" | "preferences" | "audio" | "resume";
  label:       string;
  description: string;
  optional:    boolean;
}

// ─── Step Definitions ─────────────────────────────────────────────────────────

const STEPS: StepConfig[] = [
  {
    id:          1,
    key:         "role",
    label:       "Your Goal",
    description: "What role are you targeting?",
    optional:    false,
  },
  {
    id:          2,
    key:         "experience",
    label:       "Experience",
    description: "Tell us about your background.",
    optional:    false,
  },
  {
    id:          3,
    key:         "preferences",
    label:       "Preferences",
    description: "Customise your AI setup.",
    optional:    false,
  },
  {
    id:          4,
    key:         "audio",
    label:       "Audio",
    description: "Set up your microphone.",
    optional:    true,
  },
  {
    id:          5,
    key:         "resume",
    label:       "Resume",
    description: "Upload your resume for better answers.",
    optional:    true,
  },
];

const TOTAL_STEPS = STEPS.length;

// ─── Initial Data ─────────────────────────────────────────────────────────────

const INITIAL_DATA: OnboardingData = {
  targetRole:          "",
  targetCompanies:     [],
  interviewType:       "mixed",
  yearsOfExperience:   0,
  experienceLevel:     "mid",
  currentTitle:        "",
  techStack:           [],
  preferredModel:      "gpt-4o",
  preferredLanguage:   "en-US",
  overlayEnabled:      true,
  emailNotifications:  true,
  audioDeviceId:       "",
  audioSetupSkipped:   false,
  audioVerified:       false,
  resumeId:            null,
  resumeSkipped:       false,
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({
  steps,
  currentStep,
  completedSteps,
}: {
  steps:          StepConfig[];
  currentStep:    number;
  completedSteps: Set<number>;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center justify-center gap-2">
        {steps.map((step, index) => {
          const isActive    = step.id === currentStep;
          const isCompleted = completedSteps.has(step.id);
          const isPast      = step.id < currentStep;

          return (
            <Tooltip key={step.id}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  {/* Step bubble */}
                  <motion.div
                    layout
                    className={cn(
                      "relative flex items-center justify-center rounded-full transition-all duration-300 cursor-default",
                      isActive
                        ? "h-9 w-9 bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-2 ring-primary/30"
                        : isCompleted || isPast
                          ? "h-7 w-7 bg-primary/20 text-primary"
                          : "h-7 w-7 bg-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted && !isActive ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <span className={cn("font-semibold", isActive ? "text-sm" : "text-xs")}>
                        {step.id}
                      </span>
                    )}

                    {/* Active pulse ring */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-full bg-primary/20"
                        animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    )}
                  </motion.div>

                  {/* Connector line (not after last step) */}
                  {index < steps.length - 1 && (
                    <div className="h-px w-8 sm:w-12">
                      <motion.div
                        className="h-full bg-primary/40 origin-left"
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: isPast || isCompleted ? 1 : 0 }}
                        transition={{ duration: 0.4 }}
                      />
                      <div
                        className={cn(
                          "h-full -mt-px transition-colors duration-300",
                          isPast || isCompleted ? "bg-transparent" : "bg-border"
                        )}
                      />
                    </div>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <p className="font-medium">{step.label}</p>
                <p className="text-muted-foreground">{step.description}</p>
                {step.optional && (
                  <p className="text-muted-foreground italic">Optional</p>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

// ─── Slide Variants ───────────────────────────────────────────────────────────

const slideVariants = {
  enter: (dir: number) => ({
    x:       dir > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x:       0,
    opacity: 1,
  },
  exit: (dir: number) => ({
    x:       dir > 0 ? -60 : 60,
    opacity: 0,
  }),
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function OnboardingIndex() {
  const navigate = useNavigate();
  const { user, updateProfile, loadProfile } = useAuthStore((s) => ({
    user:          s.user,
    updateProfile: s.updateProfile,
    loadProfile:   s.loadProfile,
  }));

  const [currentStep,    setCurrentStep]    = useState(1);
  const [direction,      setDirection]      = useState(1);   // 1 = forward, -1 = back
  const [data,           setData]           = useState<OnboardingData>(INITIAL_DATA);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isSubmitting,   setIsSubmitting]   = useState(false);
  const [submitError,    setSubmitError]    = useState<string | null>(null);

  // ── Restore progress from localStorage ──────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem("onboarding_progress");
      if (saved) {
        const parsed = JSON.parse(saved) as {
          step: number;
          data: Partial<OnboardingData>;
          completed: number[];
        };
        setCurrentStep(parsed.step ?? 1);
        setData((prev) => ({ ...prev, ...parsed.data }));
        setCompletedSteps(new Set(parsed.completed ?? []));
      }
    } catch {
      // Ignore corrupt storage
    }
  }, []);

  // ── Persist progress to localStorage ────────────────────────────────────────

  useEffect(() => {
    try {
      localStorage.setItem(
        "onboarding_progress",
        JSON.stringify({
          step:      currentStep,
          data,
          completed: [...completedSteps],
        })
      );
    } catch {
      // Storage quota exceeded — non-fatal
    }
  }, [currentStep, data, completedSteps]);

  // ── Data update callback passed to every step ────────────────────────────────

  const updateData = useCallback((updates: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...updates }));
  }, []);

  // ── Validate current step before advancing ───────────────────────────────────

  const isStepValid = useCallback((): boolean => {
    switch (currentStep) {
      case 1:
        return data.targetRole.trim().length > 0 && data.interviewType.length > 0;
      case 2:
        return data.experienceLevel.length > 0;
      case 3:
        return data.preferredModel.length > 0;
      case 4:
        // Audio is optional — valid if skipped or verified
        return data.audioSetupSkipped || data.audioVerified;
      case 5:
        // Resume is optional — valid if skipped or uploaded
        return data.resumeSkipped || data.resumeId !== null;
      default:
        return true;
    }
  }, [currentStep, data]);

  // ── Navigation ───────────────────────────────────────────────────────────────

  const goNext = useCallback(async () => {
    if (!isStepValid()) return;

    setCompletedSteps((prev) => new Set([...prev, currentStep]));

    if (currentStep === TOTAL_STEPS) {
      await handleFinish();
      return;
    }

    setDirection(1);
    setCurrentStep((s) => s + 1);
  }, [currentStep, isStepValid]);

  const goBack = useCallback(() => {
    if (currentStep === 1) return;
    setDirection(-1);
    setCurrentStep((s) => s - 1);
  }, [currentStep]);

  // ── Skip current optional step ───────────────────────────────────────────────

  const skipStep = useCallback(() => {
    if (currentStep === 4) updateData({ audioSetupSkipped: true });
    if (currentStep === 5) updateData({ resumeSkipped: true });
    setDirection(1);
    setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS));
    if (currentStep === TOTAL_STEPS) handleFinish();
  }, [currentStep, updateData]);

  // ── Final submission ─────────────────────────────────────────────────────────

  const handleFinish = useCallback(async () => {
    if (!user?.id) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await updateProfile({
        onboarding_completed: true,
        preferred_model:      data.preferredModel,
        preferred_language:   data.preferredLanguage,
        ui_preferences: {
          overlayEnabled:      data.overlayEnabled,
          emailNotifications:  data.emailNotifications,
          colorScheme:         "indigo",
          theme:               "system",
        } as Record## `src/pages/onboarding/` — 2 Missing Files

---

### 1. `src/pages/onboarding/OnboardingIndex.tsx`

```tsx
// ─────────────────────────────────────────────────────────────────────────────
// OnboardingIndex.tsx — Master onboarding orchestrator.
// Manages step progression, shared state across all 5 steps,
// persistence to Supabase, and final profile completion.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import { useNavigate }                       from "react-router-dom";
import { motion, AnimatePresence }           from "framer-motion";

import { supabase }          from "@/integrations/supabase/client";
import { useAuthStore }      from "@/store";
import { ROUTES }            from "@/lib/constants";
import { cn }                from "@/lib/utils";

import OnboardingStep1Role         from "./OnboardingStep1Role";
import OnboardingStep2Experience   from "./OnboardingStep2Experience";
import OnboardingStep3Preferences  from "./OnboardingStep3Preferences";
import OnboardingStep4AudioSetup   from "./OnboardingStep4AudioSetup";
import OnboardingStep5ResumeUpload from "./OnboardingStep5ResumeUpload";

import { CheckCircle2, Loader2 } from "lucide-react";
import { Button }                from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OnboardingData {
  // Step 1 — Role
  targetRole:       string;
  targetCompanies:  string[];
  jobDescription:   string;

  // Step 2 — Experience
  yearsOfExperience: number;
  currentLevel:      string;
  techStack:         string[];
  interviewTypes:    string[];

  // Step 3 — Preferences
  preferredModel:    string;
  preferredLanguage: string;
  overlayEnabled:    boolean;
  audioAnalysis:     boolean;
  emailNotifications: boolean;

  // Step 4 — Audio (device IDs only — stream handled inside step)
  selectedMicId:     string;
  audioVerified:     boolean;

  // Step 5 — Resume
  resumeFileId:      string | null;
  resumeFileName:    string | null;
  skipResume:        boolean;
}

const INITIAL_ONBOARDING_DATA: OnboardingData = {
  targetRole:         "",
  targetCompanies:    [],
  jobDescription:     "",
  yearsOfExperience:  0,
  currentLevel:       "mid",
  techStack:          [],
  interviewTypes:     ["behavioral"],
  preferredModel:     "gpt-4o",
  preferredLanguage:  "en-US",
  overlayEnabled:     true,
  audioAnalysis:      true,
  emailNotifications: true,
  selectedMicId:      "default",
  audioVerified:      false,
  resumeFileId:       null,
  resumeFileName:     null,
  skipResume:         false,
};

// ─── Step Config ──────────────────────────────────────────────────────────────

interface StepConfig {
  id:          number;
  label:       string;
  description: string;
  skippable:   boolean;
}

const STEPS: StepConfig[] = [
  { id: 1, label: "Role",       description: "Your target position",    skippable: false },
  { id: 2, label: "Experience", description: "Your background",         skippable: false },
  { id: 3, label: "Settings",   description: "App preferences",         skippable: true  },
  { id: 4, label: "Audio",      description: "Microphone setup",        skippable: true  },
  { id: 5, label: "Resume",     description: "Upload your CV",          skippable: true  },
];

const TOTAL_STEPS = STEPS.length;

// ─── Step Progress Bar ────────────────────────────────────────────────────────

function StepProgressBar({
  currentStep,
  completedSteps,
}: {
  currentStep:    number;
  completedSteps: Set<number>;
}) {
  return (
    <div className="w-full max-w-lg mx-auto px-4">
      {/* Step dots + connectors */}
      <div className="flex items-center justify-between relative">
        {/* Background connector line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-border z-0" />

        {/* Filled progress line */}
        <motion.div
          className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary z-0 origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: (currentStep - 1) / (TOTAL_STEPS - 1) }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />

        {STEPS.map((step) => {
          const isDone    = completedSteps.has(step.id);
          const isCurrent = step.id === currentStep;
          const isFuture  = step.id > currentStep;

          return (
            <div key={step.id} className="relative z-10 flex flex-col items-center gap-1.5">
              {/* Dot */}
              <motion.div
                layout
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                  isDone    && "bg-primary border-primary text-primary-foreground",
                  isCurrent && "bg-background border-primary text-primary ring-4 ring-primary/20",
                  isFuture  && "bg-background border-border text-muted-foreground"
                )}
                whileHover={!isFuture ? { scale: 1.1 } : {}}
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-bold">{step.id}</span>
                )}
              </motion.div>

              {/* Label — only show on md+ */}
              <span className={cn(
                "hidden md:block text-[11px] font-medium whitespace-nowrap transition-colors",
                isCurrent ? "text-primary"         : "",
                isDone    ? "text-muted-foreground" : "",
                isFuture  ? "text-muted-foreground/50" : ""
              )}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Current step description */}
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Step {currentStep} of {TOTAL_STEPS} — {STEPS[currentStep - 1]?.description}
      </p>
    </div>
  );
}

// ─── Completion Screen ────────────────────────────────────────────────────────

function CompletionScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 px-4"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 14, delay: 0.15 }}
        className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30"
      >
        <CheckCircle2 className="h-14 w-14 text-green-600 dark:text-green-400" />
      </motion.div>

      <div className="space-y-2">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-3xl font-bold tracking-tight"
        >
          You're all set! 🎉
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-muted-foreground max-w-sm mx-auto"
        >
          Your profile is ready. Head to the dashboard to start your first
          practice session or jump straight into a live interview.
        </motion.p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col sm:flex-row gap-3"
      >
        <Button size="lg" onClick={onContinue} className="min-w-40">
          Go to dashboard
        </Button>
      </motion.div>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OnboardingIndex() {
  const navigate    = useNavigate();
  const { user, updateProfile, loadProfile } = useAuthStore((s) => ({
    user:          s.user,
    updateProfile: s.updateProfile,
    loadProfile:   s.loadProfile,
  }));

  const [currentStep,    setCurrentStep]    = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [data,           setData]           = useState<OnboardingData>(INITIAL_ONBOARDING_DATA);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isComplete,     setIsComplete]     = useState(false);

  // Redirect if already onboarded
  useEffect(() => {
    const profile = useAuthStore.getState().profile;
    if (profile?.onboarding_completed) {
      navigate(ROUTES.DASHBOARD, { replace: true });
    }
  }, [navigate]);

  // ── Data merge helper ──────────────────────────────────────────────────────

  const mergeData = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => ({ ...prev, ...partial }));
  }, []);

  // ── Step navigation ────────────────────────────────────────────────────────

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handleNext = useCallback((stepData?: Partial<OnboardingData>) => {
    if (stepData) mergeData(stepData);

    setCompletedSteps((prev) => new Set(prev).add(currentStep));

    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1);
    } else {
      handleFinish(stepData);
    }
  }, [currentStep, mergeData, goToStep]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const handleSkip = useCallback(() => {
    setCompletedSteps((prev) => new Set(prev).add(currentStep));
    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1);
    } else {
      handleFinish();
    }
  }, [currentStep, goToStep]);

  // ── Persist to Supabase ────────────────────────────────────────────────────

  const handleFinish = useCallback(async (lastStepData?: Partial<OnboardingData>) => {
    const finalData = lastStepData ? { ...data, ...lastStepData } : data;

    setIsSaving(true);

    try {
      await updateProfile({
        // Map onboarding answers → profile columns
        onboarding_completed: true,
        preferred_model:      finalData.preferredModel,
        preferred_language:   finalData.preferredLanguage,
        ui_preferences: {
          overlayEnabled:     finalData.overlayEnabled,
          audioAnalysis:      finalData.audioAnalysis,
          emailNotifications: finalData.emailNotifications,
        },
        overlay_settings: {
          enabled:     finalData.overlayEnabled,
          defaultMic:  finalData.selectedMicId,
        },
      } as Parameters<typeof updateProfile>);

      // Persist extended onboarding data to a metadata column
      if (user?.id) {
        await supabase
          .from("profiles")
          .update({
            // Store extra fields the profile schema may have as jsonb
            metadata: {
              targetRole:        finalData.targetRole,
              targetCompanies:   finalData.targetCompanies,
              yearsOfExperience: finalData.yearsOfExperience,
              currentLevel:      finalData.currentLevel,
              techStack:         finalData.techStack,
              interviewTypes:    finalData.interviewTypes,
              resumeFileId:      finalData.resumeFileId,
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      }

      await loadProfile();
      setIsComplete(true);
    } catch (err) {
      console.error("[OnboardingIndex] Failed to save onboarding:", err);
      // Still complete — don't block the user
      setIsComplete(true);
    } finally {
      setIsSaving(false);
    }
  }, [data, updateProfile, loadProfile, user]);

  // ── Redirect to dashboard ─────────────────────────────────────────────────

  const handleContinueToDashboard = useCallback(() => {
    navigate(ROUTES.DASHBOARD, { replace: true });
  }, [navigate]);

  // ─── Shared step props ─────────────────────────────────────────────────────

  const stepProps = {
    data,
    onNext: handleNext,
    onBack: handleBack,
    onSkip: handleSkip,
    isFirstStep: currentStep === 1,
    isLastStep:  currentStep === TOTAL_STEPS,
  };

  // ── Slide animation variants ──────────────────────────────────────────────

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 60 : -60,
      opacity: 0,
    }),
    center: { x: 0, opacity: 1 },
    exit: (direction: number) => ({
      x: direction > 0 ? -60 : 60,
      opacity: 0,
    }),
  };

  const [slideDirection, setSlideDirection] = useState(1);

  const goNext = useCallback((stepData?: Partial<OnboardingData>) => {
    setSlideDirection(1);
    handleNext(stepData);
  }, [handleNext]);

  const goBack = useCallback(() => {
    setSlideDirection(-1);
    handleBack();
  }, [handleBack]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">

      {/* ── Header / Branding ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          {/* Logo mark */}
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/90 flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">C</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">Clarity</span>
          </div>

          {/* Step indicator (compact) */}
          {!isComplete && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {currentStep} / {TOTAL_STEPS}
            </span>
          )}
        </div>
      </header>

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      {!isComplete && (
        <div className="py-6 border-b border-border/30 bg-background/60">
          <StepProgressBar
            currentStep={currentStep}
            completedSteps={completedSteps}
          />
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-4 py-10">

        {/* Saving overlay */}
        {isSaving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Saving your preferences…</p>
            </div>
          </div>
        )}

        {/* Completion screen */}
        {isComplete ? (
          <CompletionScreen onContinue={handleContinueToDashboard} />
        ) : (
          <AnimatePresence mode="wait" custom={slideDirection}>
            <motion.div
              key={currentStep}
              custom={slideDirection}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.28, ease: "easeInOut" }}
            >
              {/* ── Step 1: Role ─────────────────────────────────────────── */}
              {currentStep === 1 && (
                <OnboardingStep1Role
                  {...stepProps}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}

              {/* ── Step 2: Experience ───────────────────────────────────── */}
              {currentStep === 2 && (
                <OnboardingStep2Experience
                  {...stepProps}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}

              {/* ── Step 3: Preferences ──────────────────────────────────── */}
              {currentStep === 3 && (
                <OnboardingStep3Preferences
                  {...stepProps}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}

              {/* ── Step 4: Audio Setup ───────────────────────────────────── */}
              {currentStep === 4 && (
                <OnboardingStep4AudioSetup
                  {...stepProps}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}

              {/* ── Step 5: Resume Upload ─────────────────────────────────── */}
              {currentStep === 5 && (
                <OnboardingStep5ResumeUpload
                  {...stepProps}
                  onNext={goNext}
                  onBack={goBack}
                />
              )}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* ── Skip onboarding entirely (escape hatch) ────────────────────────── */}
      {!isComplete && currentStep === 1 && (
        <div className="pb-8 text-center">
          <button
            type="button"
            onClick={() => handleFinish()}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-4 transition-colors"
          >
            Skip setup and go to dashboard
          </button>
        </div>
      )}
    </div>
  );
}
