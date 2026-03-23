import { useState } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useDocumentStore } from "@/store/documentStore";
import { FileText, Briefcase, Code2, GraduationCap, Lightbulb, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function OverlayResumePanel() {
  const points = useOverlayStore((s) => s.resume_talking_points);
  const ctx = useOverlayStore((s) => s.resume_context);
  const simpleLanguage = useOverlayStore((s) => s.simple_language);
  const setSimpleLanguage = useOverlayStore((s) => s.setSimpleLanguage);

  const resumes = useDocumentStore((s) => s.resumes);
  const jds = useDocumentStore((s) => s.jds);
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId = useDocumentStore((s) => s.active_jd_id);
  const setActiveResumeId = useDocumentStore((s) => s.setActiveResumeId);
  const setActiveJDId = useDocumentStore((s) => s.setActiveJDId);

  const [showDocs, setShowDocs] = useState(false);

  const activeResume = resumes.find((r) => r.id === activeResumeId);
  const activeJd = jds.find((j) => j.id === activeJdId);

  return (
    <div className="space-y-3 p-3 text-xs">
      {/* Document Selector */}
      <div>
        <button
          onClick={() => setShowDocs((p) => !p)}
          className="w-full flex items-center justify-between p-2.5 bg-white/5 hover:bg-white/8 border border-white/10 rounded-lg text-[10px] text-muted-foreground/60 transition-colors"
        >
          <span className="font-semibold uppercase tracking-wider">Context Documents</span>
          <ChevronDown className={cn("w-3 h-3 transition-transform", showDocs && "rotate-180")} />
        </button>

        {showDocs && (
          <div className="mt-2 space-y-2 p-2.5 bg-white/3 border border-white/5 rounded-lg">
            {/* Resume selector */}
            <div>
              <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1 flex items-center gap-1">
                <FileText className="w-2.5 h-2.5" /> Resume
              </p>
              <select
                value={activeResumeId ?? ""}
                onChange={(e) => setActiveResumeId(e.target.value || null)}
                className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-2 py-1.5 text-[10px] focus:outline-none focus:border-brand-400/30"
              >
                <option value="">None</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>

            {/* JD selector */}
            <div>
              <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Briefcase className="w-2.5 h-2.5" /> Job Description
              </p>
              <select
                value={activeJdId ?? ""}
                onChange={(e) => setActiveJDId(e.target.value || null)}
                className="w-full bg-white/5 border border-white/10 text-white rounded-lg px-2 py-1.5 text-[10px] focus:outline-none focus:border-brand-400/30"
              >
                <option value="">None</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>{j.role_title}{j.company_name ? ` — ${j.company_name}` : ""}</option>
                ))}
              </select>
            </div>

            {/* Active context indicator */}
            {(activeResume || activeJd) && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-white/5">
                {activeResume && (
                  <span className="px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300 text-[9px] flex items-center gap-0.5">
                    <FileText className="w-2 h-2" />
                    {activeResume.title}
                  </span>
                )}
                {activeJd && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] flex items-center gap-0.5">
                    <Briefcase className="w-2 h-2" />
                    {activeJd.role_title}{activeJd.company_name ? ` — ${activeJd.company_name}` : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Simple Language toggle */}
      <div className="flex items-center justify-between px-2.5 py-2 bg-white/3 border border-white/5 rounded-lg">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground/70">Simple Language</p>
          <p className="text-[9px] text-muted-foreground/40 mt-0.5">Plain, jargon-free answers</p>
        </div>
        <button
          onClick={() => setSimpleLanguage(!simpleLanguage)}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            simpleLanguage ? "bg-emerald-500" : "bg-white/10"
          )}
        >
          <span className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
            simpleLanguage ? "translate-x-5" : "translate-x-0.5"
          )} />
        </button>
      </div>

      {!points && !activeResume && !activeJd ? (
        <div className="p-4 text-center">
          <p className="text-xs text-muted-foreground/40 italic">
            No context documents loaded.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/30">
            Select a resume or job description above.
          </p>
        </div>
      ) : (
        <>
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

          {points && (
            <>
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
            </>
          )}
        </>
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
