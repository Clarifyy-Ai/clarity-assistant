// src/components/session/SessionContextChip.tsx
import { useMemo } from "react";
import { FileText } from "lucide-react";
import { useDocumentStore } from "@/store/documentStore";
import { useOverlayStore } from "@/store/overlayStore";
import { cn } from "@/lib/utils";

interface SessionContextChipProps {
  /** Override resume label (e.g. wizard selection before store sync). */
  resumeLabel?: string | null;
  /** Override language (e.g. wizard local state). */
  language?: string | null;
  className?: string;
  /** Compact styling for overlay chrome. */
  compact?: boolean;
}

export function SessionContextChip({
  resumeLabel,
  language,
  className,
  compact = false,
}: SessionContextChipProps) {
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const resumes = useDocumentStore((s) => s.resumes);
  const sessionLanguage = useOverlayStore((s) => s.session_language);

  const resolvedResume = useMemo(() => {
    if (resumeLabel != null && resumeLabel.trim()) return resumeLabel.trim();
    const active = resumes.find((r) => r.id === activeResumeId);
    if (active?.title) return active.title;
    return "No resume";
  }, [resumeLabel, resumes, activeResumeId]);

  const resolvedLanguage = (language?.trim() || sessionLanguage || "English").trim();

  const resumeShort =
    resolvedResume.length > 22 ? `${resolvedResume.slice(0, 21)}…` : resolvedResume;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border font-medium truncate max-w-full",
        compact
          ? "border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/55"
          : "border-border bg-secondary/40 px-2.5 py-1 text-xs text-muted-foreground",
        className,
      )}
      title={`Using: ${resolvedResume} · ${resolvedLanguage}`}
      role="status"
      aria-label={`Using ${resolvedResume}, language ${resolvedLanguage}`}
    >
      <FileText
        className={cn("shrink-0", compact ? "w-2.5 h-2.5 text-white/35" : "w-3 h-3")}
        aria-hidden
      />
      <span className="truncate">
        Using: <span className={compact ? "text-white/80" : "text-foreground"}>{resumeShort}</span>
        {" · "}
        <span className={compact ? "text-white/70" : "text-foreground"}>{resolvedLanguage}</span>
      </span>
    </div>
  );
}
