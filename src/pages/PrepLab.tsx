// @ts-nocheck
import { useState } from "react";
import { useSTARBuilder } from "@/hooks/useSTARBuilder";
import { useDocuments } from "@/hooks/useDocuments";
import {
  Sparkles, Save, RefreshCw, Star, BookOpen,
  Tag, CheckCircle, AlertCircle, Loader2,
  BarChart2, Copy, Check, Heart, Trash2,
  Search, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AnswerCategory } from "@/types/document.types";

// ─────────────────────────────────────────────────────────────────
// PrepLab
// STAR Answer Builder + Answer Bank.
// ─────────────────────────────────────────────────────────────────

const ANSWER_CATEGORIES: {
  value: AnswerCategory;
  label: string;
  icon:  string;
}[] = [
  { value: "leadership",      label: "Leadership",      icon: "👑" },
  { value: "conflict",        label: "Conflict",        icon: "⚡" },
  { value: "teamwork",        label: "Teamwork",        icon: "🤝" },
  { value: "technical",       label: "Technical",       icon: "💻" },
  { value: "problem_solving", label: "Problem Solving", icon: "🧩" },
  { value: "failure",         label: "Failure",         icon: "📉" },
  { value: "achievement",     label: "Achievement",     icon: "🏆" },
  { value: "other",           label: "Other",           icon: "📝" },
];

const STAR_PLACEHOLDERS: Record<string, string> = {
  situation: "Set the context. Where were you? What was the challenge or background?",
  task:      "What was your responsibility? What were you asked to do?",
  action:    "What specific steps did YOU take? Use 'I', not 'we'. Be concrete.",
  result:    "What was the outcome? Quantify where possible (%, time saved, revenue…).",
};

const STAR_COLORS: Record<string, { label: string; color: string; bg: string }> = {
  situation: { label: "S — Situation", color: "text-blue-400",    bg: "border-blue-500/30" },
  task:      { label: "T — Task",      color: "text-yellow-400",  bg: "border-yellow-500/30" },
  action:    { label: "A — Action",    color: "text-violet-400",  bg: "border-violet-500/30" },
  result:    { label: "R — Result",    color: "text-emerald-400", bg: "border-emerald-500/30" },
};

