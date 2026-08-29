// Sprint D: Lightweight code scratchpad — monospace textarea with line numbers,
// language selector, copy + run-via-pasteboard. Zero dependencies.
import { useMemo, useState } from "react";
import { Copy, Trash2, Code2, Play } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { runVisibleJavascriptTests } from "@/lib/interview/jsVisibleRunner";

const LANGUAGES = [
  "javascript", "typescript", "python", "java", "cpp", "go", "rust", "sql",
] as const;

interface Props {
  initial?: string;
  className?: string;
}

export function CodeScratchpad({ initial = "", className }: Props) {
  const [code, setCode] = useState(initial);
  const [lang, setLang] = useState<(typeof LANGUAGES)[number]>("javascript");
  const [runOutput, setRunOutput] = useState<string | null>(null);

  const lineNumbers = useMemo(() => {
    const lines = code.split("\n").length || 1;
    return Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  }, [code]);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    toast.success("Copied to clipboard");
  };

  return (
    <div className={cn("rounded-xl border border-border bg-card overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/50">
        <Code2 className="w-3.5 h-3.5 text-primary" />
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as any)}
          className="bg-transparent text-xs font-mono outline-none"
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-muted-foreground ml-2">
          {code.length} chars · {code.split("\n").length} lines
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {lang === "javascript" && (
            <button
              type="button"
              onClick={() => {
                const result = runVisibleJavascriptTests(code, [
                  { id: "smoke", name: "solve() is callable", input: {}, expected: undefined },
                ]);
                if (result.blockedReason) {
                  setRunOutput(result.blockedReason);
                  return;
                }
                setRunOutput(
                  result.results
                    .map((r) => `${r.name}: ${r.passed ? "ok" : r.error ?? "failed"}`)
                    .join("\n") || "Define solve(input) to run visible tests.",
                );
              }}
              className="px-2 py-1 text-[11px] rounded-md border border-border hover:bg-secondary flex items-center gap-1"
            >
              <Play className="w-3 h-3" /> Run visible
            </button>
          )}
          <button
            onClick={copy}
            className="px-2 py-1 text-[11px] rounded-md border border-border hover:bg-secondary flex items-center gap-1"
          >
            <Copy className="w-3 h-3" /> Copy
          </button>
          <button
            onClick={() => setCode("")}
            className="px-2 py-1 text-[11px] rounded-md border border-border hover:bg-secondary flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        </div>
      </div>
      <div className="flex">
        <pre
          className="select-none text-right text-xs font-mono text-muted-foreground bg-secondary/30 px-3 py-3 leading-6 min-w-[2.5rem]"
          aria-hidden
        >
          {lineNumbers}
        </pre>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          placeholder="// Type or paste your solution here…"
          className="flex-1 bg-transparent outline-none font-mono text-xs leading-6 px-3 py-3 resize-y min-h-[260px]"
          onKeyDown={(e) => {
            if (e.key === "Tab") {
              e.preventDefault();
              const t = e.currentTarget;
              const s = t.selectionStart;
              const v = t.value;
              const next = v.slice(0, s) + "  " + v.slice(t.selectionEnd);
              setCode(next);
              requestAnimationFrame(() => {
                t.selectionStart = t.selectionEnd = s + 2;
              });
            }
          }}
        />
      </div>
      {runOutput && (
        <pre className="border-t border-border bg-secondary/30 px-3 py-2 text-[11px] font-mono text-muted-foreground whitespace-pre-wrap">
          {runOutput}
        </pre>
      )}
    </div>
  );
}
