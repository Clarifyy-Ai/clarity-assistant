import { useState, useEffect } from "react";
import { useDocumentStore } from "@/store/documentStore";
import { useAuthStore } from "@/store/userStore";
import { useOverlayStore } from "@/store/overlayStore";
import {
  Radio, FileText, Briefcase, Brain,  Volume2,
  ChevronDown, Settings2, Zap, Shield, Keyboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import type { LiveSessionConfig } from "@/types/session.types";
import type { PreferredAIModel, HintStyle, UserProfile } from "@/types/user.types";

interface PreSessionSetupProps {
  onStart: (config: LiveSessionConfig) => void;
  sessionType?: "live" | "mock";
}

const MODEL_OPTIONS: { id: PreferredAIModel; label: string; desc: string }[] = [
  { id: "gpt-4o",            label: "GPT-4o",           desc: "Best for nuanced answers" },
  { id: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet", desc: "Excellent reasoning" },
  { id: "gemini-1-5-pro",    label: "Gemini 1.5 Pro",   desc: "Fast, cost-effective" },
  { id: "gemini-flash",      label: "Gemini Flash",      desc: "Fastest response time" },
];

const INTERVIEW_TYPES = [
  { value: "behavioral",    label: "Behavioural" },
  { value: "technical",      label: "Technical" },
  { value: "system_design",  label: "System Design" },
  { value: "coding",         label: "Coding" },
  { value: "hr",             label: "HR / Culture Fit" },
  { value: "product",        label: "Product" },
  { value: "leadership",     label: "Leadership" },
];

export function PreSessionSetup({ onStart, sessionType = "live" }: PreSessionSetupProps) {
  const { profile } = useAuthStore();
  const resumes     = useDocumentStore((s) => s.resumes);
  const jds         = useDocumentStore((s) => s.jds);
  const activeResumeId = useDocumentStore((s) => s.active_resume_id);
  const activeJdId     = useDocumentStore((s) => s.active_jd_id);

  const [interviewType,     setInterviewType]     = useState("behavioral");
  const [resumeId,          setResumeId]          = useState<string | null>(activeResumeId);
  const [jdId,              setJdId]              = useState<string | null>(activeJdId);
  const [instructions,      setInstructions]      = useState("");
  const typedProfile = profile as UserProfile | null;
  const [model,             setModel]             = useState<PreferredAIModel>(
    typedProfile?.preferred_model ?? "gemini-flash"
  );
  const [hintStyle,         setHintStyle]         = useState<HintStyle>(
    typedProfile?.hint_style ?? "short_hints"
  );
  const [enableSystemAudio, setEnableSystemAudio] = useState(false);
  const [stealthMode,       setStealthMode]       = useState(true);
  const [showAdvanced,      setShowAdvanced]      = useState(false);

  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied" | "checking">("unknown");

  useEffect(() => {
    setResumeId(activeResumeId);
  }, [activeResumeId]);

  useEffect(() => {
    setJdId(activeJdId);
  }, [activeJdId]);

  const checkMicPermission = async () => {
    setMicPermission("checking");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission("granted");
    } catch {
      setMicPermission("denied");
    }
  };

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: "microphone" as PermissionName }).then((result) => {
        if (result.state === "granted") setMicPermission("granted");
        else if (result.state === "denied") setMicPermission("denied");
      }).catch(() => {});
    }
  }, []);

  function handleStart() {
    if (micPermission === "denied") return;
    const config: LiveSessionConfig = {
      company:             null,
      role:                null,
      hint_style:          hintStyle,
      model,
      stealth_mode:        stealthMode,
      resume_id:           resumeId,
      jd_id:               jdId,
      interview_type:      interviewType,
      instructions,
      enable_system_audio: enableSystemAudio,
    };

    useOverlayStore.getState().setActiveModel(model);
    useOverlayStore.getState().setHintStyle(hintStyle);
    useOverlayStore.getState().setStealthMode(stealthMode);

    onStart(config);
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-400 text-sm font-medium mb-4">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            {sessionType === "live" ? "Live Co-pilot" : "Mock Interview"}
          </div>
          <h1 className="text-3xl font-bold text-white">
            {sessionType === "live" ? "Real-Time Interview Assistance" : "Practice Interview Session"}
          </h1>
          <p className="text-gray-400 mt-2 text-sm">
            Configure your session below, then start when ready.
          </p>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Interview Type
            </label>
            <select
              value={interviewType}
              onChange={(e) => setInterviewType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500"
            >
              {INTERVIEW_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
                <FileText className="w-3.5 h-3.5" /> Resume
              </label>
              <select
                value={resumeId ?? ""}
                onChange={(e) => setResumeId(e.target.value || null)}
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
              >
                <option value="">None selected</option>
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>{r.title || r.file_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
                <Briefcase className="w-3.5 h-3.5" /> Job Description
              </label>
              <select
                value={jdId ?? ""}
                onChange={(e) => setJdId(e.target.value || null)}
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-3 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
              >
                <option value="">None selected</option>
                {jds.map((j) => (
                  <option key={j.id} value={j.id}>{j.title || j.company_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Instructions (optional)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Focus on STAR method, emphasise leadership examples, keep answers under 2 minutes..."
              rows={3}
              className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 text-sm resize-none"
            />
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-gray-300 mb-2">
              <Brain className="w-3.5 h-3.5" /> AI Model
            </label>
            <div className="grid grid-cols-2 gap-2">
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModel(m.id)}
                  className={cn(
                    "text-left px-3 py-2 rounded-xl border text-sm transition-all",
                    model === m.id
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                  )}
                >
                  <p className="font-medium text-xs">{m.label}</p>
                  <p className="text-[10px] mt-0.5 opacity-60">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-3 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={enableSystemAudio}
                onChange={(e) => setEnableSystemAudio(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-emerald-500"
              />
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5" /> System Audio
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Capture interviewer audio</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer flex-1">
              <input
                type="checkbox"
                checked={stealthMode}
                onChange={(e) => setStealthMode(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-emerald-500"
              />
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> Stealth Mode
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Hidden from screen share</p>
              </div>
            </label>
          </div>

          <button
            onClick={() => setShowAdvanced((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
          >
            <Settings2 className="w-3 h-3" />
            Advanced settings
            <ChevronDown className={cn("w-3 h-3 transition-transform", showAdvanced && "rotate-180")} />
          </button>

          {showAdvanced && (
            <div className="space-y-4 pt-2 border-t border-white/5">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Hint Style</label>
                <select
                  value={hintStyle}
                  onChange={(e) => setHintStyle(e.target.value as HintStyle)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500 text-sm"
                >
                  <option value="full_answer">Full Answer</option>
                  <option value="short_hints">Short Hints</option>
                  <option value="keywords_only">Keywords Only</option>
                </select>
              </div>

              <div className="bg-black/30 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                  <Keyboard className="w-3 h-3 inline mr-1" />
                  Hotkeys
                </p>
                {[
                  { keys: ["ctrl", "shift", "h"], label: "Toggle overlay" },
                  { keys: ["ctrl", "shift", "s"], label: "Stealth mode" },
                  { keys: ["ctrl", "shift", "c"], label: "Screenshot + analyse" },
                  { keys: ["ctrl", "shift", "p"], label: "Panic button" },
                  { keys: ["escape"],             label: "Clear hint" },
                ].map((hk) => (
                  <div key={hk.label} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">{hk.label}</span>
                    <kbd className="px-2 py-0.5 bg-white/10 rounded text-gray-300 font-mono">
                      {formatHotkeyLabel(hk.keys)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {micPermission === "denied" && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
            <p className="text-sm text-red-400 font-medium mb-1">Microphone access denied</p>
            <p className="text-xs text-red-400/60">
              Please allow microphone access in your browser settings, then reload this page.
            </p>
          </div>
        )}

        {micPermission !== "granted" && micPermission !== "denied" && (
          <button
            onClick={checkMicPermission}
            disabled={micPermission === "checking"}
            className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 text-sm mb-2"
          >
            {micPermission === "checking" ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Checking permissions…
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                Check microphone access
              </>
            )}
          </button>
        )}

        <button
          onClick={handleStart}
          disabled={micPermission === "denied"}
          className={cn(
            "w-full py-3.5 font-semibold rounded-xl transition-all flex items-center justify-center gap-2",
            micPermission === "denied"
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
          )}
        >
          <Zap className="w-4 h-4" />
          {sessionType === "live" ? "Start Live Co-pilot" : "Start Mock Session"}
        </button>
      </div>
    </div>
  );
}
