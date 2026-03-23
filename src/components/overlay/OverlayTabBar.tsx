import { useOverlayStore } from "@/store/overlayStore";
import { useDocumentStore } from "@/store/documentStore";
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "answer"     as const, label: "Answer" },
  { id: "chat"       as const, label: "Chat" },
  { id: "resume"     as const, label: "Context" },
  { id: "transcript" as const, label: "Transcript" },
  { id: "audit"      as const, label: "Status" },
] as const;

export function OverlayTabBar() {
  const activeTab     = useOverlayStore((s) => s.active_tab);
  const sessionStatus = useSessionStore((s) => s.status);

  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId     = useDocumentStore((s) => s.active_jd_id);
  const resumes        = useDocumentStore((s) => s.resumes);
  const jds            = useDocumentStore((s) => s.jds);

  const isSessionActive = sessionStatus === "active" || sessionStatus === "paused" || sessionStatus === "warming_up";

  const activeResume = resumes.find((r) => r.id === activeResumeId);
  const activeJd     = jds.find((j) => j.id === activeJdId);

  const contextLabel = (() => {
    if (activeResume) return activeResume.title;
    if (activeJd) return activeJd.role_title;
    return "Context";
  })();

  return (
    <div className="flex gap-0.5 border-b border-white/5 px-2 pt-1 shrink-0">
      {TABS.map((tab) => {
        if (tab.id === "resume" && !isSessionActive) return null;
        const label = tab.id === "resume" ? contextLabel : tab.label;
        return (
          <button
            key={tab.id}
            onClick={() => useOverlayStore.getState().setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all border-b-2 max-w-[80px] truncate",
              activeTab === tab.id
                ? "text-brand-300 border-brand-400"
                : "text-muted-foreground/40 border-transparent hover:text-muted-foreground/60"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
