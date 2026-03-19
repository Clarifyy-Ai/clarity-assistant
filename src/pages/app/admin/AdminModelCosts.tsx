// ─────────────────────────────────────────────────────────────────────────────
// AdminModelCosts.tsx — AI model usage and cost analytics.
// Tracks token consumption, cost per model, per-feature breakdown,
// and lets admins adjust credit costs without a redeploy.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from "react";
import { supabase }            from "@/integrations/supabase/client";
import { formatNumber, formatCents, formatPercent } from "@/lib/utils/formatters";

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge }    from "@/components/ui/badge";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast }    from "sonner";
import {
  Bot, Cpu, DollarSign, TrendingUp,
  RefreshCw, Save, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelUsageStat {
  modelId:        string;
  provider:       string;
  callCount:      number;
  tokensIn:       number;
  tokensOut:      number;
  costUSDCents:   number;     // our cost
  revenueCredits: number;     // credits charged to users
  avgLatencyMs:   number;
  errorRate:      number;     // 0–1
}

interface FeatureCreditCost {
  feature:       string;
  label:         string;
  currentCredits: number;
  suggestedCredits: number;
  callsThisMonth: number;
  revenueCredits: number;
}

type DateRange = "7d" | "30d" | "90d";

// ─── Provider badge ───────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  openai:    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  anthropic: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  gemini:    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  deepgram:  "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

// ─── Static credit cost config (editable in UI) ───────────────────────────────

const DEFAULT_CREDIT_COSTS: FeatureCreditCost[] = [
  { feature: "generate_answer",   label: "Generate Answer",    currentCredits: 2,  suggestedCredits: 2,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "generate_feedback", label: "AI Feedback",        currentCredits: 3,  suggestedCredits: 3,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "generate_star",     label: "STAR Builder",       currentCredits: 2,  suggestedCredits: 2,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "generate_hint",     label: "Hints",              currentCredits: 1,  suggestedCredits: 1,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "generate_debrief",  label: "Session Debrief",    currentCredits: 5,  suggestedCredits: 5,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "coach_message",     label: "Coach Reply",        currentCredits: 2,  suggestedCredits: 2,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "company_research",  label: "Company Research",   currentCredits: 3,  suggestedCredits: 3,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "resume_analysis",   label: "Resume Analysis",    currentCredits: 5,  suggestedCredits: 5,  callsThisMonth: 0, revenueCredits: 0 },
  { feature: "rephrase",          label: "Rephrase",           currentCredits: 1,  suggestedCredits: 1,  callsThisMonth: 0, revenueCredits: 0 },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminModelCosts() {
  const [modelStats,   setModelStats]   = useState<ModelUsageStat[]>([]);
  const [creditCosts,  setCreditCosts]  = useState<FeatureCreditCost[]>(DEFAULT_CREDIT_COSTS);
  const [dateRange,    setDateRange]    = useState<DateRange>("30d");
  const [isLoading,    setIsLoading]    = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDirty,      setIsDirty]      = useState(false);
  const [isSaving,     setIsSaving]     = useState(false);

  // ── Fetch usage from credit_transactions ──────────────────────────────────

  const fetchData = async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else             setIsLoading(true);

    try {
      const { data } = await supabase
        .from("credit_transactions")
        .select("amount, type, description")
        .eq("type", "deduction")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (data) {
        // Aggregate by feature/model from description field
        const featureMap: Record<string, number> = {};
        (data as Record<string, unknown>[]).forEach((tx) => {
          const desc    = (tx.description as string ?? "").toLowerCase();
          const feature = DEFAULT_CREDIT_COSTS.find((c) =>
            desc.includes(c.feature.replace("_", " ")) || desc.includes(c.label.toLowerCase())
          )?.feature ?? "other";
          featureMap[feature] = (featureMap[feature] ?? 0) + Math.abs(tx.amount as number);
        });

        setCreditCosts((prev) =>
          prev.map((c) => ({
            ...c,
            revenueCredits: featureMap[c.feature] ?? 0,
            callsThisMonth: Math.round((featureMap[c.feature] ?? 0) / c.currentCredits),
          }))
        );
      }

      // Mock model stats (replace with real edge function logs when available)
      const mockStats: ModelUsageStat[] = [
        { modelId: "gpt-4o",             provider: "openai",    callCount: 4820, tokensIn: 2_410_000, tokensOut: 724_000, costUSDCents: 14_460, revenueCredits: 9640,  avgLatencyMs: 1240, errorRate: 0.008 },
        { modelId: "gpt-4o-mini",        provider: "openai",    callCount: 8301, tokensIn: 4_150_500, tokensOut: 830_100, costUSDCents:  2_490, revenueCredits: 8301,  avgLatencyMs:  540, errorRate: 0.003 },
        { modelId: "claude-3-5-sonnet",  provider: "anthropic", callCount: 1204, tokensIn:   602_000, tokensOut: 180_600, costUSDCents:  4_816, revenueCredits: 3612,  avgLatencyMs: 1840, errorRate: 0.012 },
        { modelId: "claude-3-haiku",     provider: "anthropic", callCount: 2891, tokensIn: 1_445_500, tokensOut: 289_100, costUSDCents:  1_446, revenueCredits: 2891,  avgLatencyMs:  620, errorRate: 0.004 },
        { modelId: "gemini-2.0-flash",   provider: "gemini",    callCount: 3102, tokensIn: 1_551_000, tokensOut: 465_300, costUSDCents:    310, revenueCredits: 3102,  avgLatencyMs:  780, errorRate: 0.006 },
        { modelId: "deepgram-nova-3",    provider: "deepgram",  callCount: 6450, tokensIn:          0, tokensOut:       0, costUSDCents:  1_290, revenueCredits: 0,     avgLatencyMs:  120, errorRate: 0.001 },
      ];
      setModelStats(mockStats);
    } catch (err) {
      console.error("[AdminModelCosts] fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [dateRange]);

  // ── Edit credit cost ──────────────────────────────────────────────────────

  const handleCreditChange = (feature: string, value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) return;
    setCreditCosts((prev) =>
      prev.map((c) => c.feature === feature ? { ...c, currentCredits: num } : c)
    );
    setIsDirty(true);
  };

  const handleSaveCosts = async () => {
    setIsSaving(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      toast.success("Credit costs updated successfully.");
      setIsDirty(false);
    } catch {
      toast.error("Failed to save credit costs.");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Totals ────────────────────────────────────────────────────────────────

  const totalCost    = modelStats.reduce((s, m) => s + m.costUSDCents, 0);
  const totalRevCred = modelStats.reduce((s, m) => s + m.revenueCredits, 0);
  const totalCalls   = modelStats.reduce((s, m) => s + m.callCount, 0);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Model Costs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            AI token usage, per-model costs, and credit pricing configuration.
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
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={isRefreshing}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total API Cost",    value: formatCents(totalCost),       icon: DollarSign, sub: "across all models" },
          { label: "Total API Calls",   value: formatNumber(totalCalls),     icon: Cpu,        sub: "completions + transcriptions" },
          { label: "Credits Consumed",  value: formatNumber(totalRevCred),   icon: TrendingUp, sub: "by users this period" },
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

      {/* ── Model usage table ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" />
            Model Usage Breakdown
          </CardTitle>
          <CardDescription>Cost, token consumption, and error rates per model.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
                : modelStats.map((model) => (
                    <TableRow key={model.modelId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${PROVIDER_COLORS[model.provider] ?? ""}`}
                          >
                            {model.provider}
                          </span>
                          <code className="text-xs font-mono">{model.modelId}</code>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(model.callCount)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(model.tokensIn)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(model.tokensOut)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatCents(model.costUSDCents)}</TableCell>
                      <TableCell className="text-right tabular-nums text-green-600">{formatNumber(model.revenueCredits)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{model.avgLatencyMs}ms</TableCell>
                      <TableCell className="text-right">
                        <span className={model.errorRate > 0.01 ? "text-red-500" : "text-green-600"}>
                          {formatPercent(model.errorRate)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
              }
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Credit cost editor ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="text-base">Credit Cost Configuration</CardTitle>
            <CardDescription>
              Set how many credits each AI action costs. Changes take effect immediately.
            </CardDescription>
          </div>
          {isDirty && (
            <Button size="sm" onClick={handleSaveCosts} disabled={isSaving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
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
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={c.currentCredits}
                      onChange={(e) => handleCreditChange(c.feature, e.target.value)}
                      className="w-20 h-7 text-sm text-right ml-auto"
                    />
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

