import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Circle, ChevronRight, ChevronDown, X } from "lucide-react";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { cn } from "@/lib/utils";

import { localStorageGetWithLegacy, localStorageSetBrand } from "@/lib/constants/brandStorage";

const DISMISS_STORAGE_KEY = "career-pilot-setup-banner-dismissed";
const LEGACY_DISMISS_KEYS = ["clarify-setup-banner-dismissed"] as const;

// ─────────────────────────────────────────────────────────────────
// SetupChecklist
// Dashboard widget: "Complete your setup" — disappears when done.
// Collapsible on mobile so it doesn't dominate the viewport.
// ─────────────────────────────────────────────────────────────────

interface SetupChecklistProps {
  /** Stronger styling for dashboard / app-shell banner placement */
  prominent?: boolean;
  /** Allow user to dismiss until next session (localStorage) */
  dismissible?: boolean;
}

export function SetupChecklist({ prominent = false, dismissible = false }: SetupChecklistProps) {
  const { profile } = useAuthStore();
  const docStore = useDocumentStore();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(
    () =>
      dismissible &&
      localStorageGetWithLegacy(DISMISS_STORAGE_KEY, LEGACY_DISMISS_KEYS) === "1",
  );

  const onboardingIncomplete = !profile?.onboarding_completed;

  const steps = [
    ...(onboardingIncomplete
      ? [{
          id: "onboarding",
          label: "Finish account setup",
          done: false,
          to: "/onboarding",
        }]
      : []),
    {
      id: "resume",
      label: "Upload your resume",
      done: !!docStore.active_resume_id,
      to: "/app/documents",
    },
    {
      id: "jd",
      label: "Add a target job description",
      done: !!docStore.active_jd_id,
      to: "/app/documents",
    },
    {
      id: "mock",
      label: "Complete your first mock session",
      done: ((profile as { xp?: number })?.xp ?? 0) > 0,
      to: "/app/mock",
    },
    {
      id: "audio",
      label: "Test your audio setup",
      done: profile?.onboarding_completed ?? false,
      to: "/app/settings/audio",
    },
  ] as const;

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;
  if (dismissible && dismissed) return null;

  const pctRaw = Math.round((completed / steps.length) * 100);
  const pct = Math.max(0, Math.min(100, pctRaw));

  function handleDismiss() {
    localStorageSetBrand(DISMISS_STORAGE_KEY, "1", LEGACY_DISMISS_KEYS);
    setDismissed(true);
  }

  return (
    <div
      className={cn(
        "rounded-2xl border p-5",
        prominent || onboardingIncomplete
          ? "border-2 border-primary/40 bg-primary/5 shadow-sm shadow-primary/5"
          : "border-border bg-secondary",
      )}
      role="region"
      aria-label="Setup checklist"
    >
      <div className="mb-3 flex w-full items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-center justify-between md:cursor-default text-left"
          aria-expanded={expanded}
        >
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {onboardingIncomplete ? "Continue your setup" : "Complete your setup"}
            </h3>
            {onboardingIncomplete && prominent && (
              <p className="text-xs text-muted-foreground mt-1">
                Finish onboarding to unlock personalized coaching and interview prep.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">
              {completed}/{steps.length}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform md:hidden",
                expanded && "rotate-180",
              )}
            />
          </div>
        </button>
        {dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
            aria-label="Dismiss setup banner"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {onboardingIncomplete && prominent && (
        <Link
          to="/onboarding"
          className="mb-4 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
        >
          Continue setup
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {/* Progress bar — always visible */}
      <div
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={completed}
        aria-label="Setup completion progress"
        title={`${pct}% complete`}
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Steps — always shown on desktop (md+), toggled on mobile */}
      <ul className={cn("space-y-2 overflow-y-auto max-h-96", "hidden md:block", expanded && "!block")}>
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              to={step.to}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-all hover:bg-secondary/80",
                step.done && "opacity-50",
              )}
            >
              {step.done ? (
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "flex-1 text-xs",
                  step.done ? "text-muted-foreground line-through" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
              {!step.done && (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
