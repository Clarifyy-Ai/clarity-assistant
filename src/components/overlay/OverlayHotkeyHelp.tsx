import { useEffect, useRef } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import { X, Keyboard } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export const OVERLAY_HOTKEYS = [
  { keys: ["ctrl", "shift", "h"],   label: "Toggle overlay",       description: "Show or hide the Clarify AI overlay",              group: "visibility" },
  { keys: ["ctrl", "shift", "t"],   label: "Discrete UI",          description: "Lower overlay opacity until hover",               group: "visibility" },
  { keys: ["ctrl", "shift", "a"],   label: "Generate answer",      description: "Trigger AI answer for current question",           group: "hints" },
  { keys: ["ctrl", "shift", "y"],   label: "Cycle hint style",     description: "Full Answer → Short Hints → Keywords",            group: "hints" },
  { keys: ["ctrl", "shift", "s"],   label: "Scroll up",            description: "Scroll the answer panel upward",                  group: "hints" },
  { keys: ["ctrl", "shift", "d"],   label: "Scroll down",          description: "Scroll the answer panel downward",                group: "hints" },
  { keys: ["ctrl", "shift", "q"],   label: "Clear answer",         description: "Clear the current hint / answer text",            group: "hints" },
  { keys: ["ctrl", "shift", "c"],   label: "Screenshot + analyse", description: "Screenshot a coding problem & get AI analysis",   group: "actions" },
  { keys: ["ctrl", "shift", "p"],   label: "Calm steps",           description: "Show grounding coaching prompts",                 group: "actions" },
  { keys: ["ctrl", "shift", "m"],   label: "Mute / unmute",        description: "Toggle microphone during a live session",         group: "session" },
  { keys: ["ctrl", "shift", "/"],   label: "Hotkey help",          description: "Show this keyboard shortcut reference",           group: "session" },
  { keys: ["ctrl", "1-4"],          label: "Dock to corner",       description: "Snap overlay to top-left / top-right / bottom corners", group: "layout" },
  { keys: ["escape"],               label: "Dismiss",              description: "Clear current hint or close panel",               group: "layout" },
];

const GROUP_COLORS: Record<string, string> = {
  visibility: "#6EE7B7",
  hints:      "#93C5FD",
  actions:    "#F9A8D4",
  session:    "#FCD34D",
  layout:     "#C4B5FD",
};

const HOTKEYS = OVERLAY_HOTKEYS;

