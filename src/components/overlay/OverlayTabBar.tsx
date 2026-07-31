// src/components/overlay/OverlayTabBar.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useOverlayStore } from "@/store/overlayStore";
import { useDocumentStore } from "@/store/documentStore";
import { useSessionStore } from "@/store/sessionStore";
import { cn } from "@/lib/utils";

type ToolTab = "chat" | "transcript" | "resume" | "audit";

const TOOL_TABS: { id: ToolTab; label: string }[] = [
  { id: "chat", label: "Chat" },
  { id: "transcript", label: "Transcript" },
  { id: "resume", label: "Resume context" },
  { id: "audit", label: "Status" },
];

export function OverlayTabBar() {
  const activeTab = useOverlayStore((s) => s.active_tab);
  const sessionStatus = useSessionStore((s) => s.status);

  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId = useDocumentStore((s) => s.active_jd_id);
  const resumes = useDocumentStore((s) => s.resumes);
  const jds = useDocumentStore((s) => s.jds);

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isSessionActive =
    sessionStatus === "active" || sessionStatus === "paused" || sessionStatus === "warming_up";

  const hasContext = !!activeResumeId || !!activeJdId;

  const contextLabel = useMemo(() => {
    const activeResume = resumes?.find?.((r: { id?: string; title?: string }) => r?.id === activeResumeId);
    const activeJd = jds?.find?.((j: { id?: string; role_title?: string }) => j?.id === activeJdId);

    if (activeResume?.title) return String(activeResume.title).slice(0, 18);
    if (activeJd?.role_title) return String(activeJd.role_title).slice(0, 18);
    return "Resume context";
  }, [resumes, jds, activeResumeId, activeJdId]);

  const toolTabs = useMemo(
    () =>
      TOOL_TABS.map((t) =>
        t.id === "resume" ? { ...t, label: contextLabel } : t,
      ).filter((t) => (t.id === "resume" ? isSessionActive : true)),
    [contextLabel, isSessionActive],
  );

  const isOnTool = activeTab !== "answer";
  const activeToolLabel =
    toolTabs.find((t) => t.id === activeTab)?.label ??
    (activeTab === "resume" ? contextLabel : "More tools");

  useEffect(() => {
    if (!isSessionActive && activeTab === "resume") {
      useOverlayStore.getState().setActiveTab("answer");
    }
  }, [isSessionActive, activeTab]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div
      className="flex items-center gap-1 px-2 py-1.5 border-b border-white/[0.06] bg-[#0b0b18]/40 shrink-0"
      data-no-drag
    >
      <button
        type="button"
        onClick={() => useOverlayStore.getState().setActiveTab("answer")}
        aria-pressed={activeTab === "answer"}
        className={cn(
          "px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
          activeTab === "answer"
            ? "bg-indigo-600/20 text-indigo-300 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]"
            : "text-white/30 hover:text-white/60 hover:bg-white/[0.05]",
        )}
      >
        Hints
      </button>

      <div className="relative ml-auto" ref={moreRef} data-coach="more-tools">
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-pressed={isOnTool}
          className={cn(
            "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
            isOnTool || moreOpen
              ? "bg-white/10 text-white/85"
              : "text-white/35 hover:text-white/65 hover:bg-white/[0.05]",
          )}
        >
          <MoreHorizontal className="w-3 h-3" aria-hidden />
          <span className="max-w-[100px] truncate">
            {isOnTool ? activeToolLabel : "More tools"}
          </span>
          <ChevronDown className={cn("w-3 h-3 opacity-60", moreOpen && "rotate-180")} aria-hidden />
          {hasContext && !isOnTool && (
            <span
              className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400"
              aria-hidden
            />
          )}
        </button>

        {moreOpen && (
          <div
            role="menu"
            className="absolute top-full right-0 mt-1.5 w-48 rounded-xl border border-white/10 bg-[#0f0f1e] shadow-2xl z-50 py-1.5 animate-fade-in"
          >
            {toolTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    useOverlayStore.getState().setActiveTab(tab.id);
                    setMoreOpen(false);
                  }}
                  className={cn(
                    "w-full text-left px-3 py-2 text-[12px] transition-colors",
                    isActive
                      ? "text-indigo-300 bg-indigo-500/10 font-semibold"
                      : "text-white/55 hover:text-white/90 hover:bg-white/[0.04]",
                  )}
                >
                  {tab.label}
                </button>
              );
            })}
            <div className="my-1 border-t border-white/[0.06] mx-2" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                useOverlayStore.getState().setActiveTab("answer");
                setMoreOpen(false);
                window.dispatchEvent(new CustomEvent("clarify:open-overlay-settings"));
              }}
              className="w-full text-left px-3 py-2 text-[12px] text-white/55 hover:text-white/90 hover:bg-white/[0.04]"
            >
              Overlay settings
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
