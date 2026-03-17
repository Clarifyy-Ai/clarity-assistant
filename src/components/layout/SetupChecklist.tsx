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
  const { profile }    = useAuthStore();
  const docStore       = useDocumentStore();

  const steps = [
    {
      id:   "resume",
      label: "Upload your resume",
      done:  !!docStore.active_resume_id,
      to:    "/documents",
    },
    {
      id:    "jd",
      label: "Add a target job description",
      done:  !!docStore.active_jd_id,
      to:    "/documents",
    },
    {
      id:    "mock",
      label: "Complete your first mock session",
      done:  (profile?.xp ?? 0) > 0,
      to:    "/mock",
    },
    {
      id:    "audio",
      label: "Test your audio setup",
      done:  profile?.onboarding_completed ?? false,
      to:    "/settings/audio",
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  if (completed === steps.length) return null;

  const pct = Math.round((completed / steps.length) * 100);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Complete your setup</h3>
        <span className="text-xs text-gray-500">{completed}/{steps.length}</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-violet-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ul className="space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link
              to={step.to}
              className={cn(
                "flex items-center gap-3 py-1.5 px-2 rounded-xl hover:bg-white/5 transition-all group",
                step.done && "opacity-50"
              )}
            >
              {step.done ? (
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-gray-600 shrink-0" />
              )}
              <span className={cn(
                "text-xs flex-1",
                step.done ? "text-gray-500 line-through" : "text-gray-300"
              )}>
                {step.label}
              </span>
              {!step.done && (
                <ChevronRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-colors" />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
