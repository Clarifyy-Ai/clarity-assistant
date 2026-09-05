import type { ParsedResume } from "@/types/ai.types";
import {
  buildPlainTextPreviewSections,
  buildResumePreviewSections,
  truncatePreviewBody,
  type DocumentPreviewSection,
} from "@/lib/documents/documentPreviewFormat";
import { cn } from "@/lib/utils";

type DocumentPreviewCardProps = {
  parsed?: ParsedResume | null;
  rawText?: string | null;
  compact?: boolean;
  className?: string;
};

function renderSection(section: DocumentPreviewSection, compact: boolean): JSX.Element {
  const body = compact ? truncatePreviewBody(section.body, 220) : section.body;
  const isSkills = section.heading.toLowerCase().includes("skill");

  if (isSkills && section.body.includes(",")) {
    const skills = section.body.split(/[,;|/]+/).map((item) => item.trim()).filter(Boolean);
    return (
      <div key={section.heading} className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {section.heading}
        </p>
        <div className="flex flex-wrap gap-1">
          {skills.slice(0, compact ? 8 : 16).map((skill) => (
            <span
              key={skill}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div key={section.heading} className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {section.heading}
      </p>
      <p
        className={cn(
          "text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap",
          compact && "line-clamp-4",
        )}
      >
        {body}
      </p>
    </div>
  );
}

export function DocumentPreviewCard({
  parsed,
  rawText,
  compact = false,
  className,
}: DocumentPreviewCardProps): JSX.Element | null {
  const sections = parsed
    ? buildResumePreviewSections(parsed)
    : buildPlainTextPreviewSections(rawText ?? "");

  if (sections.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-secondary/40 p-3 space-y-3",
        className,
      )}
    >
      {sections.map((section) => renderSection(section, compact))}
    </div>
  );
}
