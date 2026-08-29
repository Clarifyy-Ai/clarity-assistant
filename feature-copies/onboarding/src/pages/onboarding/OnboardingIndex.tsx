// ─────────────────────────────────────────────────────────────────────────────
// OnboardingIndex.tsx — Master onboarding orchestrator (2-step flow).
// Step 1: Essentials (~60s) · Step 2: Optional setup (accordion).
// On complete: persist profile, seed lastPracticeSetup, navigate to Dashboard.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useAuthStore } from "@/store";
import { recordReferral, getStoredRefCode, normalizeRefCode } from "@/lib/referrals";
import { ONBOARDING_COMPLETION_PATH } from "@/lib/routes/canonical";
import { saveLastPracticeSetup } from "@/lib/session/lastPracticeSetup";
import { markOnboardingComplete } from "@/lib/analytics/uxMetrics";
import {
  clearOnboardingDraft,
  loadOnboardingDraft,
  saveOnboardingDraft,
} from "@/lib/onboarding/draft";
import { normalizePreferredModel, toDbPreferredModel } from "@/lib/ai/modelOptions";
import { OnboardingProgress } from "@/components/onboarding/OnboardingProgress";

import OnboardingStep1Essentials from "./OnboardingStep1Essentials";
import OnboardingStep2OptionalSetup from "./OnboardingStep2OptionalSetup";

import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { LiveSessionConfig } from "@/types/session.types";
import type { HintStyle } from "@/types/user.types";

export type { OnboardingData } from "@/types/onboarding.types";
import type { OnboardingData } from "@/types/onboarding.types";

const INITIAL_ONBOARDING_DATA: OnboardingData = {
  targetRole:         "",
  targetCompanies:    [],
  jobDescription:     "",
  yearsOfExperience:  0,
  // No pre-selected experience level — the user must choose explicitly.
  currentLevel:       "",


  techStack:          [],
  interviewTypes:     ["behavioral"],
  preferredModel:     "gemini-flash",
  preferredLanguage:  "en-US",
  overlayEnabled:     true,
  audioAnalysis:      true,
  emailNotifications: true,
  selectedMicId:      "default",
  audioVerified:      false,
  resumeFileId:       null,
  resumeFileName:     null,
  skipResume:         false,
  interviewAnxiety:   3,
  industry:           "",
  interviewDate:      "",
  improvementGoals:   [],
  difficulty:         "medium",
};

const TOTAL_STEPS = 2;

function mapHintStyle(style?: string): HintStyle {
  if (style === "keywords") return "keywords_only";
  if (style === "full_answer" || style === "short_hints" || style === "keywords_only") {
    return style;
  }
  return "short_hints";
}

function buildLiveSetupFromOnboarding(
  data: OnboardingData,
  responseStyle?: string | null,
): LiveSessionConfig {
  const interviewType = data.interviewTypes?.[0] ?? "behavioral";
  const company = data.targetCompanies?.[0] ?? null;

  return {
    company,
    role: data.targetRole || null,
    hint_style: mapHintStyle(responseStyle ?? undefined),
    model: normalizePreferredModel(data.preferredModel),
    smart_routing: false,
    stealth_mode: false,
    resume_id: data.skipResume ? null : data.resumeFileId,
    jd_id: null,
    interview_type: interviewType,
    instructions: "",
    enable_system_audio: true,
    mic_device_id: data.selectedMicId !== "default" ? data.selectedMicId : undefined,
    noise_suppression: true,
    save_transcript: true,
    session_call_type: "interview",
    language: data.preferredLanguage === "en-US" ? "English" : data.preferredLanguage,
  };
}

