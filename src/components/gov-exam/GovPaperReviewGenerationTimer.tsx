import { useEffect, useState } from "react";
import {
  formatGenerationElapsed,
  generationElapsedSeconds,
  isGenerationTimerActive,
  type GovPaperGenerationSession,
} from "@/lib/gov-exam/govPaperReviewSession";

type Props = {
  session: GovPaperGenerationSession | null | undefined;
};

/** Renders generation elapsed time only when session metadata is valid. */
export function GovPaperReviewGenerationTimer({
  session,
}: Props): React.ReactElement | null {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const timerActive = isGenerationTimerActive(session);

  useEffect(() => {
    if (!timerActive) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [
    timerActive,
    session && session.phase === "active" ? session.jobId : null,
  ]);

  if (!session || !timerActive) return null;

  const elapsed = generationElapsedSeconds(session, nowMs);
  const label = formatGenerationElapsed(elapsed);
  if (!label) return null;

  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      Generating for {label}
    </p>
  );
}
