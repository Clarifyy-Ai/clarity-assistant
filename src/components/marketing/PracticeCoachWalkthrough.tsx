import { useEffect, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Mic, Brain, Monitor, Zap, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

const STEPS = [
  {
    id: "capture",
    num: "01",
    icon: Mic,
    title: "Capture your practice audio",
    desc: "Deepgram transcribes interviewer questions in real time while you rehearse aloud.",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
  },
  {
    id: "ai",
    num: "02",
    icon: Brain,
    title: "AI routes to the best model",
    desc: "Gemini Flash for speed, GPT-4o for depth, Claude for system design — picked automatically.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
  },
  {
    id: "overlay",
    num: "03",
    icon: Monitor,
    title: "Hints appear on your overlay",
    desc: "STAR talking points stream to your practice overlay in under a second. Visible on screen share — practice only.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
  },
] as const;

const MODEL_CYCLE = ["Gemini 2.0 Flash", "GPT-4o", "Claude 3.5 Sonnet"];

function CaptureDemo() {
  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Mic className="w-4 h-4 text-primary" />
        <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
          Listening…
        </span>
      </div>
      <div className="flex items-end justify-center gap-1 h-10">
        {Array.from({ length: 24 }).map((_, i) => (
          <m.div
            key={i}
            className="w-1 rounded-full bg-primary/70"
            animate={{ height: ["20%", `${30 + Math.random() * 70}%`, "25%"] }}
            transition={{
              duration: 0.8 + (i % 5) * 0.1,
              repeat: Infinity,
              delay: i * 0.04,
            }}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground italic text-center">
        &ldquo;Tell me about a conflict with a teammate…&rdquo;
      </p>
    </div>
  );
}

function AiRoutingDemo() {
  const [modelIdx, setModelIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setModelIdx((i) => (i + 1) % MODEL_CYCLE.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
          Model router
        </span>
        <Zap className="w-3.5 h-3.5 text-amber-400" />
      </div>
      <AnimatePresence mode="wait">
        <m.div
          key={modelIdx}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-center"
        >
          <p className="text-sm font-bold text-foreground">{MODEL_CYCLE[modelIdx]}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Selected for this question</p>
        </m.div>
      </AnimatePresence>
      <div className="flex justify-center gap-2">
        {MODEL_CYCLE.map((m, i) => (
          <span
            key={m}
            className={cn(
              "h-1.5 w-6 rounded-full transition-colors",
              i === modelIdx ? "bg-blue-500" : "bg-secondary",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function OverlayDemo() {
  const [chars, setChars] = useState(0);
  const hint =
    "Situation: Two engineers disagreed on architecture. Task: Align the team before sprint deadline…";

  useEffect(() => {
    setChars(0);
    const t = setInterval(() => {
      setChars((c) => {
        if (c >= hint.length) return c;
        return c + 2;
      });
    }, 30);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
          Practice overlay
        </span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed min-h-[48px]">
        {hint.slice(0, chars)}
        {chars < hint.length && (
          <span className="inline-block w-1 h-3 bg-emerald-400 ml-0.5 animate-pulse" />
        )}
      </p>
      <p className="text-[9px] text-muted-foreground/70">
        Compliance: overlay remains visible during screen share
      </p>
    </div>
  );
}

const DEMO_MAP = {
  capture: CaptureDemo,
  ai: AiRoutingDemo,
  overlay: OverlayDemo,
} as const;

export function PracticeCoachWalkthrough() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % STEPS.length), 4500);
    return () => clearInterval(t);
  }, []);

  const step = STEPS[active];
  const Demo = DEMO_MAP[step.id];

  return (
    <section className="pb-14 sm:pb-16 px-4 sm:px-6 overflow-visible">
      <div className="max-w-6xl mx-auto overflow-visible">
        <m.div
          className="text-center mb-10 px-1 sm:px-2"
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <p className="text-[11px] font-semibold tracking-wide text-primary mb-2">
            {PRODUCT_NAMES.practiceCoach.toUpperCase()}
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-balance">
            How {PRODUCT_NAMES.practiceCoach} works
          </h2>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed text-pretty">
            Three steps from question to coached answer — powered by multi-model AI routing
            and sub-second overlay delivery.
          </p>
        </m.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          <div className="space-y-3">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === active;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(i)}
                  className={cn(
                    "w-full text-left rounded-2xl border p-4 transition-all",
                    isActive
                      ? cn(s.border, s.bg, "shadow-lg")
                      : "border-border bg-card/50 hover:border-border/80",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                        s.bg,
                      )}
                    >
                      <Icon className={cn("w-5 h-5", s.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-primary/40">{s.num}</span>
                        {isActive && (
                          <m.span
                            layoutId="active-pill"
                            className="text-[9px] px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold"
                          >
                            Active
                          </m.span>
                        )}
                      </div>
                      <h3 className="text-sm font-bold">{s.title}</h3>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {s.desc}
                      </p>
                    </div>
                    <ArrowRight
                      className={cn(
                        "w-4 h-4 shrink-0 mt-1 transition-opacity",
                        isActive ? "opacity-100 text-primary" : "opacity-0",
                      )}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <m.div
              key={step.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35 }}
              className="rounded-2xl border border-border bg-card p-5 shadow-xl"
            >
              <Demo />
            </m.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
