import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CodingCaseResultsTable } from "@/components/coding/CodingCaseResultsTable";
import {
  APPROVED_CODING_LANGUAGES,
  isAutoExecutedLanguage,
  isPracticeLanguageFamilyMatch,
  languageOptionLabel,
} from "@/lib/coding/languages";
import { runJavascriptSolveTests, type SolveCaseResult } from "@/lib/coding/javascriptSolveRunner";
import { resolveJavascriptSolveStarter } from "@/lib/coding/starterCode";
import {
  parseCodingUserAnswer,
  serializeCodingUserAnswer,
  type PlayableQuestionCoding,
} from "@/lib/question-bank/codingMetadata";
import { cn } from "@/lib/utils";

type Props = {
  config: PlayableQuestionCoding;
  value: string;
  onChange: (serialized: string) => void;
  disabled?: boolean;
};

export function MockTestCodingPanel({ config, value, onChange, disabled }: Props) {
  const parsed = parseCodingUserAnswer(value);
  const [code, setCode] = useState(parsed?.code ?? resolveJavascriptSolveStarter(config.starter_code));
  const [language, setLanguage] = useState(
    parsed?.language && isPracticeLanguageFamilyMatch(parsed.language, config.language)
      ? parsed.language
      : config.language,
  );
  const [sampleResults, setSampleResults] = useState<SolveCaseResult[]>([]);
  const [sampleBusy, setSampleBusy] = useState(false);

  useEffect(() => {
    const next = parseCodingUserAnswer(value);
    if (next?.code) setCode(next.code);
    if (next?.language) setLanguage(next.language);
  }, [value]);

  const autoScore = isAutoExecutedLanguage(language);

  const visibleCases = useMemo(
    () => config.test_cases.map((c, idx) => ({
      id: `visible-${idx}`,
      name: c.name,
      input: c.input_json,
      expected: c.expected_json,
    })),
    [config.test_cases],
  );

  function persist(nextCode: string, nextLang: string) {
    onChange(serializeCodingUserAnswer({ code: nextCode, language: nextLang }));
  }

  function runSample() {
    if (!autoScore) return;
    setSampleBusy(true);
    try {
      const outcome = runJavascriptSolveTests(code, visibleCases);
      setSampleResults(outcome.results);
    } finally {
      setSampleBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">Code your solution</p>
        {languageSelectable(config.language) && (
          <select
            value={language}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value;
              setLanguage(next);
              persist(code, next);
            }}
            className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
          >
            {APPROVED_CODING_LANGUAGES.filter((lang) =>
              isPracticeLanguageFamilyMatch(lang, config.language),
            ).map((lang) => (
              <option key={lang} value={lang}>
                {languageOptionLabel(lang)}
              </option>
            ))}
          </select>
        )}
      </div>
      {(config.sample_input || config.sample_output) && (
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/80 p-2 font-mono">
            <span className="font-medium text-muted-foreground">Sample input:</span> {config.sample_input}
          </div>
          <div className="rounded-lg border border-border/60 bg-background/80 p-2 font-mono">
            <span className="font-medium text-muted-foreground">Sample output:</span> {config.sample_output}
          </div>
        </div>
      )}
      <textarea
        value={code}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value;
          setCode(next);
          persist(next, language);
        }}
        spellCheck={false}
        className={cn(
          "min-h-[220px] w-full rounded-xl border-2 border-border bg-background px-3 py-3 font-mono text-sm",
          "focus:border-violet-500 focus:outline-none focus:ring-4 focus:ring-violet-500/10",
        )}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || sampleBusy || !autoScore}
          loading={sampleBusy}
          onClick={runSample}
        >
          Run visible tests
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            const starter = resolveJavascriptSolveStarter(config.starter_code);
            setCode(starter);
            persist(starter, language);
            setSampleResults([]);
          }}
        >
          Reset to starter
        </Button>
      </div>
      {!autoScore && (
        <p className="text-xs text-muted-foreground">
          Only JavaScript/TypeScript solutions are auto-scored in mock tests right now.
        </p>
      )}
      {sampleResults.length > 0 && <CodingCaseResultsTable cases={sampleResults} />}
    </div>
  );
}

function languageSelectable(requiredLanguage: string): boolean {
  const matches = APPROVED_CODING_LANGUAGES.filter((lang) =>
    isPracticeLanguageFamilyMatch(lang, requiredLanguage),
  );
  return matches.length > 1;
}