export default function PrepLab() {
  const builder   = useSTARBuilder();
  const documents = useDocuments();

  const [activeTab,       setActiveTab]       = useState<"builder" | "bank">("builder");
  const [saveDialogOpen,  setSaveDialogOpen]  = useState(false);
  const [saveTitle,       setSaveTitle]       = useState("");
  const [saveCategory,    setSaveCategory]    = useState<AnswerCategory>("other");
  const [saveTags,        setSaveTags]        = useState("");
  const [copied,          setCopied]          = useState(false);
  const [saveError,       setSaveError]       = useState<string | null>(null);

  // ── Copy formatted answer ──────────────────────────────────────

  async function handleCopy() {
    if (!builder.formattedAnswer) return;
    await navigator.clipboard.writeText(builder.formattedAnswer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Save answer to bank ────────────────────────────────────────

  async function handleSave() {
    setSaveError(null);
    const result = await builder.saveToBank({
      title:    saveTitle.trim() || builder.question.slice(0, 60),
      category: saveCategory,
      tags:     saveTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (result.error) {
      setSaveError(result.error);
    } else {
      setSaveDialogOpen(false);
      setSaveTitle("");
      setSaveTags("");
      setSaveCategory("other");
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* ── Header ─────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Prep Lab</h1>
          <p className="text-gray-400 mt-1 text-sm">
            Build STAR answers and manage your personal answer bank
          </p>
        </div>

        {/* ── Tab switcher ───────────────────────────── */}
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 mb-6 w-fit">
          {(["builder", "bank"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-5 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-violet-600 text-white shadow"
                  : "text-gray-400 hover:text-white"
              )}
            >
              {tab === "builder" ? "🧩 STAR Builder" : "📚 Answer Bank"}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════
            STAR BUILDER TAB
        ══════════════════════════════════════════════ */}
        {activeTab === "builder" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Left: Input ──────────────────────────── */}
            <div className="space-y-4">

              {/* Question input */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <label className="block text-sm font-semibold text-gray-200 mb-2">
                  Interview Question
                </label>
                <textarea
                  value={builder.question}
                  onChange={(e) => builder.setQuestion(e.target.value)}
                  placeholder="e.g. Tell me about a time you led a difficult project under pressure…"
                  rows={3}
                  className="w-full bg-black/30 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-violet-500 text-sm leading-relaxed"
                />

                <div className="flex gap-2 mt-3">
                  {/* AI generate */}
                  <button
                    onClick={() => builder.generateFromQuestion(builder.question)}
                    disabled={!builder.question.trim() || builder.isGenerating}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-sm font-medium rounded-xl disabled:opacity-40 transition-all"
                  >
                    {builder.isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    AI Generate Framework
                  </button>

                  {/* Reset */}
                  <button
                    onClick={builder.reset}
                    className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white rounded-xl transition-all"
                    title="Clear all"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* STAR component fields */}
              {(["situation", "task", "action", "result"] as const).map((key) => (
                <STARField
                  key={key}
                  fieldKey={key}
                  value={builder.components[key] ?? ""}
                  onChange={(v) => builder.updateComponent(key, v)}
                  score={
                    builder.analysis
                      ? (builder.analysis as any)[`${key}_score`]
                      : undefined
                  }
                />
              ))}

              {/* Analyse + Polish row */}
              {(builder.components.action ?? "").trim().length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={builder.analyseAnswer}
                    disabled={builder.isAnalysing}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-sm font-medium rounded-xl disabled:opacity-40 transition-all"
                  >
                    {builder.isAnalysing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <BarChart2 className="w-4 h-4" />
                    )}
                    Analyse Answer
                  </button>
                  <button
                    onClick={builder.polishAnswer}
                    disabled={builder.isGenerating}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-sm font-medium rounded-xl disabled:opacity-40 transition-all"
                  >
                    <Sparkles className="w-4 h-4" />
                    AI Polish
                  </button>
                </div>
              )}

              {/* Error */}
              {builder.error && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {builder.error}
                </div>
              )}
            </div>

            {/* ── Right: Output ────────────────────────── */}
            <div className="space-y-4">

              {/* Analysis panel */}
              {builder.analysis && (
                <STARAnalysisPanel analysis={builder.analysis} />
              )}

              {/* Formatted answer preview */}
              {builder.formattedAnswer && (
                <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-white">
                      Full Answer Preview
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-400 hover:text-white text-xs rounded-lg transition-all"
                      >
                        {copied ? (
                          <><Check className="w-3 h-3 text-green-400" /> Copied</>
                        ) : (
                          <><Copy className="w-3 h-3" /> Copy</>
                        )}
                      </button>
                      <button
                        onClick={() => setSaveDialogOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-violet-300 text-xs rounded-lg transition-all"
                      >
                        <Save className="w-3 h-3" />
                        Save to Bank
                      </button>
                    </div>
                  </div>

                  <div className="px-5 py-4 space-y-4 max-h-96 overflow-y-auto">
                    {(["situation", "task", "action", "result"] as const).map((key) => {
                      const content = builder.components[key];
                      if (!content) return null;
                      const meta = STAR_COLORS[key];
                      return (
                        <div key={key}>
                          <p className={cn("text-xs font-bold uppercase tracking-wider mb-1", meta.color)}>
                            {meta.label}
                          </p>
                          <p className="text-sm text-gray-300 leading-relaxed">{content}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!builder.formattedAnswer && !builder.isGenerating && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-10 flex flex-col items-center justify-center text-center">
                  <Star className="w-10 h-10 text-gray-600 mb-3" />
                  <p className="text-gray-400 text-sm">
                    Enter a question and click <strong className="text-white">AI Generate</strong>,
                    or fill in the STAR fields manually.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            ANSWER BANK TAB
        ══════════════════════════════════════════════ */}
        {activeTab === "bank" && (
          <div className="space-y-5">

            {/* Search + filter */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  value={documents.searchQuery}
                  onChange={(e) => documents.setSearch(e.target.value)}
                  placeholder="Search answers…"
                  className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-violet-500 text-sm"
                />
              </div>

              {/* Category filter pills */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => documents.setFilter("all" as AnswerCategory)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                    documents.activeFilter === ("all" as any)
                      ? "bg-violet-600 text-white"
                      : "bg-white/5 text-gray-400 hover:text-white border border-white/10"
                  )}
                >
                  All
                </button>
                {ANSWER_CATEGORIES.slice(0, 5).map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => documents.setFilter(cat.value)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
                      documents.activeFilter === cat.value
                        ? "bg-violet-600 text-white"
                        : "bg-white/5 text-gray-400 hover:text-white border border-white/10"
                    )}
                  >
                    {cat.icon} {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Answer cards grid */}
            {documents.answers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <BookOpen className="w-12 h-12 text-gray-600 mb-3" />
                <p className="text-gray-400 text-sm">
                  No saved answers yet. Build one in the STAR Builder and save it here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {documents.answers.map((answer) => (
                  <AnswerBankCard
                    key={answer.id}
                    answer={answer}
                    onFavourite={() => documents.toggleFavourite(answer.id)}
                    onDelete={() => documents.deleteAnswer(answer.id)}
                    onUse={() => {
                      builder.setQuestion(answer.question);
                      setActiveTab("builder");
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════
            SAVE DIALOG (modal)
        ══════════════════════════════════════════════ */}
        {saveDialogOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#12121a] border border-white/15 rounded-2xl p-6 space-y-4 shadow-2xl">
              <h3 className="text-lg font-semibold text-white">Save to Answer Bank</h3>

              {/* Title */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Title</label>
                <input
                  value={saveTitle}
                  onChange={(e) => setSaveTitle(e.target.value)}
                  placeholder={builder.question.slice(0, 50) || "Answer title…"}
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Category</label>
                <div className="grid grid-cols-2 gap-2">
                  {ANSWER_CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => setSaveCategory(cat.value)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
                        saveCategory === cat.value
                          ? "bg-violet-600/30 border-violet-500/50 text-violet-200"
                          : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                      )}
                    >
                      <span>{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">
                  Tags <span className="text-gray-500">(comma-separated)</span>
                </label>
                <input
                  value={saveTags}
                  onChange={(e) => setSaveTags(e.target.value)}
                  placeholder="e.g. google, senior, pressure"
                  className="w-full bg-white/5 border border-white/10 text-white placeholder-gray-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-violet-500 text-sm"
                />
              </div>

              {/* Error */}
              {saveError && (
                <p className="text-sm text-red-400">{saveError}</p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setSaveDialogOpen(false);
                    setSaveError(null);
                  }}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={builder.isSaving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-all"
                >
                  {builder.isSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STARField — single STAR component textarea
// ─────────────────────────────────────────────────────────────────

function STARField({
  fieldKey,
  value,
  onChange,
  score,
}: {
  fieldKey: "situation" | "task" | "action" | "result";
  value:    string;
  onChange: (v: string) => void;
  score?:   number;
}) {
  const meta = STAR_COLORS[fieldKey];
  return (
    <div className={cn("bg-white/5 rounded-2xl border p-4 space-y-2", meta.bg)}>
      <div className="flex items-center justify-between">
        <label className={cn("text-xs font-bold uppercase tracking-wider", meta.color)}>
          {meta.label}
        </label>
        {score !== undefined && (
          <ScoreBadge score={score} />
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={STAR_PLACEHOLDERS[fieldKey]}
        rows={fieldKey === "action" ? 4 : 3}
        className="w-full bg-black/20 border border-white/5 text-white placeholder-gray-600 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:border-white/20 text-sm leading-relaxed"
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// STARAnalysisPanel
// ─────────────────────────────────────────────────────────────────

function STARAnalysisPanel({ analysis }: { analysis: any }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-blue-400" />
          Answer Analysis
        </h3>
        <ScoreBadge score={analysis.overall_score} size="lg" />
      </div>

      {/* Per-component scores */}
      <div className="grid grid-cols-2 gap-2">
        {(["situation", "task", "action", "result"] as const).map((key) => {
          const s = analysis[`${key}_score`] ?? 0;
          const meta = STAR_COLORS[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className={cn("text-xs font-medium w-16", meta.color)}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    s >= 70 ? "bg-green-400" : s >= 50 ? "bg-yellow-400" : "bg-red-400"
                  )}
                  style={{ width: `${s}%` }}
                />
              </div>
              <span className="text-xs text-gray-400 w-6 text-right">{s}</span>
            </div>
          );
        })}
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-2">
        <span className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium border",
          analysis.has_quantified_result
            ? "bg-green-500/10 border-green-500/20 text-green-400"
            : "bg-orange-500/10 border-orange-500/20 text-orange-400"
        )}>
          {analysis.has_quantified_result ? "✓" : "✗"} Quantified result
        </span>
        <span className={cn(
          "px-2.5 py-1 rounded-full text-xs font-medium border",
          analysis.action_specificity === "specific"
            ? "bg-green-500/10 border-green-500/20 text-green-400"
            : analysis.action_specificity === "moderate"
            ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
            : "bg-orange-500/10 border-orange-500/20 text-orange-400"
        )}>
          Action: {analysis.action_specificity}
        </span>
      </div>

      {/* Suggestions */}
      {analysis.suggestions?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-1.5">Suggestions</p>
          <ul className="space-y-1">
            {analysis.suggestions.map((s: string, i: number) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <span className="text-violet-400 mt-0.5 shrink-0">→</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improved result */}
      {analysis.improved_result && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
          <p className="text-xs font-medium text-emerald-400 mb-1">
            Suggested stronger result:
          </p>
          <p className="text-xs text-emerald-200 italic">
            &ldquo;{analysis.improved_result}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// AnswerBankCard
// ─────────────────────────────────────────────────────────────────

function AnswerBankCard({
  answer,
  onFavourite,
  onDelete,
  onUse,
}: {
  answer:      any;
  onFavourite: () => void;
  onDelete:    () => void;
  onUse:       () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cat = ANSWER_CATEGORIES.find((c) => c.value === answer.category);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden flex flex-col hover:border-white/20 transition-all">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex-1">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{cat?.icon ?? "📝"}</span>
            <span className="text-xs text-gray-400 capitalize">{cat?.label ?? answer.category}</span>
          </div>
          <button
            onClick={onFavourite}
            className={cn(
              "shrink-0 transition-colors",
              answer.is_favourite ? "text-red-400" : "text-gray-600 hover:text-gray-400"
            )}
          >
            <Heart className={cn("w-4 h-4", answer.is_favourite && "fill-current")} />
          </button>
        </div>

        <p className="text-sm font-medium text-white leading-snug">{answer.title}</p>
        <p className="text-xs text-gray-400 mt-1 line-clamp-2">{answer.question}</p>

        {/* Tags */}
        {answer.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {answer.tags.slice(0, 3).map((tag: string) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 bg-white/5 border border-white/10 text-gray-400 rounded text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Expanded answer preview */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
            {(["situation", "task", "action", "result"] as const).map((key) => {
              const part = answer.answer_text
                ?.split("\n\n")
                .find((p: string) => p.toLowerCase().startsWith(key));
              if (!part) return null;
              const meta = STAR_COLORS[key];
              return (
                <div key={key}>
                  <p className={cn("text-xs font-bold uppercase tracking-wider mb-0.5", meta.color)}>
                    {key}
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed">{part.replace(/^.+:\s*/, "")}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pb-4 flex items-center justify-between gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {expanded ? "Show less" : "Preview"}
        </button>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onUse}
            className="flex items-center gap-1 px-3 py-1.5 bg-violet-600/20 hover:bg-violet-600/40 border border-violet-500/30 text-violet-300 text-xs rounded-lg transition-all"
          >
            <Star className="w-3 h-3" />
            Use
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// ScoreBadge
// ─────────────────────────────────────────────────────────────────

function ScoreBadge({ score, size = "sm" }: { score: number; size?: "sm" | "lg" }) {
  const color =
    score >= 70 ? "text-green-400 bg-green-500/10 border-green-500/20" :
    score >= 50 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" :
                  "text-red-400 bg-red-500/10 border-red-500/20";
  return (
    <span className={cn(
      "font-bold border rounded-lg px-2 py-0.5",
      color,
      size === "lg" ? "text-base" : "text-xs"
    )}>
      {score}
    </span>
  );
}
