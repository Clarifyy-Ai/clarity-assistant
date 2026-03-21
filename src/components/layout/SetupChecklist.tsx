import { Link } from "react-router-dom";
import { CheckCircle, Circle, ChevronRight } from "lucide-react";
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// SetupChecklist
// Dashboard widget: "Complete your setup" — disappears when done.
// ─────────────────────────────────────────────────────────────────

export function SetupChecklist() {
  const { profile } = useAuthStore();
  const docStore = useDocumentStore();

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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Complete your setup</h3>
        <span className="text-xs text-gray-500">
          {completed}/{steps.length}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/10"
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

      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              to={step.to}
              className={cn(
                "group flex items-center gap-3 rounded-xl px-2 py-1.5 transition-all hover:bg-white/5",
                step.done && "opacity-50"
              )}
            >
              {step.done ? (
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-gray-600" />
              )}
              <span
                className={cn(
                  "flex-1 text-xs",
                  step.done ? "text-gray-500 line-through" : "text-gray-300"
                )}
              >
                {step.label}
              </span>
              {!step.done && (
                <ChevronRight className="h-3.5 w-3.5 text-gray-600 transition-colors group-hover:text-gray-400" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
