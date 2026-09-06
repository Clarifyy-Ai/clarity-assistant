import { useCallback, useEffect, useRef, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Mic, Brain, Zap, BarChart2, CheckCircle2, Landmark } from "lucide-react";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { cn } from "@/lib/utils";

const PILLAR_CYCLE_MS = 5_500;

const FEATURES = [
  {
    id: "coach",
    icon: Mic,
    title: "Practice Coach",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    activeBorder: "border-primary/40",
  },
  {
    id: "mock",
    icon: Brain,
    title: PRODUCT_NAMES.mockInterview,
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    activeBorder: "border-blue-500/40",
  },
  {
    id: "prep",
    icon: Zap,
    title: "Prep Lab",
    color: "text-fuchsia-400",
    bg: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/20",
    activeBorder: "border-fuchsia-500/40",
  },
  {
    id: "analytics",
    icon: BarChart2,
    title: "Analytics",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    activeBorder: "border-emerald-500/40",
  },
  {
    id: "gov-exams",
    icon: Landmark,
    title: PRODUCT_NAMES.govExams,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    activeBorder: "border-amber-500/40",
  },
] as const;

type FeatureId = (typeof FEATURES)[number]["id"];

function CoachScreen() {
  const [line, setLine] = useState(0);
  const hints = [
    "💡 Lead with the conflict context",
    "💡 Quantify the business impact",
    "💡 End with what you learned",
  ];
  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % hints.length), 2000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
        <p className="text-[10px] text-primary font-semibold mb-1">Live hint</p>
        <AnimatePresence mode="wait">
          <m.p
            key={line}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="text-xs text-foreground"
          >
            {hints[line]}
          </m.p>
        </AnimatePresence>
      </div>
      <div className="flex gap-2">
        {["Gemini", "GPT-4o", "Claude"].map((m) => (
          <span key={m} className="text-[9px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
            {m}
          </span>
        ))}
      </div>
    </div>
  );
}

function MockScreen() {
  const scores = [
    { label: "Confidence", v: 82 },
    { label: "Clarity", v: 91 },
    { label: "Filler words", v: 68 },
  ];
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold">Session scorecard</p>
      {scores.map((s, i) => (
        <div key={s.label}>
          <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
            <span>{s.label}</span>
            <span>{s.v}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <m.div
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${s.v}%` }}
              transition={{ delay: i * 0.2, duration: 0.7 }}
            />
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">AI debrief ready · 3 weak spots identified</p>
    </div>
  );
}

function PrepScreen() {
  const fields = ["Situation", "Task", "Action", "Result"];
  const [filled, setFilled] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFilled((f) => (f >= fields.length ? 0 : f + 1)), 1200);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold">STAR Builder</p>
      {fields.map((f, i) => (
        <div
          key={f}
          className={cn(
            "rounded-lg border px-3 py-2 text-[10px] transition-colors",
            i < filled ? "border-fuchsia-500/30 bg-fuchsia-500/10 text-foreground" : "border-border text-muted-foreground",
          )}
        >
          {f}: {i < filled ? "✓ Generated" : "…"}
        </div>
      ))}
    </div>
  );
}

function AnalyticsScreen() {
  const bars = [40, 55, 48, 72, 65, 80, 88];
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold">7-day confidence trend</p>
      <div className="flex items-end gap-1.5 h-20">
        {bars.map((h, i) => (
          <m.div
            key={i}
            className="flex-1 bg-emerald-500/60 rounded-sm"
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ delay: i * 0.08, duration: 0.5 }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10px] text-emerald-400">
        <CheckCircle2 className="w-3 h-3" />
        +12% vs last week
      </div>
    </div>
  );
}

function GovExamScreen() {
  const [answered, setAnswered] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setAnswered((a) => (a >= 12 ? 2 : a + 1)), 900);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold">UPSC CSE · Paper 1</span>
        <span className="font-mono text-amber-400">01:47:23</span>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {Array.from({ length: 16 }, (_, i) => (
          <m.div
            key={i}
            animate={{
              backgroundColor:
                i < answered ? "rgba(34, 197, 94, 0.25)" : i === answered ? "rgba(245, 158, 11, 0.3)" : "rgba(148, 163, 184, 0.12)",
            }}
            className="aspect-square rounded text-[8px] flex items-center justify-center font-bold border border-border"
          >
            {i + 1}
          </m.div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Timed exam mode · negative marking · official PYP format
      </p>
    </div>
  );
}

const SCREENS = {
  coach: CoachScreen,
  mock: MockScreen,
  prep: PrepScreen,
  analytics: AnalyticsScreen,
  "gov-exams": GovExamScreen,
} as const;

function PreviewPanel({
  feature,
  Screen,
  className,
}: {
  feature: (typeof FEATURES)[number];
  Screen: (typeof SCREENS)[FeatureId];
  className?: string;
}) {
  const Icon = feature.icon;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card p-5 sm:p-6 overflow-hidden",
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", feature.bg)}>
          <Icon className={cn("w-4 h-4", feature.color)} />
        </div>
        <span className="text-sm font-bold">{feature.title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">Live preview</span>
      </div>
      <AnimatePresence mode="wait">
        <m.div
          key={feature.id}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.25 }}
        >
          <Screen />
        </m.div>
      </AnimatePresence>
    </div>
  );
}

export function FeatureShowcase() {
  const [active, setActive] = useState<FeatureId>("coach");
  const [paused, setPaused] = useState(false);
  const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const feature = FEATURES.find((f) => f.id === active)!;
  const Screen = SCREENS[active];

  const advancePillar = useCallback(() => {
    setActive((current) => {
      const idx = FEATURES.findIndex((f) => f.id === current);
      return FEATURES[(idx + 1) % FEATURES.length].id;
    });
  }, []);

  const resetCycleTimer = useCallback(() => {
    if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    if (paused) return;
    cycleTimerRef.current = setInterval(advancePillar, PILLAR_CYCLE_MS);
  }, [advancePillar, paused]);

  useEffect(() => {
    resetCycleTimer();
    return () => {
      if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
    };
  }, [resetCycleTimer]);

  const selectPillar = (id: FeatureId) => {
    setActive(id);
    resetCycleTimer();
  };

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6 items-start overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div className="lg:col-span-2 flex flex-col gap-2 min-w-0">
        {FEATURES.map((f) => {
          const FIcon = f.icon;
          const isActive = f.id === active;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => selectPillar(f.id)}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl border p-3 text-left transition-all",
                isActive
                  ? cn(f.activeBorder, f.bg)
                  : "border-border bg-card/40 hover:bg-card/70",
              )}
            >
              <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", f.bg)}>
                <FIcon className={cn("w-4 h-4", f.color)} />
              </div>
              <span className={cn("text-sm font-semibold flex-1 min-w-0", isActive && f.color)}>
                {f.title}
              </span>
              {isActive && (
                <m.span
                  layoutId="feature-showcase-active"
                  className="text-[9px] px-2 py-0.5 rounded-full bg-background/80 text-muted-foreground font-semibold shrink-0"
                >
                  Live
                </m.span>
              )}
            </button>
          );
        })}
      </div>

      <div className="lg:hidden min-w-0">
        <PreviewPanel feature={feature} Screen={Screen} />
      </div>

      <PreviewPanel
        feature={feature}
        Screen={Screen}
        className="hidden lg:block lg:col-span-3 lg:min-h-[260px]"
      />
    </div>
  );
}
