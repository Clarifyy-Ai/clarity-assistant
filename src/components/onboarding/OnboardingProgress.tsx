import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// OnboardingProgress
// Step indicator used across all 5 onboarding pages.
// ─────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Role"        },
  { n: 2, label: "Experience"  },
  { n: 3, label: "Preferences" },
  { n: 4, label: "Audio"       },
  { n: 5, label: "Resume"      },
];

export function OnboardingProgress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((step, i) => {
        const done   = step.n < current;
        const active = step.n === current;

        return (
          <div key={step.n} className="flex items-center flex-1 last:flex-none">
            {/* Circle */}
            <div className="flex flex-col items-center gap-1">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all",
                done
                  ? "bg-violet-600 border-violet-600 text-white"
                  : active
                  ? "bg-transparent border-violet-500 text-violet-400"
                  : "bg-transparent border-white/15 text-gray-600"
              )}>
                {done ? <Check className="w-3.5 h-3.5" /> : step.n}
              </div>
              <span className={cn(
                "text-[10px] font-medium hidden sm:block",
                active ? "text-violet-400" : done ? "text-gray-400" : "text-gray-700"
              )}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-px mx-1 transition-all",
                done ? "bg-violet-600" : "bg-white/10"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
