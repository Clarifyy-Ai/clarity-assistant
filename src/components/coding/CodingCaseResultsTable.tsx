import type { SolveCaseResult } from "@/lib/coding/javascriptSolveRunner";
import { previewSolveValue } from "@/lib/coding/javascriptSolveRunner";
import { Badge } from "@/components/ui/Badge";

export function CodingCaseResultsTable({
  cases,
  "data-testid": testId = "coding-case-results",
}: {
  cases: SolveCaseResult[];
  "data-testid"?: string;
}) {
  if (!cases.length) return null;

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-border" data-testid={testId}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-secondary/30 text-left text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Case</th>
            <th className="px-2 py-1.5 font-medium">Input</th>
            <th className="px-2 py-1.5 font-medium">Result</th>
            <th className="px-2 py-1.5 font-medium">Output</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((row) => (
            <tr key={row.id} className="border-b border-border/60 align-top">
              <td className="px-2 py-1.5 whitespace-nowrap">
                <div className="flex items-center gap-1.5">
                  <Badge variant={row.passed ? "emerald" : "red"} size="sm">
                    {row.passed ? "Pass" : "Fail"}
                  </Badge>
                  <span>{row.name}</span>
                </div>
              </td>
              <td className="px-2 py-1.5 font-mono text-muted-foreground">
                {row.input_preview ?? "—"}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {row.error ? (
                  <span className="text-red-400">{row.error}</span>
                ) : (
                  "OK"
                )}
                {row.stderr && (
                  <p className="mt-1 font-mono text-[10px] text-amber-400/90">
                    stderr: {row.stderr}
                  </p>
                )}
              </td>
              <td className="px-2 py-1.5 font-mono">
                {row.actual !== undefined ? previewSolveValue(row.actual, 120) : "—"}
                {row.stdout && (
                  <p className="mt-1 text-[10px] text-muted-foreground">stdout: {row.stdout}</p>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
