import { useState } from "react";
import { useDocumentStore } from "@/store/documentStore";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LiveSessionConfig } from "@/types/session.types";
import type { HintStyle } from "@/types/user.types";

const INTERVIEW_TYPES = [
  { value: "behavioral", label: "Behavioural" },
  { value: "technical", label: "Technical" },
  { value: "system_design", label: "System Design" },
  { value: "coding", label: "Coding" },
  { value: "hr", label: "HR" },
  { value: "product", label: "Product" },
  { value: "leadership", label: "Leadership" },
];

const HINT_STYLES: { value: HintStyle; label: string }[] = [
  { value: "full_answer", label: "Full" },
  { value: "short_hints", label: "Short" },
  { value: "keywords_only", label: "Keywords" },
];

interface OverlayQuickStartProps {
  onStart: (config: LiveSessionConfig) => void;
}

export function OverlayQuickStart({ onStart }: OverlayQuickStartProps) {
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId = useDocumentStore((s) => s.active_jd_id);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [interviewType, setInterviewType] = useState("behavioral");
  const [hintStyle, setHintStyle] = useState<HintStyle>("short_hints");

  function handleSubmit() {
    const config: LiveSessionConfig = {
      company: company.trim() || null,
      role: role.trim() || null,
      hint_style: hintStyle,
      model: "gemini-flash",
      smart_routing: false,
      stealth_mode: true,
      resume_id: activeResumeId,
      jd_id: activeJdId,
      interview_type: interviewType,
      instructions: "",
      enable_system_audio: false,
    };
    onStart(config);
  }

  return (
    <div className="px-3 py-3 space-y-2.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/50">
        Quick Start
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          placeholder="Company"
          className="bg-white/5 border border-white/5 text-white placeholder-muted-foreground/30 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-brand-400/30"
        />
        <input
          value={role}
          onChange={(e) => setRole(e.target.value)}
          placeholder="Role"
          className="bg-white/5 border border-white/5 text-white placeholder-muted-foreground/30 rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-brand-400/30"
        />
      </div>

      <div className="flex gap-1.5">
        <select
          value={interviewType}
          onChange={(e) => setInterviewType(e.target.value)}
          className="flex-1 bg-white/5 border border-white/5 text-white rounded-lg px-2 py-1.5 text-[11px] focus:outline-none focus:border-brand-400/30"
        >
          {INTERVIEW_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <div className="flex bg-white/5 border border-white/5 rounded-lg overflow-hidden">
          {HINT_STYLES.map((hs) => (
            <button
              key={hs.value}
              onClick={() => setHintStyle(hs.value)}
              className={cn(
                "px-2 py-1.5 text-xs font-medium transition-colors",
                hintStyle === hs.value
                  ? "bg-brand-500/20 text-brand-300"
                  : "text-muted-foreground/40 hover:text-muted-foreground/60"
              )}
            >
              {hs.label}
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-emerald-600/80 to-teal-600/80 hover:from-emerald-500/80 hover:to-teal-500/80 text-white text-xs font-semibold rounded-lg transition-all"
      >
        <Zap className="w-3 h-3" />
        Start Session
      </button>
    </div>
  );
}
