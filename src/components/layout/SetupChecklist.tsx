import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, Circle, ChevronRight, ChevronDown } from "lucide-react";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// SetupChecklist
// Dashboard widget: "Complete your setup" — disappears when done.
// Collapsible on mobile so it doesn't dominate the viewport.
// ─────────────────────────────────────────────────────────────────

export function SetupChecklist() {
  const { profile } = useAuthStore();
  const docStore = useDocumentStore();
  const [expanded, setExpanded] = useState(false);

  const steps = [
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
      done: ((profile as any)?.xp ?? 0) > 0,
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

  const pctRaw = Math.round((completed / steps.length) * 100);
  const pct = Math.max(0, Math.min(100, pctRaw));

  return (
    <div className="rounded-2xl border border-border bg-secondary p-5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-3 flex w-full items-center justify-between md:cursor-default"
        aria-expanded={expanded}
      >
        <h3 className="text-sm font-semibold text-foreground">Complete your setup</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {completed}/{steps.length}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform md:hidden",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

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
          className="h-full rounded-full bg-violet-500 transition-all duration-500"
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
                step.done && "opacity-50"
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
                  step.done ? "text-muted-foreground line-through" : "text-muted-foreground"
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
