import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { prepToolContentIdempotencyKey } from "@/lib/network/idempotency";
import { sha256 } from "@/lib/utils/hashUtils";
import {
  getAiUserFacingError,
  isInsufficientCreditsError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";
import {
  AI_RESPONSE_INVALID_MESSAGE,
  isRephraseAlternatives,
  parseStructuredJson,
  type RephraseAlternatives,
} from "@/lib/ai/structuredParse";
import { refreshCreditsFromStore } from "@/lib/billing/creditPrecheck";
import { useEffect, useRef, useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PrepToolShell, SaveToAnswerBankConfirm } from "@/components/prep/PrepToolShell";
import {
  Copy, Save, CheckCircle, Sparkles,
  ArrowRight, Wand2,
  ClipboardList, Zap, Scissors,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { answerBankDB } from "@/lib/supabase/database";
import { buildRephraserAnswerBankPayload } from "@/lib/answer-bank/answerBankDisplay";
import {
  readPersistedRephraserState,
  writePersistedRephraserState,
} from "@/lib/prep/rephraserPersistence";
import { withPrepToolContext } from "@/lib/prep/prepToolContext";
import {
  listPrepRephraseHistory,
  upsertPrepRephraseHistory,
  type PrepRephraseHistoryRow,
} from "@/lib/prep/rephraserHistory";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Alternatives {
  formal:    string;
  confident: string;
  concise:   string;
}

const OFFLINE_FALLBACK_LABEL = "Offline fallback — not AI-generated";

// ─────────────────────────────────────────────────────────────────────────────
// Rephraser — generates 3 style alternatives in one click
// ─────────────────────────────────────────────────────────────────────────────

export default function Rephraser() {
  const credits = useCredits();
  const { user } = useAuthStore();
  const inflightKeyRef = useRef<string | null>(null);
  const hydratedUserRef = useRef<string | null>(null);
  const skipNextPersistRef = useRef(true);

  const [original,     setOriginal]     = useState("");
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [saved,        setSaved]        = useState<keyof Alternatives | null>(null);
  const [savedAnswerId, setSavedAnswerId] = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [offlineFallback, setOfflineFallback] = useState(false);
  const [history, setHistory] = useState<PrepRephraseHistoryRow[]>([]);

  const wordCount = original.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    const userId = user?.id ?? null;
    if (hydratedUserRef.current === userId) return;
    hydratedUserRef.current = userId;
    const stored = readPersistedRephraserState(user?.id);
    inflightKeyRef.current = stored?.idempotencyKey ?? null;
    setOriginal(stored?.original ?? "");
    setAlternatives(stored?.alternatives ?? null);
    setError(stored?.error ?? null);
    setOfflineFallback(stored?.offlineFallback ?? false);
    // Skip the write effect that runs with empty pre-hydrate state (wipes history).
    skipNextPersistRef.current = true;
    if (userId) {
      void listPrepRephraseHistory(userId)
        .then((rows) => {
          setHistory(rows);
          // Prefer durable DB row when local cache is empty after refresh.
          if (!stored?.alternatives && rows[0]) {
            setOriginal(rows[0].original_text);
            setAlternatives(rows[0].alternatives);
          }
        })
        .catch(() => {
          /* history is enhancement; generation still works */
        });
    } else {
      setHistory([]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!hydratedUserRef.current || hydratedUserRef.current !== (user?.id ?? null)) {
      return;
    }
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    writePersistedRephraserState(user?.id, {
      original,
      alternatives,
      error,
      offlineFallback,
      idempotencyKey: inflightKeyRef.current,
    });
  }, [user?.id, original, alternatives, error, offlineFallback]);

  // ── Generate 3 alternatives ──────────────────────────────────────────────

  async function handleRephrase() {
    if (!original.trim() || !credits.canAfford("rephrase") || loading) return;
    setLoading(true);
    setError(null);
    setAlternatives(null);
    setSaved(null);
    setSavedAnswerId(null);
    setOfflineFallback(false);

    const contentHash = await sha256(original.trim());
    const idempotencyKey = prepToolContentIdempotencyKey("rephrase", contentHash);
    inflightKeyRef.current = idempotencyKey;

    try {
      const data = await fetchEdgeJson<{
        result?: string;
        alternatives?: Alternatives;
      }>("prep-tool", withPrepToolContext({
        tool_id: "rephrase",
        input: original,
      }), {
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
      });
      const fromServer = data.alternatives && isRephraseAlternatives(data.alternatives)
        ? data.alternatives
        : parseStructuredJson(data.result ?? "", isRephraseAlternatives).value;
      if (!fromServer) {
        throw Object.assign(new Error(AI_RESPONSE_INVALID_MESSAGE), { code: "AI_RESPONSE_INVALID" });
      }
      setAlternatives(fromServer);
      await refreshCreditsFromStore();
      if (user?.id) {
        try {
          await upsertPrepRephraseHistory({
            userId: user.id,
            inputHash: contentHash,
            originalText: original.trim(),
            alternatives: fromServer,
            status: "completed",
            creditOpId: idempotencyKey,
          });
          const rows = await listPrepRephraseHistory(user.id);
          setHistory(rows);
        } catch {
          /* durable history is best-effort; local cache still written */
        }
      }
    } catch (err) {
      openUpgradeIfInsufficientCredits(err);
      if (isInsufficientCreditsError(err)) {
        const message = getAiUserFacingError(err);
        setError(message);
        toast.error(message);
        // Keep the content-derived key so Retry of the same text does not double-charge.
      } else {
        setError(getAiUserFacingError(err));
        setAlternatives(getOfflineAlternatives(original));
        setOfflineFallback(true);
        toast.info(OFFLINE_FALLBACK_LABEL);
        // Keep key so Retry / double-submit / refresh mid-request replays without a second charge.
      }
    }
    setLoading(false);
  }

  // ── Save a specific alternative to Answer Bank ───────────────────────────

  async function saveToBank(style: keyof Alternatives) {
    if (!user || !alternatives) return;
    const text = alternatives[style];
    const styleLabels: Record<keyof Alternatives, string> = {
      formal:    "Formal",
      confident: "Confident",
      concise:   "Concise",
    };
    try {
      const contentHash = await sha256(original.trim());
      await upsertPrepRephraseHistory({
        userId: user.id,
        inputHash: contentHash,
        originalText: original.trim(),
        alternatives,
        status: "completed",
        creditOpId: inflightKeyRef.current,
      });
      const inserted = await answerBankDB.create(
        user.id,
        buildRephraserAnswerBankPayload(original.trim(), style, text),
      );
      setSavedAnswerId(inserted.id);
      setSaved(style);
      toast.success(`${styleLabels[style]} version saved to Answer Bank`);
      setTimeout(() => setSaved(null), 2500);
    } catch {
      toast.error("Failed to save — please try again");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Answer Rephraser"
        description="Paste an interview answer and get three AI-improved alternatives — formal, confident, and concise"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Prep Lab", href: "/app/prep" },
          { label: "Rephraser" },
        ]}
      />

      <PrepToolShell
        title="Rephrase your answer"
        description="One click returns formal, confident, and concise versions."
        isGenerating={loading}
        generationLabel="Generating alternatives…"
        generationStage="rephraser"
        error={error}
        onRetry={() => void handleRephrase()}
      >
        {savedAnswerId && (
          <SaveToAnswerBankConfirm
            answerId={savedAnswerId}
            onDismiss={() => setSavedAnswerId(null)}
          />
        )}

        {/* Input */}
        <Card>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest">Original answer</p>
            <span className="text-[10px] text-muted-foreground">{wordCount} words</span>
          </div>
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            placeholder={`Paste your interview answer here…\n\nExample: 'In my previous role, I was basically responsible for kind of leading the migration to microservices. We sort of had some issues with the monolith and I think I helped make things better.'`}
            rows={8}
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
          />
        </Card>

        {/* Generate button */}
        <Button
          variant="primary"
          size="md"
          onClick={() => void handleRephrase()}
          disabled={!original.trim() || wordCount < 5 || loading || !credits.canAfford("rephrase")}
          loading={loading}
          leftIcon={<Sparkles className="w-4 h-4" />}
          fullWidth
        >
          Generate 3 alternatives ({credits.costs.rephrase} credits)
        </Button>

        {/* 3 result cards */}
        {alternatives && (
          <div className="space-y-3">
            {offlineFallback && (
              <p className="text-xs text-amber-700 dark:text-amber-300" role="status">
                {OFFLINE_FALLBACK_LABEL}
              </p>
            )}
            {(["formal", "confident", "concise"] as const).map((style) => {
              const styleConfig = {
                formal:    { label: "Formal",    Icon: ClipboardList, color: "blue"   },
                confident: { label: "Confident", Icon: Zap,           color: "primary" },
                concise:   { label: "Concise",   Icon: Scissors,      color: "emerald" },
              }[style];

              const borderClass = {
                blue:    "border-blue-500/20 bg-blue-500/5",
                primary: "border-primary/20 bg-primary/5",
                emerald: "border-emerald-500/20 bg-emerald-500/5",
              }[styleConfig.color];

              const headerClass = {
                blue:    "text-blue-400",
                primary: "text-primary",
                emerald: "text-emerald-400",
              }[styleConfig.color];

              const wordCt = alternatives[style].trim().split(/\s+/).filter(Boolean).length;

              return (
                <Card key={style} className={borderClass}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={cn("text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5", headerClass)}>
                      <styleConfig.Icon className="w-3.5 h-3.5" aria-hidden />
                      {styleConfig.label}
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-muted-foreground">{wordCt} words</span>
                      <button
                        onClick={() => { navigator.clipboard.writeText(alternatives[style]); toast.success("Copied!"); }}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => saveToBank(style)}
                        className={cn(
                          "flex items-center gap-1 text-xs transition-colors",
                          saved === style ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {saved === style
                          ? <CheckCircle className="w-3.5 h-3.5" />
                          : <Save className="w-3.5 h-3.5" />
                        }
                        {saved === style ? "Saved!" : "Save"}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {alternatives[style]}
                  </p>
                </Card>
              );
            })}

            {/* Word count comparison */}
            <Card>
              <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">Changes summary</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-foreground">{wordCount}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Original words</p>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-emerald-400">
                    {Math.round((
                      alternatives.formal.trim().split(/\s+/).filter(Boolean).length +
                      alternatives.confident.trim().split(/\s+/).filter(Boolean).length +
                      alternatives.concise.trim().split(/\s+/).filter(Boolean).length
                    ) / 3)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Avg improved words</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {!alternatives && !loading && (
          <Card className="text-center py-12">
            <Wand2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Your three improved versions will appear here</p>
            <p className="text-xs text-muted-foreground mt-1">Formal · Confident · Concise</p>
          </Card>
        )}

        {history.length > 0 && (
          <Card className="mt-4" data-testid="rephraser-history">
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">
              Recent rephrases
            </p>
            <ul className="space-y-2">
              {history.slice(0, 8).map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="w-full text-left rounded-lg border border-border px-3 py-2 hover:bg-secondary/50 transition-colors"
                    onClick={() => {
                      setOriginal(row.original_text);
                      setAlternatives(row.alternatives);
                      setOfflineFallback(row.status === "offline_fallback");
                      setError(null);
                    }}
                  >
                    <p className="text-sm text-foreground line-clamp-2">{row.original_text}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString()
                        : "Saved"}
                      {row.status !== "completed" ? ` · ${row.status}` : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </PrepToolShell>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline fallback — returns 3 alternatives as object
// ─────────────────────────────────────────────────────────────────────────────

function getOfflineAlternatives(original: string): Alternatives {
  const preview = original.substring(0, 120) + (original.length > 120 ? "…" : "");
  return {
    formal:    `[Offline — Formal]\n\nPlease note that the AI service is temporarily unavailable. Your original answer has been preserved below for reference:\n\n"${preview}"`,
    confident: `[Offline — Confident]\n\nThe AI rephrasing service is currently offline. When it returns, this version will remove hedging language and use stronger action verbs.\n\n"${preview}"`,
    concise:   `[Offline — Concise]\n\nThe AI service is offline. When available, this version will trim filler words and reduce word count by 20–30%.\n\n"${preview}"`,
  };
}
