import { useEffect, useState } from "react";
import {
  formatGenerationElapsed,
  generationElapsedSeconds,
  type GovPaperGenerationSession,
} from "@/lib/gov-exam/govPaperReviewSession";

type Props = {
  session: GovPaperGenerationSession;
};

/** Renders generation elapsed time only when session metadata is valid. */
export function GovPaperReviewGenerationTimer({
  session,
}: Props): React.ReactElement | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (session.phase !== "active") return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.phase, session.phase === "active" ? session.jobId : null]);

  const elapsed = generationElapsedSeconds(session, nowMs);
  const label = formatGenerationElapsed(elapsed);
  if (!label) return null;

  return (
    <p className="text-xs text-muted-foreground" aria-live="polite">
      Generating for {label}
    </p>
  );
}
