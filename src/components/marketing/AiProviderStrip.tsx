import { m } from "framer-motion";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "gemini", label: "Google Gemini", sub: "Live coach default", color: "from-blue-500/20 to-primary/20 border-blue-500/30 text-blue-300" },
  { id: "openai", label: "OpenAI GPT-4o", sub: "Deep reasoning", color: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30 text-emerald-300" },
  { id: "claude", label: "Anthropic Claude", sub: "System design", color: "from-amber-500/20 to-orange-500/20 border-amber-500/30 text-amber-300" },
  { id: "deepgram", label: "Deepgram", sub: "Live transcription", color: "from-cyan-500/20 to-sky-500/20 border-cyan-500/30 text-cyan-300" },
] as const;

interface AiProviderStripProps {
  className?: string;
  compact?: boolean;
}

export function AiProviderStrip({ className, compact }: AiProviderStripProps) {
  return (
    <div className={cn("w-full", className)}>
      {!compact && (
        <p className="text-center text-xs text-muted-foreground mb-4">
          Intelligent model routing — pick the best AI for each task
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        {PROVIDERS.map((p, i) => (
          <m.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl border bg-gradient-to-r px-3 py-2",
              p.color,
            )}
          >
            <span className="text-xs font-semibold">{p.label}</span>
            {!compact && (
              <span className="hidden sm:inline text-[10px] opacity-70">{p.sub}</span>
            )}
          </m.div>
        ))}
      </div>
    </div>
  );
}
