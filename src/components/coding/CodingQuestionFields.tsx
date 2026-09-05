import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/Button";
import { CodingCaseResultsTable } from "@/components/coding/CodingCaseResultsTable";
import {
  APPROVED_CODING_LANGUAGES,
  CODING_SANDBOX_HONESTY,
  languageOptionLabel,
} from "@/lib/coding/languages";
import { runJavascriptSolveTests, type SolveCaseResult } from "@/lib/coding/javascriptSolveRunner";
import {
  buildQuestionCodingMetadata,
  DEFAULT_CODING_FORM_FIELDS,
  type QuestionCodingMetadata,
} from "@/lib/question-bank/codingMetadata";
import type { CodingCreateCaseFields } from "@/lib/coding/createQuestionCases";

export type CodingQuestionFieldValues = CodingCreateCaseFields & {
  language: string;
  starter_code: string;
};

type Props = {
  value: CodingQuestionFieldValues;
  onChange: (next: CodingQuestionFieldValues) => void;
  showTrySample?: boolean;
};

export function CodingQuestionFields({ value, onChange, showTrySample = true }: Props) {
  const [sampleResults, setSampleResults] = useState<SolveCaseResult[]>([]);
  const [sampleBusy, setSampleBusy] = useState(false);

  function patch(partial: Partial<CodingQuestionFieldValues>) {
    onChange({ ...value, ...partial });
  }

  async function trySample() {
    const built = buildQuestionCodingMetadata(value);
    if (!built.ok) {
      toast.error((built as { error: string }).error);
      return;
    }
    setSampleBusy(true);
    try {
      const visible = built.metadata.test_cases.filter((c) => !c.is_hidden);
      const outcome = runJavascriptSolveTests(
        value.starter_code,
        visible.map((c, idx) => ({
          id: `sample-${idx}`,
          name: c.name,
          input: c.input_json,
          expected: c.expected_json,
        })),
      );
      setSampleResults(outcome.results);
      if (outcome.execution_status === "passed") {
        toast.success("Starter code passes visible sample cases.");
      } else {
        toast.message("Sample run finished — check case results below.");
      }
    } finally {
      setSampleBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
      <div>
        <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Coding playground</p>
        <p className="text-xs text-muted-foreground">{CODING_SANDBOX_HONESTY}</p>
      </div>
      <div>
        <label className="text-xs text-muted-foreground" htmlFor="qb-coding-lang">Language</label>
        <select
          id="qb-coding-lang"
          value={value.language}
          onChange={(e) => patch({ language: e.target.value })}
          className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          {APPROVED_CODING_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {languageOptionLabel(lang)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground" htmlFor="qb-coding-starter">Starter code</label>
        <Textarea
          id="qb-coding-starter"
          className="mt-1 min-h-[140px] font-mono text-xs"
          value={value.starter_code}
          onChange={(e) => patch({ starter_code: e.target.value })}
          placeholder={DEFAULT_CODING_FORM_FIELDS.starter_code}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Define <code className="font-mono">solve(input)</code> returning JSON-serializable output.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-xs text-muted-foreground">Sample input (JSON)</label>
          <Input className="mt-1 font-mono text-xs" value={value.sampleInput} onChange={(e) => patch({ sampleInput: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sample output (JSON)</label>
          <Input className="mt-1 font-mono text-xs" value={value.sampleOutput} onChange={(e) => patch({ sampleOutput: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Visible case input</label>
          <Input className="mt-1 font-mono text-xs" value={value.visibleInput} onChange={(e) => patch({ visibleInput: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Visible case expected</label>
          <Input className="mt-1 font-mono text-xs" value={value.visibleExpected} onChange={(e) => patch({ visibleExpected: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Hidden case input</label>
          <Input className="mt-1 font-mono text-xs" value={value.hiddenInput} onChange={(e) => patch({ hiddenInput: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Hidden case expected</label>
          <Input className="mt-1 font-mono text-xs" value={value.hiddenExpected} onChange={(e) => patch({ hiddenExpected: e.target.value })} />
        </div>
      </div>
      {showTrySample && (
        <div className="space-y-2">
          <Button type="button" size="sm" variant="outline" loading={sampleBusy} onClick={() => void trySample()}>
            Run visible cases on starter code
          </Button>
          {sampleResults.length > 0 && <CodingCaseResultsTable cases={sampleResults} />}
        </div>
      )}
    </div>
  );
}

export function validateCodingQuestionFields(
  value: CodingQuestionFieldValues,
): { ok: true; metadata: QuestionCodingMetadata } | { ok: false; error: string } {
  return buildQuestionCodingMetadata(value);
}
