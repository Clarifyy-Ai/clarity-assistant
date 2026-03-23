// src/components/overlay/OverlayTabBar.tsx
import { useOverlayStore } from "@/store/overlayStore";
import { useDocumentStore } from "@/store/documentStore";
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

// Chat removed — it's now a labeled button in OverlayToolbar
const TABS = [
  { id: "answer"     as const, label: "Answer" },
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

  const isSessionActive =
    sessionStatus === "active" ||
    sessionStatus === "paused" ||
    sessionStatus === "warming_up";

  const contextLabel = (() => {
    const activeResume = resumes.find((r) => r.id === activeResumeId);
    const activeJd     = jds.find((j) => j.id === activeJdId);
    if (activeResume) return activeResume.title;
    if (activeJd)     return activeJd.role_title;
    return "Context";
  })();

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/6 bg-white/2 shrink-0 overflow-x-auto scrollbar-hide">
      {TABS.map((tab) => {
        if (tab.id === "resume" && !isSessionActive) return null;
        const label = tab.id === "resume" ? contextLabel : tab.label;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => useOverlayStore.getState().setActiveTab(tab.id)}
            className={cn(
              "px-3 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 max-w-[90px] truncate border",
              isActive
                ? "bg-white/10 text-white/90 border-white/15"
                : "text-white/35 border-transparent hover:text-white/60 hover:bg-white/5"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
