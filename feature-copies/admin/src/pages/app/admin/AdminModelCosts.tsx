import { useState, useEffect } from "react";
import { creditsDB } from "@/lib/supabase/database";
import { supabase } from "@/integrations/supabase/client";
import { formatNumber, formatUsdCentsAsInr } from "@/lib/utils/formatters";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { subDays } from "date-fns";
import { toast } from "sonner";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage, toAdminUserMessage } from "@/lib/admin/adminErrors";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { EmptyState } from "@/components/common/EmptyState";
import { Input } from "@/components/ui/Input";

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/Card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button }   from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Bot, Cpu, DollarSign, TrendingUp,
  RefreshCw,
} from "lucide-react";

interface ModelUsageStat {
  modelId:        string;
  provider:       string;
  callCount:      number;
  tokensIn:       number;
  tokensOut:      number;
  costUSDCents:   number;
  revenueCredits: number;
  avgLatencyMs:   number;
  errorRate:      number;
}

interface FeatureCreditCost {
  feature:          string;
  label:            string;
  currentCredits:   number;
  suggestedCredits: number;
  callsThisMonth:   number;
  revenueCredits:   number;
}

type DateRange = "7d" | "30d" | "90d";

const PROVIDER_COLORS: Record<string, string> = {
  openai:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  gemini:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  deepgram:  "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const FEATURE_LABELS: Record<string, string> = {
  live_hint: "Live hint",
  live_answer: "Live answer",
  live_feedback: "Live feedback",
  screenshot_answer: "Screenshot answer",
  session_debrief: "Session debrief",
  ai_coach_message: "Coach message",
  generate_questions: "Generate questions",
  star_builder: "STAR builder",
  rephraser: "Rephraser",
  company_research: "Company research",
  coding_hint: "Coding hint",
  system_design: "System design",
  mock_session: "Mock session",
  resume_analysis: "Resume analysis",
  gap_analysis: "Gap analysis",
  parse_document: "Parse document",
  create_mock_test: "Create mock test",
  mock_test_ai_gap_fill: "Mock AI gap fill",
  generate_practice_questions: "Practice questions",
  parse_question_pdf: "Parse question PDF",
  analyze_test_performance: "Analyze test performance",
  project_builder: "Project builder",
  polish_star: "Polish STAR",
};

function buildCreditCostRows(): FeatureCreditCost[] {
  return Object.entries(AI_CREDIT_COSTS).map(([feature, credits]) => ({
    feature,
    label: FEATURE_LABELS[feature] ?? feature.replace(/_/g, " "),
    currentCredits: credits,
    suggestedCredits: credits,
    callsThisMonth: 0,
    revenueCredits: 0,
  }));
}

