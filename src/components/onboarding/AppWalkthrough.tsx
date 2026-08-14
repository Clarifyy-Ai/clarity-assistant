import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Mic,
  ClipboardList,
  FlaskConical,
  FileText,
  Zap,
  Sparkles,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import {
  hasCompletedAppWalkthrough,
  markAppWalkthroughCompleted,
} from "@/lib/onboarding/appWalkthroughStorage";
import { Button } from "@/components/ui/Button";

type TourPlacement = "center" | "right" | "bottom";

type TourStep = {
  id: string;
  icon: typeof Mic;
  title: string;
  description: string;
  target: string | null;
  placement: TourPlacement;
};

const STEPS: TourStep[] = [
  {
    id: "welcome",
    icon: Sparkles,
    title: `Welcome to ${PRODUCT_NAMES.brand}`,
    description:
      "This quick tour shows where to practice, build answers, and track progress. It only appears once.",
    target: null,
    placement: "center",
  },
  {
    id: "practice-coach",
    icon: Mic,
    title: PRODUCT_NAMES.practiceCoach,
    description:
      "Run live rehearsal sessions with real-time transcription and AI talking points on your practice overlay.",
    target: "nav-practice-coach",
    placement: "right",
  },
  {
    id: "mock-interview",
    icon: ClipboardList,
    title: PRODUCT_NAMES.mockInterview,
    description:
      "Full mock interviews with structured feedback and debriefs — great before a real interview.",
    target: "nav-mock-interview",
    placement: "right",
  },
  {
    id: "prep-lab",
    icon: FlaskConical,
    title: PRODUCT_NAMES.prepLab,
    description:
      "Draft STAR answers, run gap analysis, and sharpen stories for common question types.",
    target: "nav-prep-lab",
    placement: "right",
  },
  {
    id: "documents",
    icon: FileText,
    title: PRODUCT_NAMES.documents,
    description:
      "Upload your resume and job descriptions so AI hints stay tailored to your background.",
    target: "nav-documents",
    placement: "right",
  },
  {
    id: "credits",
    icon: Zap,
    title: "Credits & plans",
    description:
      "Each AI hint uses credits. Free includes monthly credits; upgrade anytime from the top bar.",
    target: "topbar-credits",
    placement: "bottom",
  },
  {
    id: "finish",
    icon: Mic,
    title: "You're ready to practice",
    description:
      "Start with Practice Coach when you're ready. Remember: Clarify AI is for mock and rehearsal only.",
    target: null,
    placement: "center",
  },
];

const PADDING = 10;
const TOUR_Z = 300;

