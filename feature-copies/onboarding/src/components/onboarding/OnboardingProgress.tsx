import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
// OnboardingProgress — 2-step indicator (~2 minute onboarding).
// ─────────────────────────────────────────────────────────────────

const STEPS = [
  { n: 1, label: "Essentials" },
  { n: 2, label: "Optional setup" },
];

export function OnboardingProgress({ current, className }: { current: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-0", className)}>
      {STEPS.map((step, i) => {
        const done = step.n < current;
        const active = step.n === current;

        return (
          <div key={step.n} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                  done
                    ? "bg-primary border-primary text-primary-foreground"
                    : active
                    ? "bg-transparent border-primary text-primary"
                    : "bg-transparent border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : step.n}
              </div>

              <span
                className={cn(
                  "hidden text-[10px] font-medium sm:block",
                  active ? "text-primary" : done ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {step.label}
              </span>
            </div>

            {i < STEPS.length - 1 && (
              <div className={cn("mx-1 h-px flex-1 transition-all", done ? "bg-primary" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
