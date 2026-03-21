import { useOverlayStore } from "@/store/overlayStore";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "answer"     as const, label: "Answer" },
  { id: "transcript" as const, label: "Transcript" },
  { id: "audit"      as const, label: "Status" },
] as const;

export function OverlayTabBar() {
  const activeTab = useOverlayStore((s) => s.active_tab);

  return (
    <div className="flex border-b border-white/5 px-2">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => useOverlayStore.getState().setActiveTab(tab.id)}
          className={cn(
            "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-all border-b-2",
            activeTab === tab.id
              ? "text-brand-300 border-brand-400"
              : "text-muted-foreground/40 border-transparent hover:text-muted-foreground/60"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
