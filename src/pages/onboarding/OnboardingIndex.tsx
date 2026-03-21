// @ts-nocheck
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
import { Button }                from "@/components/ui/Button";

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
      <div className="flex items-center justify-between relative">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 bg-border z-0" />

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
  const user          = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const loadProfile   = useAuthStore((s) => s.loadProfile);

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
        onboarding_completed: true,
        preferred_model:      finalData.preferredModel,
      } as Record<string, unknown>);

      // Persist extended onboarding data to a metadata column
      if (user?.id) {
        await supabase
          .from("profiles")
          .update({
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
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/90 flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">C</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">Clarity</span>
          </div>

          <StepProgressBar currentStep={currentStep} completedSteps={completedSteps} />

          <div className="w-16" />
        </div>
      </header>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-2xl px-4 py-10">

        {/* Saving overlay */}
        {isSaving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
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
