import { useCallback, useEffect, useState, type ElementType } from "react";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AI_HUB_MODELS,
  microUsdToDisplay,
  type AIHubProvider,
} from "@/lib/ai/aiHubRegistry";
import { decideRoute } from "@/lib/ai/aiHubAnalyzer";
import {
  Bot,
  Gauge,
  History,
  KeyRound,
  Loader2,
  Play,
  Route,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

type HubTab =
  | "overview"
  | "lab"
  | "routing"
  | "free-tier"
  | "budgets"
  | "history"
  | "acceleration"
  | "providers";

type LabMode = "quick" | "normal" | "deep" | "benchmark";

interface HubStatus {
  providers: Record<string, { configured: boolean }>;
  providerMode: string;
  models: typeof AI_HUB_MODELS;
  budgets: Record<string, number>;
  cache: { enabled?: boolean; ttl_seconds?: number };
  freeTier: {
    enabled: boolean;
    dailyTokens: number;
    usedToday: number;
    remainingToday: number;
  };
  acceleration: {
    priorityTier: string;
    maxOutputTokensCeiling: number;
    concurrentRequestCeiling: number;
  };
  spentTodayMicroUsd: number;
  dailyBudgetMicroUsd: number;
}

interface TestResult {
  id?: string;
  provider: string;
  model: string;
  response_text?: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  latency_ms?: number;
  estimated_cost_micro_usd?: number;
  actual_cost_micro_usd?: number;
  cached?: boolean;
  free_tier_used?: boolean;
  routing_reason?: string | null;
  success?: boolean;
  error_message?: string | null;
}

const TABS: Array<{ id: HubTab; label: string; icon: ElementType }> = [
  { id: "overview", label: "Overview", icon: Gauge },
  { id: "lab", label: "Lab", icon: Bot },
  { id: "routing", label: "Routing", icon: Route },
  { id: "free-tier", label: "Free Tier", icon: Sparkles },
  { id: "budgets", label: "Budgets", icon: Wallet },
  { id: "history", label: "History", icon: History },
  { id: "acceleration", label: "Acceleration", icon: Zap },
  { id: "providers", label: "Providers", icon: KeyRound },
];

export default function AdminAiHub() {
  const [tab, setTab] = useState<HubTab>("overview");
  const [status, setStatus] = useState<HubStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [prompt, setPrompt] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [mode, setMode] = useState<LabMode>("normal");
  const [selected, setSelected] = useState<Record<string, boolean>>({
    "gemini-2.5-flash": true,
  });
  const [estimate, setEstimate] = useState<Record<string, unknown> | null>(null);
  const [results, setResults] = useState<TestResult[]>([]);
  const [routingReason, setRoutingReason] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<unknown[]>([]);
  const [probeBusy, setProbeBusy] = useState<string | null>(null);
  const [benchmarkConfirmOpen, setBenchmarkConfirmOpen] = useState(false);
  const [pendingRunAction, setPendingRunAction] = useState<"run" | "route" | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchEdgeJson<HubStatus>("ai-hub-router", {
        action: "status",
      });
      setStatus(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load AI Hub status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (tab !== "history") return;
    void fetchEdgeJson<{ runs: unknown[] }>("ai-hub-router", {
      action: "history",
      limit: 40,
    })
      .then((d) => setHistory(d.runs ?? []))
      .catch(() => setHistory([]));
  }, [tab]);

  function toggleModel(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function selectedModels() {
    return AI_HUB_MODELS.filter((m) => selected[m.id]).map((m) => ({
      provider: m.provider,
      model: m.id,
    }));
  }

  async function handleEstimate() {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    setRunning(true);
    try {
      const data = await fetchEdgeJson<Record<string, unknown>>("ai-hub-router", {
        action: "estimate",
        prompt,
        systemPrompt: systemPrompt || undefined,
        mode,
        models: selectedModels(),
      });
      setEstimate(data);
      toast.success("Estimate ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Estimate failed");
    } finally {
      setRunning(false);
    }
  }

  async function executeRun(action: "run" | "route") {
    setRunning(true);
    setResults([]);
    setRoutingReason(null);
    try {
      const data = await fetchEdgeJson<{
        results: TestResult[];
        routingReason?: string;
        testId: string;
      }>("ai-hub-router", {
        action,
        prompt,
        systemPrompt: systemPrompt || undefined,
        mode,
        models: action === "run" ? selectedModels() : undefined,
      });
      setResults(data.results ?? []);
      setRoutingReason(data.routingReason ?? null);
      toast.success(action === "route" ? "Routed run complete" : "Lab run complete");
      void loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleRun(action: "run" | "route") {
    if (!prompt.trim()) {
      toast.error("Enter a prompt first");
      return;
    }
    if (action === "run" && !selectedModels().length) {
      toast.error("Select at least one model");
      return;
    }
    if (mode === "benchmark") {
      setPendingRunAction(action);
      setBenchmarkConfirmOpen(true);
      return;
    }
    await executeRun(action);
  }

  async function testConnection(provider: AIHubProvider) {
    setProbeBusy(provider);
    try {
      const data = await fetchEdgeJson<{
        ok: boolean;
        latencyMs: number;
        error?: string;
      }>("ai-hub-router", { action: "test-connection", provider });
      if (data.ok) toast.success(`${provider}: OK (${data.latencyMs}ms)`);
      else toast.error(`${provider}: ${data.error ?? "failed"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setProbeBusy(null);
    }
  }

  async function saveAcceleration(tier: string, ceiling: number) {
    try {
      await fetchEdgeJson("ai-hub-router", {
        action: "update-settings",
        patch: {
          acceleration: {
            priority_tier: tier,
            max_output_tokens_ceiling: ceiling,
            concurrent_request_ceiling:
              status?.acceleration.concurrentRequestCeiling ?? 5,
          },
        },
      });
      toast.success("Acceleration settings saved");
      void loadStatus();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  }

  const previewRoute = prompt.trim()
    ? decideRoute({ prompt, systemPrompt: systemPrompt || undefined })
    : null;

  if (loading && !status) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="p-4">
        <InlineErrorRetry message={loadError} onRetry={() => void loadStatus()} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-6xl mx-auto">
      <PageHeader
        title="AI Hub"
        description="Multi-provider lab, smart routing, free-tier metering, and ops cost controls. Keys stay on the edge — never in the browser."
        breadcrumbs={[
          { label: "Admin", href: "/app/admin" },
          { label: "AI Hub" },
        ]}
      />

      {status && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Provider mode"
            value={status.providerMode}
          />
          <StatCard
            label="Free tokens left"
            value={status.freeTier.remainingToday.toLocaleString()}
          />
          <StatCard
            label="Spent today (ops)"
            value={microUsdToDisplay(status.spentTodayMicroUsd)}
          />
          <StatCard
            label="Daily ops budget"
            value={microUsdToDisplay(status.dailyBudgetMicroUsd)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && status && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">Platform AI health</h3>
          <p className="text-sm text-muted-foreground">
            Acceleration: <Badge variant="blue" size="sm">{status.acceleration.priorityTier}</Badge>
            {" · "}Token ceiling: {status.acceleration.maxOutputTokensCeiling}
          </p>
          <p className="text-sm text-muted-foreground">
            Free tier {status.freeTier.enabled ? "enabled" : "disabled"} — used{" "}
            {status.freeTier.usedToday.toLocaleString()} /{" "}
            {status.freeTier.dailyTokens.toLocaleString()} tokens today (UTC).
          </p>
          <p className="text-xs text-muted-foreground">
            Policy: free-tier Hub calls do not debit the credits ledger. Paid Hub Lab spend
            uses the ops budget only (not user credits). Product AI flows are unchanged.
          </p>
        </Card>
      )}

      {tab === "lab" && (
        <div className="space-y-4">
          <Card className="p-5 space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">System prompt (optional)</label>
              <Input
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System instructions…"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Prompt</label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                placeholder="Enter your test prompt…"
                className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div>
              <p className="text-xs font-medium mb-2">Models (explicit selection)</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {AI_HUB_MODELS.filter((m) => m.enabled).map((m) => (
                  <label
                    key={m.id}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm cursor-pointer hover:bg-secondary/40"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(selected[m.id])}
                      onChange={() => toggleModel(m.id)}
                    />
                    <span className="font-medium">{m.displayName}</span>
                    <Badge size="sm" variant="gray">{m.provider}</Badge>
                    {m.freeTierEligible && (
                      <Badge size="sm" variant="emerald">free-tier</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as LabMode)}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="quick">Quick (≤500 tok, 1 model)</option>
                <option value="normal">Normal (≤2k, ≤3 models)</option>
                <option value="deep">Deep (≤5k)</option>
                <option value="benchmark">Benchmark (confirm)</option>
              </select>
              <Button
                variant="secondary"
                size="sm"
                disabled={running}
                onClick={() => void handleEstimate()}
              >
                Estimate cost
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={running}
                leftIcon={running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                onClick={() => void handleRun("run")}
              >
                Run Lab
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={running}
                onClick={() => void handleRun("route")}
              >
                Smart Route once
              </Button>
            </div>

            {estimate && (
              <p className="text-xs text-muted-foreground">
                Estimated max total:{" "}
                <strong>{String(estimate.totalEstimatedMaxCostDisplay)}</strong>
                {" "}(Estimated — not Actual)
              </p>
            )}
          </Card>

          {routingReason && (
            <p className="text-xs text-muted-foreground">Routing: {routingReason}</p>
          )}

          {results.length > 0 ? (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {results.map((r, i) => (
                <Card key={r.id ?? i} className="p-4 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{r.model}</span>
                    <Badge size="sm">{r.provider}</Badge>
                    {r.cached && <Badge size="sm" variant="amber">Cached</Badge>}
                    {r.free_tier_used && <Badge size="sm" variant="emerald">Free tier</Badge>}
                    {r.success === false && <Badge size="sm" variant="red">Failed</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-8">
                    {r.error_message || r.response_text || "—"}
                  </p>
                  <div className="text-[11px] text-muted-foreground space-y-0.5">
                    <div>Tokens: {r.input_tokens ?? 0} in / {r.output_tokens ?? 0} out</div>
                    <div>Latency: {((r.latency_ms ?? 0) / 1000).toFixed(2)}s</div>
                    <div>
                      Actual cost: {microUsdToDisplay(r.actual_cost_micro_usd ?? 0)}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Bot}
              title="No results yet"
              description="Select models, estimate, then Run Lab — or Smart Route once."
              compact
            />
          )}
        </div>
      )}

      {tab === "routing" && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">Smart routing preview</h3>
          <p className="text-xs text-muted-foreground">
            Local deterministic classifier (no extra model call). Lab mode always bypasses routing.
          </p>
          {previewRoute ? (
            <div className="text-sm space-y-1">
              <p>Task: <strong>{previewRoute.taskType}</strong> ({previewRoute.confidenceTier})</p>
              <p>Model: <strong>{previewRoute.model}</strong> ({previewRoute.provider})</p>
              <p className="text-muted-foreground">{previewRoute.reason}</p>
              <p className="text-xs">Fallback: {previewRoute.fallbackChain.join(" → ")}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Enter a prompt in Lab to preview routing.</p>
          )}
        </Card>
      )}

      {tab === "free-tier" && status && (
        <Card className="p-5 space-y-2">
          <h3 className="text-sm font-semibold">Free daily token allowance</h3>
          <p className="text-sm">
            Used today: {status.freeTier.usedToday.toLocaleString()} /{" "}
            {status.freeTier.dailyTokens.toLocaleString()} (UTC day bucket)
          </p>
          <p className="text-xs text-muted-foreground">
            Eligible models are marked free-tier in Lab. Exhaustion falls through to the ops budget —
            never silent overage, never double-debit of credits.
          </p>
        </Card>
      )}

      {tab === "budgets" && status && (
        <Card className="p-5 space-y-2 text-sm">
          <h3 className="font-semibold">Ops budgets (INR display)</h3>
          <ul className="space-y-1 text-muted-foreground">
            <li>Daily: {microUsdToDisplay(Number(status.budgets.daily_budget_micro_usd ?? 0))}</li>
            <li>Monthly: {microUsdToDisplay(Number(status.budgets.monthly_budget_micro_usd ?? 0))}</li>
            <li>Max / request: {microUsdToDisplay(Number(status.budgets.max_request_cost_micro_usd ?? 0))}</li>
            <li>Rate: {status.budgets.rate_limit_per_minute}/min · {status.budgets.rate_limit_per_hour}/hr</li>
            <li>Cache: {status.cache.enabled ? `on (${status.cache.ttl_seconds}s)` : "off"}</li>
          </ul>
        </Card>
      )}

      {tab === "history" && (
        <Card className="p-5">
          {history.length === 0 ? (
            <EmptyState icon={History} title="No Hub runs yet" compact />
          ) : (
            <div className="space-y-2">
              {(history as Array<Record<string, unknown>>).map((run) => (
                <div
                  key={String(run.id)}
                  className="rounded-xl border border-border px-3 py-2 text-xs flex flex-wrap gap-2 justify-between"
                >
                  <span className="font-mono">{String(run.id).slice(0, 8)}</span>
                  <span>{String(run.mode)}</span>
                  <span>{String(run.status)}</span>
                  <span>{microUsdToDisplay(Number(run.actual_cost_micro_usd ?? 0))}</span>
                  <span className="text-muted-foreground">
                    {run.created_at ? new Date(String(run.created_at)).toLocaleString() : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "acceleration" && status && (
        <Card className="p-5 space-y-3">
          <h3 className="text-sm font-semibold">Admin AI Acceleration</h3>
          <p className="text-xs text-muted-foreground">
            Capacity/QoS only — never grants spend beyond budgets. Gated to admins (no separate
            super-admin role in DB; capability = admin).
          </p>
          <div className="flex flex-wrap gap-2">
            {(["throttled", "standard", "accelerated"] as const).map((tier) => (
              <Button
                key={tier}
                size="sm"
                variant={status.acceleration.priorityTier === tier ? "primary" : "secondary"}
                onClick={() =>
                  void saveAcceleration(tier, status.acceleration.maxOutputTokensCeiling)
                }
              >
                {tier}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs">Token ceiling</label>
            <Input
              type="number"
              className="w-32"
              defaultValue={status.acceleration.maxOutputTokensCeiling}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n > 0) {
                  void saveAcceleration(status.acceleration.priorityTier, n);
                }
              }}
            />
          </div>
        </Card>
      )}

      {tab === "providers" && status && (
        <div className="grid sm:grid-cols-3 gap-3">
          {(["openai", "gemini", "anthropic"] as AIHubProvider[]).map((p) => (
            <Card key={p} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold capitalize">{p}</span>
                <Badge
                  size="sm"
                  variant={status.providers[p]?.configured ? "emerald" : "red"}
                >
                  {status.providers[p]?.configured ? "Configured" : "Not configured"}
                </Badge>
              </div>
              <Button
                size="sm"
                variant="secondary"
                disabled={probeBusy === p}
                loading={probeBusy === p}
                onClick={() => void testConnection(p)}
              >
                Test Connection
              </Button>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={benchmarkConfirmOpen}
        onOpenChange={(open) => {
          setBenchmarkConfirmOpen(open);
          if (!open) setPendingRunAction(null);
        }}
        title="Run benchmark?"
        description="Benchmark may execute multiple API calls and cost ops budget. Continue?"
        confirmLabel="Run benchmark"
        variant="info"
        isLoading={running}
        onConfirm={async () => {
          const action = pendingRunAction;
          setBenchmarkConfirmOpen(false);
          setPendingRunAction(null);
          if (action) await executeRun(action);
        }}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold mt-1 truncate">{value}</p>
    </Card>
  );
}
