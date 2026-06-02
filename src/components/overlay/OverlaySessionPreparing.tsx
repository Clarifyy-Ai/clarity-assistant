// ✅ FIX P1-C: Multi-step preparing skeleton before first hint.

import { Skeleton } from "@/components/ui/SkeletonLoader";

const STEPS = [
  "Loading your profile…",
  "Preparing resume & job context…",
  "Starting audio capture…",
] as const;

export function OverlaySessionPreparing({
  stepIndex = 0,
}: {
  stepIndex?: number;
}) {
  const label = STEPS[Math.min(stepIndex, STEPS.length - 1)];

  return (
    <div className="flex flex-col gap-3 p-4" role="status" aria-live="polite">
      <p className="text-[12px] font-semibold text-white/70">{label}</p>
      <Skeleton className="h-4 w-full rounded-md bg-white/10" />
      <Skeleton className="h-4 w-5/6 rounded-md bg-white/10" />
      <Skeleton className="h-16 w-full rounded-xl bg-white/10" />
    </div>
  );
}