export default function OnboardingIndex() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isOnboarded = useAuthStore((s) => s.isOnboarded);
  const isProfileLoaded = useAuthStore((s) => s.isProfileLoaded);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  const isRerun = searchParams.get("rerun") === "1";
  const refCode = normalizeRefCode(searchParams.get("ref")) ?? getStoredRefCode();

  const restored = !isRerun ? loadOnboardingDraft() : null;
  const [currentStep, setCurrentStep] = useState(restored?.step ?? 1);
  const [data, setData] = useState<OnboardingData>({
    ...INITIAL_ONBOARDING_DATA,
    ...(restored?.data ?? {}),
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hydratedFromProfile, setHydratedFromProfile] = useState(Boolean(restored));

  useEffect(() => {
    if (isProfileLoaded && isOnboarded && !isRerun) {
      navigate(ONBOARDING_COMPLETION_PATH, { replace: true });
    }
  }, [isProfileLoaded, isOnboarded, isRerun, navigate]);

  // Restore step + known profile fields when localStorage draft is missing
  // (new device / cleared storage) so users do not drop back to empty step 1.
  useEffect(() => {
    if (isRerun || !isProfileLoaded || !profile || hydratedFromProfile) return;
    const stepRaw = Number((profile as { onboarding_step?: number }).onboarding_step ?? 1);
    const step = stepRaw >= 2 ? 2 : 1;
    setCurrentStep(step);
    setData((prev) => {
      const next: OnboardingData = {
        ...prev,
        targetRole: profile.target_role ?? prev.targetRole,
        yearsOfExperience:
          profile.years_of_exp ?? profile.experience_years ?? prev.yearsOfExperience,
        preferredModel: profile.preferred_model ?? prev.preferredModel,
        preferredLanguage:
          profile.preferred_language ?? profile.stt_language ?? prev.preferredLanguage,
        selectedMicId: profile.audio_input_device ?? prev.selectedMicId,
        emailNotifications: profile.email_notifications ?? prev.emailNotifications,
        industry: profile.industry ?? prev.industry,
        interviewDate: profile.interview_date ?? prev.interviewDate,
      };
      const prefs =
        profile.notification_prefs &&
        typeof profile.notification_prefs === "object" &&
        !Array.isArray(profile.notification_prefs)
          ? (profile.notification_prefs as Record<string, unknown>)
          : {};
      if (typeof prefs.experience_level === "string" && prefs.experience_level) {
        next.currentLevel = prefs.experience_level;
      }
      saveOnboardingDraft(step, next);
      return next;
    });
    setHydratedFromProfile(true);
  }, [isRerun, isProfileLoaded, profile, hydratedFromProfile]);

  useEffect(() => {
    if (!isRerun || !profile) return;
    setData((prev) => ({
      ...prev,
      targetRole:        profile.target_role ?? prev.targetRole,
      targetCompanies:   (profile as { target_companies?: string[] }).target_companies ?? prev.targetCompanies,
      yearsOfExperience: profile.years_of_exp ?? profile.experience_years ?? prev.yearsOfExperience,
      preferredModel:    profile.preferred_model ?? prev.preferredModel,
      preferredLanguage: profile.preferred_language ?? profile.stt_language ?? prev.preferredLanguage,
      selectedMicId:     profile.audio_input_device ?? prev.selectedMicId,
      overlayEnabled:    prev.overlayEnabled,
      emailNotifications: profile.email_notifications ?? prev.emailNotifications,
    }));
  }, [isRerun, profile]);

  const mergeData = useCallback((partial: Partial<OnboardingData>) => {
    setData((prev) => {
      const next = { ...prev, ...partial };
      saveOnboardingDraft(currentStep, next);
      return next;
    });
  }, [currentStep]);

  const goToStep = useCallback((step: number) => {
    setCurrentStep(step);
    saveOnboardingDraft(step, data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [data]);

  const finishOnboarding = useCallback(async (lastStepData?: Partial<OnboardingData>) => {
    const finalData = lastStepData ? { ...data, ...lastStepData } : data;
    const role = finalData.targetRole?.trim();
    const level = finalData.currentLevel?.trim();

    // Hard gate: Skip and Complete both need Essentials role + level (QA-054).
    if (!role || !level) {
      toast.message(
        !role && !level
          ? "Choose a target role and experience level before continuing."
          : !role
            ? "Choose a target role before continuing."
            : "Choose an experience level before continuing.",
      );
      return;
    }

    setIsSaving(true);

    try {
      if (user?.id && refCode) {
        await recordReferral(user.id, refCode);
      }

      await updateProfile({
        onboarding_completed: true,
        onboarding_step: 99,
        target_role:          role,
        preferred_model:      toDbPreferredModel(finalData.preferredModel),
        experience_years:
          finalData.yearsOfExperience ??
          (level === "junior"
            ? 1
            : level === "senior"
              ? 6
              : level === "staff"
                ? 10
                : level === "intern"
                  ? 0
                  : 3),
        notification_prefs: {
          ...((profile as { notification_prefs?: Record<string, unknown> } | null)
            ?.notification_prefs ?? {}),
          experience_level: level,
          interview_types: finalData.interviewTypes,
          interview_difficulty: finalData.difficulty || "medium",
          ...(typeof finalData.interviewAnxiety === "number"
            ? { interview_anxiety: finalData.interviewAnxiety }
            : {}),
        },
        ...(finalData.selectedMicId
          ? { audio_input_device: finalData.selectedMicId }
          : {}),
        ...(finalData.industry ? { industry: finalData.industry, domain: finalData.industry } : {}),
        ...(finalData.interviewDate ? { interview_date: finalData.interviewDate } : {}),
        ...(finalData.improvementGoals?.length
          ? { improvement_goals: finalData.improvementGoals, interview_weaknesses: finalData.improvementGoals }
          : {}),
      } as Record<string, unknown>);

      // Best-effort welcome mail — never block or roll back completion
      // (RESEND_API_KEY missing → 503 PROVIDER_UNAVAILABLE).
      if (user?.email) {
        void fetchEdgeJson("send-email", {
          to: user.email,
          type: "welcome",
          data: {
            name: profile?.full_name?.split(" ")[0] ?? "there",
          },
        }).catch((emailErr) => {
          console.warn("[OnboardingIndex] welcome email failed:", emailErr);
        });
      }

      await loadProfile();

      const freshProfile = useAuthStore.getState().profile;
      saveLastPracticeSetup(
        buildLiveSetupFromOnboarding(
          finalData,
          freshProfile?.response_style as string | undefined,
        ),
      );

      markOnboardingComplete();
      clearOnboardingDraft();

      navigate(ONBOARDING_COMPLETION_PATH, { replace: true });
    } catch (err) {
      console.error("[OnboardingIndex] Failed to save onboarding:", err);
      const message =
        err instanceof Error ? err.message : "Could not save onboarding. Please try again.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [data, updateProfile, loadProfile, user, profile, refCode, navigate]);

  const handleNext = useCallback((stepData?: Partial<OnboardingData>) => {
    if (stepData) mergeData(stepData);

    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1);
    } else {
      finishOnboarding(stepData);
    }
  }, [currentStep, mergeData, goToStep, finishOnboarding]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) goToStep(currentStep - 1);
  }, [currentStep, goToStep]);

  const handleSkipRerun = useCallback(() => {
    navigate(ONBOARDING_COMPLETION_PATH, { replace: true });
  }, [navigate]);

  const stepProps = {
    data,
    onNext: handleNext,
    onBack: handleBack,
    onSkip: (extra?: Partial<OnboardingData>) => {
      void finishOnboarding(extra);
    },
    onChange: mergeData,
    isFirstStep: currentStep === 1,
    isLastStep:  currentStep === TOTAL_STEPS,
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/20 to-background">
      <header className="sticky top-0 z-10 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/90 flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">C</span>
            </div>
            <span className="font-semibold text-sm tracking-tight">Clarify AI</span>
          </div>

          <div className="hidden sm:block flex-1 max-w-xs mx-4">
            <OnboardingProgress current={currentStep} />
          </div>

          {isRerun && profile?.onboarding_completed && (
            <button
              type="button"
              onClick={handleSkipRerun}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              Skip to dashboard
            </button>
          )}

          {!isRerun && <div className="w-16" />}
        </div>

        <div className="sm:hidden px-4 pb-3">
          <OnboardingProgress current={currentStep} />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="sr-only" role="status" aria-live="polite">
          {currentStep === 1 ? "Step 1 of 2: Quick essentials" : "Step 2 of 2: Optional setup"}
        </p>

        {isSaving && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Saving your preferences…</p>
            </div>
          </div>
        )}

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
            {currentStep === 1 && (
              <OnboardingStep1Essentials
                {...stepProps}
                onNext={goNext}
                onBack={goBack}
              />
            )}

            {currentStep === 2 && (
              <OnboardingStep2OptionalSetup
                {...stepProps}
                onNext={goNext}
                onBack={goBack}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {!isSaving && currentStep === 1 && !isRerun && (
        <div className="pb-8 text-center space-y-2 px-4">
          <button
            type="button"
            onClick={() => {
              const role = data.targetRole?.trim();
              const level = data.currentLevel?.trim();
              if (!role || !level) {
                toast.message(
                  !role && !level
                    ? "Choose a target role and experience level before skipping."
                    : !role
                      ? "Choose a target role before skipping."
                      : "Choose an experience level before skipping.",
                );
                return;
              }
              void finishOnboarding();
            }}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline underline-offset-4 transition-colors"
          >
            Skip optional setup — go to Dashboard
          </button>
          <p className="text-[10px] text-muted-foreground/50 max-w-sm mx-auto">
            Skip still needs a target role and experience level. You can start Practice Coach from the Dashboard anytime.
          </p>
        </div>
      )}
    </div>
  );
}