export default function AdminModelCosts() {
  const [modelStats,   setModelStats]   = useState<ModelUsageStat[]>([]);
  const [creditCosts,  setCreditCosts]  = useState<FeatureCreditCost[]>(buildCreditCostRows);
  const [pricingRows,  setPricingRows]  = useState<Array<{
    id: string;
    model: string;
    cost_per_1k_in: number;
    cost_per_1k_out: number;
    credits_per_call: number;
    is_active: boolean;
  }>>([]);
  const [dateRange,    setDateRange]    = useState<DateRange>("30d");
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else             setIsLoading(true);
    setLoadError(null);

    try {
      const days = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 90;
      const since = subDays(new Date(), days).toISOString();

      const [creditData, usageRes, pricingRes] = await Promise.all([
        creditsDB.listRecent(2000),
        supabase
          .from("ai_usage_logs" as "profiles")
          .select("model, input_tokens, output_tokens, cost_microcents, latency_ms")
          .gte("created_at", since),
        supabase
          .from("model_pricing")
          .select("id, model, cost_per_1k_in, cost_per_1k_out, credits_per_call, is_active")
          .order("model"),
      ]);

      if (pricingRes.error) {
        // Table may be empty or RLS — show empty pricing, not fake costs
        setPricingRows([]);
      } else {
        setPricingRows((pricingRes.data as typeof pricingRows) ?? []);
      }

      const data = creditData;

      if (data.length > 0) {
        const catalog = buildCreditCostRows();
        const featureMap: Record<string, number> = {};
        data.forEach((tx) => {
          const action  = String(tx.action ?? "").toLowerCase();
          const feature = catalog.find((c) =>
            action.includes(c.feature) || action.includes(c.feature.replace(/_/g, "-"))
          )?.feature ?? "other";
          featureMap[feature] = (featureMap[feature] ?? 0) + Math.abs(Number(tx.amount) || 0);
        });

        setCreditCosts((prev) =>
          prev.map((c) => ({
            ...c,
            revenueCredits: featureMap[c.feature] ?? 0,
            callsThisMonth: Math.round((featureMap[c.feature] ?? 0) / Math.max(c.currentCredits, 1)),
          }))
        );
      }

      const usageRows = (usageRes.data ?? []) as Array<{
        model?: string | null;
        input_tokens?: number | null;
        output_tokens?: number | null;
        cost_microcents?: number | null;
        latency_ms?: number | null;
      }>;
      const modelMap = new Map<string, ModelUsageStat>();

      for (const row of usageRows) {
        const modelId = String(row.model ?? "unknown");
        const provider = modelId.startsWith("gpt")
          ? "openai"
          : modelId.startsWith("claude")
            ? "anthropic"
            : modelId.startsWith("gemini")
              ? "gemini"
              : "other";

        const existing = modelMap.get(modelId) ?? {
          modelId,
          provider,
          callCount: 0,
          tokensIn: 0,
          tokensOut: 0,
          costUSDCents: 0,
          revenueCredits: 0,
          avgLatencyMs: 0,
          errorRate: 0,
        };

        existing.callCount += 1;
        existing.tokensIn += Number(row.input_tokens) || 0;
        existing.tokensOut += Number(row.output_tokens) || 0;
        existing.costUSDCents += Math.round((Number(row.cost_microcents) || 0) / 10_000);
        existing.avgLatencyMs += Number(row.latency_ms) || 0;
        modelMap.set(modelId, existing);
      }

      setModelStats(
        [...modelMap.values()].map((m) => ({
          ...m,
          avgLatencyMs: m.callCount ? Math.round(m.avgLatencyMs / m.callCount) : 0,
        })).sort((a, b) => b.costUSDCents - a.costUSDCents),
      );
    } catch (err) {
      console.error("[AdminModelCosts] fetch error:", err);
      setLoadError(toAdminUserMessage(err, undefined, "AdminModelCosts"));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  async function savePricingRow(row: (typeof pricingRows)[number]) {
    const { error } = await supabase
      .from("model_pricing")
      .update({
        cost_per_1k_in: row.cost_per_1k_in,
        cost_per_1k_out: row.cost_per_1k_out,
        credits_per_call: row.credits_per_call,
        is_active: row.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (error) {
      toast.error(adminActionFailedMessage(error));
      return;
    }
    await writeAdminAudit({
      action: "update",
      targetType: "model_pricing",
      targetId: row.id,
      newValue: {
        model: row.model,
        cost_per_1k_in: row.cost_per_1k_in,
        cost_per_1k_out: row.cost_per_1k_out,
        credits_per_call: row.credits_per_call,
        is_active: row.is_active,
      },
    });
    toast.success("Model pricing saved");
  }

  useEffect(() => { void fetchData(); }, [dateRange]);

  const totalCost    = modelStats.reduce((s, m) => s + m.costUSDCents, 0);
  const totalRevCred = modelStats.reduce((s, m) => s + m.revenueCredits, 0);
  const totalCalls   = modelStats.reduce((s, m) => s + m.callCount, 0);

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Model Costs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Usage telemetry plus server <code className="text-[11px]">model_pricing</code> configuration.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[130px] h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => fetchData(true)} disabled={isRefreshing}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void fetchData(true)} />
      )}

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total API Cost",   value: formatUsdCentsAsInr(totalCost),     icon: DollarSign, sub: "USD provider cost shown in INR" },
          { label: "Total API Calls",  value: formatNumber(totalCalls),   icon: Cpu,        sub: "completions + transcriptions" },
          { label: "Credits Consumed", value: formatNumber(totalRevCred), icon: TrendingUp, sub: "by users this period" },
        ].map(({ label, value, icon: Icon, sub }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoading
                ? <Skeleton className="h-7 w-28" />
                : <p className="text-2xl font-bold">{value}</p>
              }
              <p className="text-xs text-muted-foreground mt-1">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card padding="none">
        <CardHeader className="px-5 pt-4">
          <CardTitle className="text-base">Server model pricing</CardTitle>
          <CardDescription>
            Rows from <code className="text-[11px]">model_pricing</code>. Saves persist to the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {pricingRows.length === 0 && !isLoading ? (
            <div className="p-6">
              <EmptyState title="No pricing rows" description="model_pricing has no rows yet." />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Cost / 1k in</TableHead>
                  <TableHead>Cost / 1k out</TableHead>
                  <TableHead>Credits / call</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pricingRows.map((row, idx) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.model}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-24"
                        value={row.cost_per_1k_in}
                        onChange={(e) => {
                          const next = [...pricingRows];
                          next[idx] = { ...row, cost_per_1k_in: Number(e.target.value) || 0 };
                          setPricingRows(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-24"
                        value={row.cost_per_1k_out}
                        onChange={(e) => {
                          const next = [...pricingRows];
                          next[idx] = { ...row, cost_per_1k_out: Number(e.target.value) || 0 };
                          setPricingRows(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="h-8 w-20"
                        value={row.credits_per_call}
                        onChange={(e) => {
                          const next = [...pricingRows];
                          next[idx] = { ...row, credits_per_call: Number(e.target.value) || 0 };
                          setPricingRows(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={row.is_active}
                        onChange={(e) => {
                          const next = [...pricingRows];
                          next[idx] = { ...row, is_active: e.target.checked };
                          setPricingRows(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="xs" onClick={() => void savePricingRow(row)}>Save</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Model usage table */}
      <Card padding="none">
        <CardHeader className="px-5 pt-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Model Usage Breakdown
          </CardTitle>
          <CardDescription>Cost and token consumption per model. Error rate is shown only when telemetry exists.</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Tokens In</TableHead>
                <TableHead className="text-right">Tokens Out</TableHead>
                <TableHead className="text-right">API Cost</TableHead>
                <TableHead className="text-right">Credits Charged</TableHead>
                <TableHead className="text-right">Avg Latency</TableHead>
                <TableHead className="text-right">Error Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : modelStats.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                        No per-model usage telemetry in the database yet. Credit consumption by feature is shown below.
                      </TableCell>
                    </TableRow>
                  ) : modelStats.map((model) => (
                    <TableRow key={model.modelId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${PROVIDER_COLORS[model.provider] ?? ""}`}>
                            {model.provider}
                          </span>
                          <code className="text-xs font-mono">{model.modelId}</code>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(model.callCount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(model.tokensIn)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(model.tokensOut)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatUsdCentsAsInr(model.costUSDCents)}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">{formatNumber(model.revenueCredits)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{model.avgLatencyMs}ms</TableCell>
                      <TableCell className="text-right text-muted-foreground text-xs">
                        Not available
                      </TableCell>
                    </TableRow>
                  ))
              }
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Credit cost catalog (read-only — source of truth is AI_CREDIT_COSTS) */}
      <Card padding="none">
        <CardHeader className="px-5 pt-4">
          <div>
            <CardTitle className="text-base">Credit Cost Configuration</CardTitle>
            <CardDescription>
              Read-only catalog from <code className="text-[11px]">AI_CREDIT_COSTS</code>.
              Runtime deductions use the shared constant — there is no admin override API yet.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead className="text-right">Calls / Month</TableHead>
                <TableHead className="text-right">Credits Earned</TableHead>
                <TableHead className="text-right w-36">Cost (credits)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creditCosts.map((c) => (
                <TableRow key={c.feature}>
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <code className="text-[10px] text-muted-foreground">{c.feature}</code>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm">
                    {formatNumber(c.callsThisMonth)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-green-600">
                    {formatNumber(c.revenueCredits)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-medium">
                    {c.currentCredits}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
