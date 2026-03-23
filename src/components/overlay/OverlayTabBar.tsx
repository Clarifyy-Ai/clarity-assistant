import { useOverlayStore } from "@/store/overlayStore";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "answer"     as const, label: "Answer" },
  { id: "chat"       as const, label: "Chat" },
  { id: "resume"     as const, label: "Resume" },
  { id: "transcript" as const, label: "Transcript" },
  { id: "audit"      as const, label: "Status" },
] as const;

export function OverlayTabBar() {
  const activeTab = useOverlayStore((s) => s.active_tab);
  const hasResume = useOverlayStore((s) => !!s.resume_talking_points);

  return (
    <div className="flex gap-0.5 border-b border-white/5 px-2 pt-1 shrink-0">
      {TABS.map((tab) => {
        if (tab.id === "resume" && !hasResume) return null;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => useOverlayStore.getState().setActiveTab(tab.id)}
            className={cn(
              "relative px-3 py-1.5 text-[12px] font-medium rounded-t-lg transition-all border-b-2 -mb-px",
              isActive
                ? "text-brand-300 border-brand-400 bg-brand-500/8"
                : "text-muted-foreground/50 border-transparent hover:text-muted-foreground/80 hover:bg-white/5"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