function useTargetRect(targetId: string | null, enabled: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  const measure = useCallback(() => {
    if (!enabled || !targetId) {
      setRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${targetId}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [enabled, targetId]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!enabled) return;

    measure();
    const delayed = [100, 350].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      delayed.forEach(window.clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [enabled, measure]);

  return rect;
}

function TourCard({
  step,
  stepIndex,
  totalSteps,
  onBack,
  onNext,
  onSkip,
  style,
  className,
}: {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  style?: CSSProperties;
  className?: string;
}): JSX.Element {
  const Icon = step.icon;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-walkthrough-title"
      className={cn(
        "w-[min(100vw-2rem,22rem)] rounded-2xl border border-border bg-background p-5 shadow-2xl",
        className,
      )}
      style={style}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip tour
        </button>
      </div>

      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>

      <h2 id="app-walkthrough-title" className="text-lg font-bold text-foreground">
        {step.title}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.description}</p>

      <div className="mt-4 flex gap-1.5">
        {STEPS.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              i <= stepIndex ? "bg-primary" : "bg-secondary",
            )}
          />
        ))}
      </div>

      <div className="mt-5 flex items-center gap-2">
        {!isFirst && (
          <Button type="button" variant="outline" size="sm" onClick={onBack} className="gap-1">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Button>
        )}
        <div className="flex-1" />
        {isLast ? (
          <Link
            to="/app/live"
            onClick={onNext}
            className="inline-flex items-center justify-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Open Practice Coach
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <Button type="button" size="sm" onClick={onNext} className="gap-1">
            Next
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function cardPosition(
  rect: DOMRect | null,
  placement: TourPlacement,
): CSSProperties {
  if (!rect || placement === "center") {
    return {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: TOUR_Z + 1,
    };
  }

  const gap = 16;
  const cardWidth = 352;
  const cardHeight = 280;

  if (placement === "right") {
    let left = rect.right + gap;
    let top = rect.top + rect.height / 2 - cardHeight / 2;

    if (left + cardWidth > window.innerWidth - 16) {
      left = Math.max(16, rect.left - cardWidth - gap);
    }
    top = Math.min(Math.max(16, top), window.innerHeight - cardHeight - 16);

    return { position: "fixed", left, top, zIndex: TOUR_Z + 1 };
  }

  let left = rect.left + rect.width / 2 - cardWidth / 2;
  let top = rect.bottom + gap;
  left = Math.min(Math.max(16, left), window.innerWidth - cardWidth - 16);
  if (top + cardHeight > window.innerHeight - 16) {
    top = rect.top - cardHeight - gap;
  }

  return { position: "fixed", left, top: Math.max(16, top), zIndex: TOUR_Z + 1 };
}

export function AppWalkthrough(): JSX.Element | null {
  const userId = useAuthStore((s) => s.user?.id);
  const onboardingCompleted = useAuthStore((s) => s.profile?.onboarding_completed);
  const location = useLocation();
  const hideOnSettings = location.pathname.includes("/settings");

  const setMobileNavOpen = useUIStore((s) => s.setMobileNavOpen);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const setActiveTourStep = useUIStore((s) => s.setActiveTourStep);

  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const step = STEPS[stepIndex];
  const targetRect = useTargetRect(step.target, open);

  const finish = useCallback(() => {
    if (userId) markAppWalkthroughCompleted(userId);
    try {
      sessionStorage.setItem("clarify:walkthrough-done-session", "1");
    } catch {
      /* ignore */
    }
    setActiveTourStep(null);
    setOpen(false);
    setMobileNavOpen(false);
  }, [userId, setActiveTourStep, setMobileNavOpen]);

  useEffect(() => {
    if (!userId || !onboardingCompleted || hideOnSettings) return;
    if (hasCompletedAppWalkthrough(userId)) return;

    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [userId, onboardingCompleted, hideOnSettings]);

  useEffect(() => {
    if (!open) {
      setActiveTourStep(null);
      return;
    }

    setActiveTourStep(step.id);

    const isMobile = window.matchMedia("(max-width: 767px)").matches;
    if (step.target?.startsWith("nav-")) {
      if (isMobile) setMobileNavOpen(true);
      else setSidebarCollapsed(false);
    }

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open, step.id, step.target, setActiveTourStep, setMobileNavOpen, setSidebarCollapsed]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, finish]);

  if (!open || !userId) return null;

  const handleNext = () => {
    if (stepIndex >= STEPS.length - 1) {
      finish();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const cardStyle = cardPosition(
    step.placement === "center" ? null : targetRect,
    step.placement,
  );

  return (
    <div className="fixed inset-0" style={{ zIndex: TOUR_Z }} aria-hidden={false}>
      {step.placement === "center" || !targetRect ? (
        <div className="absolute inset-0 bg-black/75" onClick={finish} aria-hidden />
      ) : (
        <>
          <div className="absolute inset-0 bg-black/40" onClick={finish} aria-hidden />
          <div
            className="pointer-events-none absolute rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent"
            style={{
              left: targetRect.left - PADDING,
              top: targetRect.top - PADDING,
              width: targetRect.width + PADDING * 2,
              height: targetRect.height + PADDING * 2,
              boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            }}
          />
        </>
      )}

      <TourCard
        step={step}
        stepIndex={stepIndex}
        totalSteps={STEPS.length}
        onBack={handleBack}
        onNext={handleNext}
        onSkip={finish}
        style={cardStyle}
      />
    </div>
  );
}
