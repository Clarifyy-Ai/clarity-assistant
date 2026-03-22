import { useOverlayStore } from "@/store/overlayStore";
import { FileText, Briefcase, Code2, GraduationCap, Lightbulb } from "lucide-react";

export function OverlayResumePanel() {
  const points = useOverlayStore((s) => s.resume_talking_points);
  const ctx = useOverlayStore((s) => s.resume_context);

  if (!points) {
    return (
      <div className="p-4 text-center">
        <p className="text-xs text-muted-foreground/40 italic">
          No resume loaded for this session.
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/30">
          Upload a resume in Documents to see talking points here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 text-xs">
      {ctx && (
        <div className="flex items-center gap-3 rounded-lg bg-brand-500/10 px-3 py-2">
          <span className="text-[10px] text-brand-300/80">
            {ctx.skills_count} skills
          </span>
          <span className="text-[10px] text-muted-foreground/30">·</span>
          <span className="text-[10px] text-brand-300/80">
            {ctx.experience_count} roles
          </span>
          {ctx.total_years && (
            <>
              <span className="text-[10px] text-muted-foreground/30">·</span>
              <span className="text-[10px] text-brand-300/80">
                {ctx.total_years}+ yrs
              </span>
            </>
          )}
        </div>
      )}

      <Section icon={FileText} title="Introduction">
        <p className="text-overlay-text leading-relaxed">{points.intro}</p>
      </Section>

      {points.skills_summary && (
        <Section icon={Code2} title="Key Skills">
          <div className="flex flex-wrap gap-1">
            {points.skills_summary.split(", ").map((skill, i) => (
              <span
                key={i}
                className="rounded-md border border-brand-500/20 bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-300"
              >
                {skill}
              </span>
            ))}
          </div>
        </Section>
      )}

      {points.experience_points.length > 0 && (
        <Section icon={Briefcase} title="Experience">
          <ul className="space-y-1">
            {points.experience_points.map((pt, i) => (
              <li key={i} className="flex gap-1.5 text-overlay-text">
                <span className="shrink-0 text-brand-400">•</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {points.project_highlights.length > 0 && (
        <Section icon={Code2} title="Projects">
          <ul className="space-y-1">
            {points.project_highlights.map((pt, i) => (
              <li key={i} className="flex gap-1.5 text-overlay-text">
                <span className="shrink-0 text-brand-400">•</span>
                <span>{pt}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {points.education_line && (
        <Section icon={GraduationCap} title="Education">
          <p className="text-overlay-text">{points.education_line}</p>
        </Section>
      )}

      {points.interview_tips.length > 0 && (
        <Section icon={Lightbulb} title="Quick Tips">
          <ul className="space-y-1">
            {points.interview_tips.map((tip, i) => (
              <li key={i} className="flex gap-1.5 text-overlay-text">
                <span className="shrink-0 text-amber-400">💡</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof FileText;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-brand-400/70" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-300/70">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