export function OverlayHotkeyHelp() {
  const isVisible  = useOverlayStore((s) => s.is_hotkey_help_visible);
  const isMobile = useIsMobile();
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isVisible) return;

    /* Auto-close countdown */
    if (progressRef.current) {
      progressRef.current.style.transition = "none";
      progressRef.current.style.width = "100%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (progressRef.current) {
            progressRef.current.style.transition = "width 5000ms linear";
            progressRef.current.style.width = "0%";
          }
        });
      });
    }

    timerRef.current = setTimeout(() => {
      useOverlayStore.getState().setHotkeyHelpVisible(false);
    }, 5000);

    function dismiss(e: Event) {
      if ((e as KeyboardEvent).key === undefined || (e as KeyboardEvent).key) {
        useOverlayStore.getState().setHotkeyHelpVisible(false);
      }
    }

    window.addEventListener("keydown", dismiss);
    window.addEventListener("click",   dismiss);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("click",   dismiss);
    };
  }, [isVisible]);

  if (!isVisible || isMobile) return null;

  return (
    <>
      <style>{`
        @keyframes hk-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes hk-panel-in {
          from { opacity: 0; transform: scale(0.94) translateY(6px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes hk-row-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0);    }
        }
        @keyframes hk-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .hk-backdrop { animation: hk-backdrop-in 180ms ease forwards; }
        .hk-panel    { animation: hk-panel-in    220ms cubic-bezier(.22,1,.36,1) forwards; }
        .hk-row      { animation: hk-row-in      200ms ease both; }
        .hk-key-badge {
          background: linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.05));
          border: 1px solid rgba(255,255,255,0.13);
          border-bottom-width: 2px;
          box-shadow: 0 1px 0 rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06);
          transition: background 120ms, transform 80ms;
        }
        .hk-key-badge:hover {
          background: linear-gradient(135deg,rgba(255,255,255,0.18),rgba(255,255,255,0.08));
          transform: translateY(-1px);
        }
        .hk-dot-pulse {
          animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;
        }
        @keyframes pulse {
          0%,100% { opacity:1; } 50% { opacity:.4; }
        }
      `}</style>

      <div
        className="hk-backdrop absolute inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(5,5,10,0.72)", backdropFilter: "blur(10px)", borderRadius: "inherit" }}
      >
        <div
          className="hk-panel relative flex flex-col overflow-hidden"
          style={{
            width: 296,
            background: "linear-gradient(160deg,#14141f 0%,#0d0d17 100%)",
            border: "1px solid rgba(255,255,255,0.09)",
            borderRadius: 16,
            boxShadow: "0 32px 64px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.04) inset",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div
              className="flex items-center justify-center w-6 h-6 rounded-md"
              style={{ background: "rgba(110,231,183,0.12)", border: "1px solid rgba(110,231,183,0.2)" }}
            >
              <Keyboard size={12} style={{ color: "#6EE7B7" }} />
            </div>
            <span
              className="flex-1 text-xs font-semibold tracking-widest uppercase"
              style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.12em" }}
            >
              Keyboard Shortcuts
            </span>
            <button
              onClick={() => useOverlayStore.getState().setHotkeyHelpVisible(false)}
              className="flex items-center justify-center w-5 h-5 rounded-md transition-all"
              style={{ color: "rgba(255,255,255,0.25)", background: "transparent" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.08)";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.6)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
                (e.currentTarget as HTMLElement).style.color = "rgba(255,255,255,0.25)";
              }}
            >
              <X size={11} />
            </button>
          </div>

          {/* Shortcut rows */}
          <div className="flex flex-col px-2 py-2 gap-0.5">
            {HOTKEYS.map((hk, i) => {
              const dot = GROUP_COLORS[hk.group] ?? "#888";
              const keyLabel = hk.keys.includes("1-4")
                ? "⌃ 1–4"
                : formatHotkeyLabel(hk.keys);

              return (
                <div
                  key={hk.label}
                  className="hk-row flex items-center gap-2 px-2 py-1.5 rounded-lg group cursor-default"
                  style={{
                    animationDelay: `${i * 28}ms`,
                    transition: "background 120ms",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  {/* Group dot */}
                  <span
                    className="hk-dot-pulse flex-shrink-0 w-1.5 h-1.5 rounded-full"
                    style={{ background: dot, boxShadow: `0 0 6px ${dot}66`, animationDelay: `${i * 300}ms` }}
                  />

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {hk.label}
                    </p>
                    <p className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.28)" }}>
                      {hk.description}
                    </p>
                  </div>

                  {/* Key badge */}
                  <kbd
                    className="hk-key-badge flex-shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-mono"
                    style={{ color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}
                  >
                    {keyLabel}
                  </kbd>
                </div>
              );
            })}
          </div>

          {/* Progress bar + footer */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ height: 2, background: "rgba(255,255,255,0.04)", position: "relative", overflow: "hidden" }}>
              <div
                ref={progressRef}
                style={{
                  position: "absolute",
                  left: 0, top: 0, bottom: 0,
                  width: "100%",
                  background: "linear-gradient(90deg,#6EE7B7,#93C5FD)",
                  borderRadius: 2,
                }}
              />
            </div>
            <p
              className="text-center py-2 text-[9px]"
              style={{ color: "rgba(255,255,255,0.2)" }}
            >
              Auto-closes in 5s · press any key to dismiss
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
