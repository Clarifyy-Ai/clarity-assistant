import type { ReactNode } from "react";

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export type StarFieldKey = "situation" | "task" | "action" | "result";

export type StarFields = Record<StarFieldKey, string>;

export const STAR_SECTION_LABELS: Record<StarFieldKey, string> = {
  situation: "Situation",
  task: "Task",
  action: "Action",
  result: "Result",
};

export const STAR_PROMPTS: Record<StarFieldKey, string> = {
  situation: "Set the scene. What was the context? When and where did this happen?",
  task: "What was your responsibility or challenge in this situation?",
  action: "What specific steps did YOU take? Use 'I', not 'we'.",
  result: "What was the outcome? Include metrics if possible (%, $, time saved).",
};

const SECTION_COLORS: Record<StarFieldKey, string> = {
  situation: "bg-blue-500/10 text-blue-400",
  task: "bg-primary/10 text-primary",
  action: "bg-emerald-500/10 text-emerald-400",
  result: "bg-amber-500/10 text-amber-400",
};

const STAR_KEYS = Object.keys(STAR_PROMPTS) as StarFieldKey[];

export type StarBuilderFormProps = {
  question: string;
  onQuestionChange: (value: string) => void;
  star: StarFields;
  onStarChange: (key: StarFieldKey, value: string) => void;
  competencyTag?: string;
  onCompetencyTagChange?: (value: string) => void;
  layout?: "grid" | "stack";
  renderSectionActions?: (key: StarFieldKey, wordCount: number) => ReactNode;
  questionPlaceholder?: string;
  draftBadge?: string | null;
};

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function StarBuilderForm({
  question,
  onQuestionChange,
  star,
  onStarChange,
  competencyTag,
  onCompetencyTagChange,
  layout = "grid",
  renderSectionActions,
  questionPlaceholder = "e.g. Tell me about a time you resolved a conflict at work.",
  draftBadge = null,
}: StarBuilderFormProps): JSX.Element {
  const showCompetency = onCompetencyTagChange !== undefined;

  return (
    <div className="space-y-4">
      {draftBadge && (
        <p
          role="status"
          className="text-xs font-medium text-amber-700 dark:text-amber-300 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
        >
          {draftBadge}
        </p>
      )}
      <Card>
        <p className="text-xs font-medium text-foreground mb-2">
          Interview question you&apos;re preparing for
        </p>
        <input
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          placeholder={questionPlaceholder}
          className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
        />
      </Card>

      <div
        className={cn(
          layout === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 gap-4"
            : "space-y-4",
        )}
      >
        {STAR_KEYS.map((key) => {
          const label = STAR_SECTION_LABELS[key];
          const count = wordCount(star[key]);

          return (
            <Card key={key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-xs font-black uppercase px-2 py-0.5 rounded-lg",
                      SECTION_COLORS[key],
                    )}
                  >
                    {label[0]}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {renderSectionActions && (
                    <>
                      <span className="text-[10px] text-muted-foreground">{count}w</span>
                      {renderSectionActions(key, count)}
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">{STAR_PROMPTS[key]}</p>
              <textarea
                value={star[key]}
                onChange={(e) => onStarChange(key, e.target.value)}
                placeholder={`Write your ${key}…`}
                rows={3}
                className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              />
            </Card>
          );
        })}
      </div>

      {showCompetency && (
        <Card>
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Competency tag (optional)
          </label>
          <input
            type="text"
            value={competencyTag ?? ""}
            onChange={(e) => onCompetencyTagChange(e.target.value)}
            placeholder="e.g. leadership, conflict-resolution"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </Card>
      )}
    </div>
  );
}

export function parseStarResponse(text: string): StarFields {
  const out: StarFields = { situation: "", task: "", action: "", result: "" };
  const lower = text.toLowerCase();

  const sIdx = lower.indexOf("situation");
  const tIdx = lower.indexOf("task");
  const aIdx = lower.indexOf("action");
  const rIdx = lower.indexOf("result");

  function extract(start: number, end: number) {
    if (start < 0) return "";
    const raw = text.slice(start, end > 0 ? end : undefined);
    return raw.replace(/^[^:]*:\s*/i, "").trim();
  }

  out.situation = extract(sIdx, tIdx);
  out.task = extract(tIdx, aIdx);
  out.action = extract(aIdx, rIdx);
  out.result = extract(rIdx, -1);

  return out;
}

export function parseSavedStarAnswer(text: string): StarFields {
  const extract = (label: string) => {
    const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\n\\*\\*|$)`, "i");
    const match = text.match(re);
    return match?.[1]?.trim() ?? "";
  };
  return {
    situation: extract("Situation"),
    task: extract("Task"),
    action: extract("Action"),
    result: extract("Result"),
  };
}

export function buildStarAnswerText(parts: StarFields): string {
  return `**Situation:** ${parts.situation}\n\n**Task:** ${parts.task}\n\n**Action:** ${parts.action}\n\n**Result:** ${parts.result}`;
}
