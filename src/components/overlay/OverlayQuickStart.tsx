import { useState, useRef, useEffect } from "react";
import { useDocumentStore } from "@/store/documentStore";
import {
  Zap, ChevronDown, Briefcase, Building2,
  FileText, FileSearch, Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";
import type { HintStyle } from "@/types/user.types";

/* ─── constants ─────────────────────────────────────────────────── */

const INTERVIEW_TYPES = [
  { value: "behavioral",    label: "Behavioural",   icon: "🧠" },
  { value: "technical",     label: "Technical",     icon: "⚙️" },
  { value: "system_design", label: "System Design", icon: "🏗️" },
  { value: "coding",        label: "Coding",        icon: "💻" },
  { value: "hr",            label: "HR",            icon: "🤝" },
  { value: "product",       label: "Product",       icon: "📦" },
  { value: "leadership",    label: "Leadership",    icon: "🎯" },
];

const HINT_STYLES: { value: HintStyle; label: string; desc: string }[] = [
  { value: "full_answer",   label: "Full",     desc: "Complete answers" },
  { value: "short_hints",   label: "Short",    desc: "Key points only" },
  { value: "keywords_only", label: "Keys",     desc: "Trigger words" },
];

interface OverlayQuickStartProps {
  onStart: (config: LiveSessionConfig) => void;
}

/* ─── component ─────────────────────────────────────────────────── */

export function OverlayQuickStart({ onStart }: OverlayQuickStartProps) {
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId     = useDocumentStore((s) => s.active_jd_id);

  const [company,       setCompany]       = useState("");
  const [role,          setRole]          = useState("");
  const [interviewType, setInterviewType] = useState("behavioral");
  const [hintStyle,     setHintStyle]     = useState<HintStyle>("short_hints");
  const [isLaunching,   setIsLaunching]   = useState(false);
  const [typeOpen,      setTypeOpen]      = useState(false);

  const companyRef = useRef<HTMLInputElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  /* Focus company on mount */
  useEffect(() => {
    const t = setTimeout(() => companyRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!typeOpen) return;
    const handler = (e: MouseEvent) => {
      if (!dropRef.current?.contains(e.target as Node)) setTypeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [typeOpen]);

  function handleSubmit() {
    if (isLaunching) return;
    setIsLaunching(true);

    const config: LiveSessionConfig = {
      company:              company.trim() || null,
      role:                 role.trim()    || null,
      hint_style:           hintStyle,
      model:                "gemini-flash",
      smart_routing:        false,
      stealth_mode:         false,
      resume_id:            activeResumeId,
      jd_id:                activeJdId,
      interview_type:       interviewType,
      instructions:         "",
      enable_system_audio:  false,
    };

    /* Slight delay for ripple animation feel */
    setTimeout(() => {
      setIsLaunching(false);
      onStart(config);
    }, 440);
  }

  const selectedType = INTERVIEW_TYPES.find((t) => t.value === interviewType);

  const hasDocs = !!(activeResumeId || activeJdId);

  return (
    <>
      <style>{`
        @keyframes qs-in {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0);   }
        }
        @keyframes qs-drop-in {
          from { opacity:0; transform:scaleY(0.92) translateY(-4px); }
          to   { opacity:1; transform:scaleY(1)    translateY(0);    }
        }
        @keyframes qs-spin {
          to { transform: rotate(360deg); }
        }
        @keyframes qs-ripple {
          0%   { box-shadow: 0 0 0 0 rgba(52,211,153,0.35); }
          70%  { box-shadow: 0 0 0 8px rgba(52,211,153,0);  }
          100% { box-shadow: 0 0 0 0 rgba(52,211,153,0);    }
        }

        .qs-wrap  { animation: qs-in 200ms cubic-bezier(.22,1,.36,1) both; }
        .qs-drop  { animation: qs-drop-in 160ms cubic-bezier(.22,1,.36,1) both; }
        .qs-input {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.07);
          color: #fff;
          border-radius: 9px;
          padding: 7px 10px;
          font-size: 11px;
          width: 100%;
          outline: none;
          transition: border-color 160ms, background 160ms, box-shadow 160ms;
        }
        .qs-input::placeholder { color: rgba(255,255,255,0.22); }
        .qs-input:focus {
          border-color: rgba(110,231,183,0.35);
          background: rgba(110,231,183,0.04);
          box-shadow: 0 0 0 2px rgba(110,231,183,0.08);
        }
        .qs-launch {
          position: relative;
          overflow: hidden;
          transition: opacity 160ms, transform 80ms;
        }
        .qs-launch:active { transform: scale(0.97); }
        .qs-launch.launching { animation: qs-ripple 440ms ease-out; }
        .qs-launch::before {
          content: '';
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0);
          transition: background 120ms;
        }
        .qs-launch:hover::before { background: rgba(255,255,255,0.06); }
        .qs-hint-btn {
          flex: 1;
          padding: 5px 4px;
          border-radius: 7px;
          font-size: 10px;
          font-weight: 600;
          transition: all 120ms;
          text-align: center;
          cursor: pointer;
          border: none;
          background: transparent;
        }
        .qs-hint-btn.active {
          background: rgba(110,231,183,0.15);
          color: #6EE7B7;
          box-shadow: inset 0 0 0 1px rgba(110,231,183,0.2);
        }
        .qs-hint-btn.inactive {
          color: rgba(255,255,255,0.3);
        }
        .qs-hint-btn.inactive:hover {
          color: rgba(255,255,255,0.55);
          background: rgba(255,255,255,0.05);
        }
      `}</style>

      <div className="qs-wrap px-3 py-3 space-y-2">

        {/* Section label */}
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
            Quick Start
          </p>
          {hasDocs && (
            <div className="flex items-center gap-1">
              {activeResumeId && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-medium"
                  style={{ background:"rgba(147,197,253,0.1)", color:"#93C5FD", border:"1px solid rgba(147,197,253,0.15)" }}>
                  <FileText size={8} />Resume
                </span>
              )}
              {activeJdId && (
                <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-medium"
                  style={{ background:"rgba(249,168,212,0.1)", color:"#F9A8D4", border:"1px solid rgba(249,168,212,0.15)" }}>
                  <FileSearch size={8} />JD
                </span>
              )}
            </div>
          )}
        </div>

        {/* Company + Role inputs */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="relative">
            <Building2
              size={10}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color:"rgba(255,255,255,0.2)" }}
            />
            <input
              ref={companyRef}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Company"
              className="qs-input"
              style={{ paddingLeft: 22 }}
            />
          </div>
          <div className="relative">
            <Briefcase
              size={10}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color:"rgba(255,255,255,0.2)" }}
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Role"
              className="qs-input"
              style={{ paddingLeft: 22 }}
            />
          </div>
        </div>

        {/* Interview type custom dropdown */}
        <div ref={dropRef} className="relative">
          <button
            onClick={() => setTypeOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 qs-input"
            style={{ cursor:"pointer", textAlign:"left" }}
          >
            <span className="flex items-center gap-1.5">
              <span>{selectedType?.icon}</span>
              <span style={{ color:"rgba(255,255,255,0.75)", fontSize:11 }}>{selectedType?.label}</span>
            </span>
            <ChevronDown
              size={11}
              style={{
                color:"rgba(255,255,255,0.3)",
                transform: typeOpen ? "rotate(180deg)" : "rotate(0deg)",
                transition:"transform 160ms",
                flexShrink:0,
              }}
            />
          </button>

          {typeOpen && (
            <div
              className="qs-drop absolute left-0 right-0 z-50 mt-1 py-1 rounded-xl overflow-hidden"
              style={{
                background:"#0f0f1a",
                border:"1px solid rgba(255,255,255,0.1)",
                boxShadow:"0 16px 40px rgba(0,0,0,0.7)",
                transformOrigin:"top center",
              }}
            >
              {INTERVIEW_TYPES.map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setInterviewType(t.value); setTypeOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
                  style={{
                    fontSize:11,
                    color: t.value === interviewType ? "#6EE7B7" : "rgba(255,255,255,0.6)",
                    background: t.value === interviewType ? "rgba(110,231,183,0.08)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (t.value !== interviewType)
                      (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                  }}
                  onMouseLeave={(e) => {
                    if (t.value !== interviewType)
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                  {t.value === interviewType && (
                    <span className="ml-auto text-[9px]" style={{ color:"#6EE7B7" }}>✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Hint style selector */}
        <div>
          <p className="text-[9px] mb-1 font-medium" style={{ color:"rgba(255,255,255,0.22)" }}>
            Hint depth
          </p>
          <div
            className="flex gap-1 p-0.5 rounded-lg"
            style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)" }}
          >
            {HINT_STYLES.map((hs) => (
              <button
                key={hs.value}
                onClick={() => setHintStyle(hs.value)}
                className={cn("qs-hint-btn", hintStyle === hs.value ? "active" : "inactive")}
                title={hs.desc}
              >
                {hs.label}
              </button>
            ))}
          </div>
        </div>

        {/* Launch button */}
        <button
          onClick={handleSubmit}
          disabled={isLaunching}
          className={cn("qs-launch w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-white", isLaunching && "launching")}
          style={{
            background: isLaunching
              ? "linear-gradient(135deg,rgba(52,211,153,0.5),rgba(20,184,166,0.5))"
              : "linear-gradient(135deg,rgba(52,211,153,0.85),rgba(20,184,166,0.85))",
            boxShadow: isLaunching ? "none" : "0 4px 16px rgba(52,211,153,0.25), inset 0 1px 0 rgba(255,255,255,0.15)",
          }}
        >
          {isLaunching ? (
            <>
              <svg
                width="12" height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                style={{ animation:"qs-spin 700ms linear infinite" }}
              >
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Starting…
            </>
          ) : (
            <>
              <Sparkles size={11} />
              Start Session
              <Zap size={11} />
            </>
          )}
        </button>
      </div>
    </>
  );
}
