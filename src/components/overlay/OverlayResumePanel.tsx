// src/components/overlay/OverlayResumePanel.tsx
import { useState } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { useDocumentStore } from "@/store/documentStore";
import { useSessionStore } from "@/store/sessionStore";
import {
  FileText,
  Briefcase,
  Code2,
  GraduationCap,
  Lightbulb,
  ChevronDown,
} from "lucide-react";
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
  const sessionStatus = useSessionStore((s) => s.status);
  const sessionFrozen =
    sessionStatus === "active" ||
    sessionStatus === "warming_up" ||
    sessionStatus === "paused";

  const [showDocs, setShowDocs] = useState(false);

  const activeResume = resumes.find((r) => r.id === activeResumeId);
  const activeJd = jds.find((j) => j.id === activeJdId);

  return (
    <div className="space-y-3 p-3 text-xs overflow-y-auto">
      {sessionFrozen && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
          Context frozen at session start. AI coaching uses this snapshot — document switches below are disabled until the session ends.
        </p>
      )}
      {/* Document selector */}
      <div>
        <button
          onClick={() => setShowDocs((p) => !p)}
          className={cn(
            "w-full flex items-center justify-between p-2.5 rounded-xl border text-[11px] transition-all",
            showDocs
              ? "bg-white/8 border-white/12 text-white/60"
              : "bg-white/[0.04] hover:bg-white/[0.07] border-white/[0.08] text-white/40 hover:text-white/60"
          )}
        >
          <span className="font-bold uppercase tracking-widest">
            Context Documents
          </span>
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform duration-200",
              showDocs && "rotate-180"
            )}
          />
        </button>

        {showDocs && (
          <div className="mt-2 space-y-2 p-2.5 bg-white/[0.03] border border-white/[0.06] rounded-xl">
            {sessionFrozen ? (
              <p className="text-[11px] text-white/40 italic">
                Resume and JD were locked when this session started.
              </p>
            ) : (
              <>
            {/* Resume */}
            <div>
              <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5 flex items-center gap-1 font-bold">
                <FileText className="w-2.5 h-2.5" /> Resume
              </p>
              <select
                value={activeResumeId ?? ""}
                onChange={(e) =>
                  setActiveResumeId(e.target.value || null)
                }
                className="w-full bg-white/[0.05] border border-white/[0.08] text-white/80 rounded-lg px-2 py-1.5 text-[12px] focus:outline-none focus:border-indigo-500/30 transition-colors"
              >
                <option value="">None</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </div>

            {/* JD */}
            <div>
              <p className="text-[10px] text-white/25 uppercase tracking-widest mb-1.5 flex items-center gap-1 font-bold">
                <Briefcase className="w-2.5 h-2.5" /> Job Description
              </p>
              <select
                value={activeJdId ?? ""}
                onChange={(e) => setActiveJDId(e.target.value || null)}
                className="w-full bg-white/[0.05] border border-white/[0.08] text-white/80 rounded-lg px-2 py-1.5 text-[12px] focus:outline-none focus:border-indigo-500/30 transition-colors"
              >
                <option value="">None</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>
                    {j.role_title}
                    {j.company_name ? ` — ${j.company_name}` : ""}
                  </option>
                ))}
              </select>
            </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Simple language */}
      <div className="flex items-center justify-between px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <div>
          <p className="text-[12px] font-semibold text-white/60">
            Simple Language
          </p>
          <p className="text-[11px] text-white/30 mt-0.5">
            Plain, jargon‑free answers
          </p>
        </div>
        <button
          onClick={() => setSimpleLanguage(!simpleLanguage)}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors border",
            simpleLanguage
              ? "bg-emerald-500 border-emerald-400/30"
              : "bg-white/10 border-white/10"
          )}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
              simpleLanguage ? "translate-x-[18px]" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      {/* Content */}
      {!points && !activeResume && !activeJd ? (
        <div className="p-5 text-center rounded-xl border border-white/[0.05] bg-white/[0.02]">
          <p className="text-[12px] text-white/25 italic">
            No context documents loaded.
          </p>
        </div>
      ) : (
        <>
          {ctx && (
            <div className="flex items-center gap-2 rounded-xl bg-indigo-500/8 border border-indigo-500/12 px-3 py-2">
              <Chip value={`${ctx.skills_count} skills`} />
              <span className="text-white/15">·</span>
              <Chip value={`${ctx.experience_count} roles`} />
              {ctx.total_years && (
                <>
                  <span className="text-white/15">·</span>
                  <Chip value={`${ctx.total_years}+ yrs`} />
                </>
              )}
            </div>
          )}

          {points && (
            <>
              <Section icon={FileText} title="Introduction">
                <p className="text-[12px] text-white/70">
                  {points.intro}
                </p>
              </Section>

              {points.skills_summary && (
                <Section icon={Code2} title="Key Skills">
                  <div className="flex flex-wrap gap-1">
                    {points.skills_summary
                      .split(", ")
                      .map((skill, i) => (
                        <span
                          key={i}
                          className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[11px] text-indigo-300"
                        >
                          {skill}
                        </span>
                      ))}
                  </div>
                </Section>
              )}

              {points.experience_points?.length > 0 && (
                <Section icon={Briefcase} title="Experience">
                  <ul className="space-y-1">
                    {points.experience_points.map((pt, i) => (
                      <li
                        key={i}
                        className="flex gap-1.5 text-[12px] text-white/65"
                      >
                        <span className="text-indigo-400">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              {points.education_line && (
                <Section icon={GraduationCap} title="Education">
                  <p className="text-[12px] text-white/65">
                    {points.education_line}
                  </p>
                </Section>
              )}

              {points.interview_tips?.length > 0 && (
                <Section icon={Lightbulb} title="Quick Tips">
                  <ul className="space-y-1">
                    {points.interview_tips.map((tip, i) => (
                      <li
                        key={i}
                        className="flex gap-1.5 text-[12px] text-white/65"
                      >
                        <span className="text-amber-400">💡</span>
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

function Chip({ value }: { value: string }) {
  return (
    <span className="text-[11px] font-semibold text-indigo-300/70">
      {value}
    </span>
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
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Icon className="h-2.5 w-2.5 text-indigo-400/60" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300/55">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
