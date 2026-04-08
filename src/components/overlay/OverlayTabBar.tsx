// src/components/overlay/OverlayTabBar.tsx
import { useOverlayStore } from "@/store/overlayStore";
import { useDocumentStore } from "@/store/documentStore";
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "answer"     as const, label: "Answer",     emoji: "✦" },
  { id: "chat"       as const, label: "Chat",       emoji: "💬" },
  { id: "transcript" as const, label: "Transcript", emoji: "🎙" },
  { id: "resume"     as const, label: "Context",    emoji: "📄" },
  { id: "audit"      as const, label: "Status",     emoji: "📊" },
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
    if (activeResume) return activeResume.title.slice(0, 12);
    if (activeJd)     return activeJd.role_title.slice(0, 12);
    return "Context";
  })();

  const hasContext = !!activeResumeId || !!activeJdId;

  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/[0.06] bg-[#0b0b18]/40 shrink-0">
      {TABS.map((tab) => {
        if (tab.id === "resume" && !isSessionActive) return null;
        const label = tab.id === "resume" ? contextLabel : tab.label;
        const isActive = activeTab === tab.id;
        const showDot = tab.id === "resume" && hasContext && !isActive;

        return (
          <button
            key={tab.id}
            onClick={() => useOverlayStore.getState().setActiveTab(tab.id)}
            className={cn(
              "relative px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 max-w-[90px] truncate",
              isActive
                ? "bg-indigo-600/20 text-indigo-300 shadow-[0_0_0_1px_rgba(99,102,241,0.3),0_2px_8px_rgba(99,102,241,0.1)]"
                : "text-white/30 hover:text-white/60 hover:bg-white/[0.05]"
            )}
          >
            {label}
            {showDot && (
              <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
