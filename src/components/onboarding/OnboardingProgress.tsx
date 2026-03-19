import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// OnboardingProgress
// Step indicator used across all 5 onboarding pages.
// ─────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Role" },
  { n: 2, label: "Experience" },
  { n: 3, label: "Preferences" },
  { n: 4, label: "Audio" },
  { n: 5, label: "Resume" },
];

export function OnboardingProgress({ current }: { current: number }) {
  return (
    <div className="mb-10 flex items-center gap-0">
      {STEPS.map((step, i) => {
        const done = step.n < current;
        const active = step.n === current;

        return (
          <div key={step.n} className="flex flex-1 items-center last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                  done
                    ? "bg-violet-600 border-violet-600 text-white"
                    : active
                    ? "bg-transparent border-violet-500 text-violet-400"
                    : "bg-transparent border-white/15 text-gray-600"
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : step.n}
              </div>

              <span
                className={cn(
                  "hidden text-[10px] font-medium sm:block",
                  active
                    ? "text-violet-400"
                    : done
                    ? "text-gray-400"
                    : "text-gray-700"
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-1 h-px flex-1 transition-all",
                  done ? "bg-violet-600" : "bg-white/10"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
