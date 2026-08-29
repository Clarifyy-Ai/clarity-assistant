import { parseHybridSource, hybridSourceLabel } from "@/lib/hybrid/hybridSourceMeta";
import { cn } from "@/lib/utils";

type HybridSourceLineProps = {
  data?: unknown;
  source?: string | null;
  className?: string;
};

/** Small "Source: …" line when hybrid metadata is present. */
export function HybridSourceLine({ data, source: sourceProp, className }: HybridSourceLineProps) {
  const label = hybridSourceLabel(sourceProp ?? parseHybridSource(data));
  if (!label) return null;
  return (
    <p className={cn("text-[11px] text-muted-foreground", className)}>
      Source: {label}
    </p>
  );
}
