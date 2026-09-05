import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  Download,
  TrendingUp,
  CreditCard,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { PageHeader } from "@/components/layout/PageHeader";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";
import {
  type AdminFinancePeriod,
  type AdminFinanceReport,
  fetchAdminFinanceReport,
  formatPaiseInr,
  qualityBadgeLabel,
  updateAdminFinanceFees,
  upsertAdminUnitCost,
} from "@/lib/admin/adminFinanceApi";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const PERIODS: Array<{ id: AdminFinancePeriod; label: string }> = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "this_month", label: "This month" },
  { id: "previous_month", label: "Previous month" },
  { id: "this_year", label: "This year" },
  { id: "all_time", label: "All time" },
  { id: "custom", label: "Custom" },
];

function QualityBadge({ quality }: { quality?: string }) {
  const label = qualityBadgeLabel(quality);
  const variant =
    label === "ACTUAL"
      ? "default"
      : label === "ESTIMATED"
        ? "secondary"
        : "outline";
  return (
    <Badge variant={variant} className="text-[10px] font-semibold tracking-wide">
      {label}
    </Badge>
  );
}

function MoneyCell({
  paise,
  quality,
}: {
  paise: number | null | undefined;
  quality?: string;
}) {
  if (quality === "unknown" || quality === "not_configured" || paise == null) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-muted-foreground text-sm">COST UNKNOWN</span>
        <QualityBadge quality={quality ?? "unknown"} />
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-semibold tabular-nums">{formatPaiseInr(paise)}</span>
      <QualityBadge quality={quality} />
    </span>
  );
}

function statusBadgeVariant(
  status: "PROFITABLE" | "BREAK_EVEN" | "LOSS_MAKING" | "UNKNOWN",
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "PROFITABLE":
      return "default";
    case "LOSS_MAKING":
      return "destructive";
    case "BREAK_EVEN":
      return "secondary";
    default:
      return "outline";
  }
}

function ProfitLossStatement({
  overview,
}: {
  overview: NonNullable<AdminFinanceReport["overview"]>;
}) {
  const netRevenuePaise = overview.grossRevenuePaise - overview.refundsPaise;
  const contribution = overview.contribution;
  const isLoss =
    contribution.contributionProfitPaise != null &&
    contribution.contributionProfitPaise < 0;

  const rows: Array<{
    label: string;
    paise: number | null;
    quality?: string;
    emphasis?: "subtotal" | "total";
    sign?: "+" | "−" | "=";
  }> = [
    { label: "Gross revenue", paise: overview.grossRevenuePaise, quality: "actual", sign: "+" },
    { label: "Refunds", paise: overview.refundsPaise, quality: "actual", sign: "−" },
    { label: "Net revenue", paise: netRevenuePaise, quality: "actual", emphasis: "subtotal", sign: "=" },
    {
      label: "API / AI costs",
      paise: overview.apiCost.amountPaise,
      quality: overview.apiCost.quality,
      sign: "−",
    },
    {
      label: "Payment processing fees",
      paise: overview.paymentFees.amountPaise,
      quality: overview.paymentFees.quality,
      sign: "−",
    },
    {
      label: isLoss ? "Contribution loss" : "Contribution profit",
      paise: contribution.contributionProfitPaise,
      quality: contribution.contributionProfitPaise == null ? "unknown" : "derived",
      emphasis: "total",
      sign: "=",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Profit &amp; Loss Statement</CardTitle>
        <CardDescription>
          Contribution P&amp;L for the selected period — net revenue minus variable delivery
          costs. Fixed operating expenses are not included.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Line item</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right w-[140px]">Quality</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.label}
                className={
                  row.emphasis === "total"
                    ? "bg-muted/40 font-semibold"
                    : row.emphasis === "subtotal"
                      ? "border-t font-medium"
                      : undefined
                }
              >
                <TableCell>
                  {row.sign ? `${row.sign} ` : ""}
                  {row.label}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.paise == null ? (
                    <span className="text-muted-foreground text-sm">—</span>
                  ) : (
                    <span className="font-semibold">{formatPaiseInr(row.paise)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {row.quality ? <QualityBadge quality={row.quality} /> : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contribution margin
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {contribution.contributionMarginPercent == null
                ? "—"
                : `${contribution.contributionMarginPercent}%`}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Formula
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {contribution.formulaLabel}: Net revenue − known API costs − known payment fees
            </p>
          </div>
        </div>

        {contribution.excludedReasons.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Excluded or incomplete costs</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {contribution.excludedReasons.map((reason) => (
                <li key={reason}>{reason.replace(/:/g, ": ")}</li>
              ))}
              <li>Fixed operating expenses — not configured (net profit unavailable)</li>
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FeatureProfitLossSummary({
  features,
}: {
  features: AdminFinanceReport["featureEconomics"];
}) {
  const profitable = features.filter((f) => f.status === "PROFITABLE").length;
  const lossMaking = features.filter((f) => f.status === "LOSS_MAKING").length;
  const breakEven = features.filter((f) => f.status === "BREAK_EVEN").length;
  const unknown = features.filter((f) => f.status === "UNKNOWN").length;

  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default">Profitable: {profitable}</Badge>
      <Badge variant="destructive">Loss-making: {lossMaking}</Badge>
      <Badge variant="secondary">Break-even: {breakEven}</Badge>
      <Badge variant="outline">Unknown: {unknown}</Badge>
    </div>
  );
}

export default function AdminFinance(): JSX.Element {
  const [period, setPeriod] = useState<AdminFinancePeriod>("30d");
  const [fromIso, setFromIso] = useState("");
  const [toIso, setToIso] = useState("");
  const [report, setReport] = useState<AdminFinanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feeBps, setFeeBps] = useState("");
  const [savingFee, setSavingFee] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminFinanceReport({
        period,
        fromIso: period === "custom" ? fromIso || undefined : undefined,
        toIso: period === "custom" ? toIso || undefined : undefined,
      });
      setReport(data);
      if (data.overview.paymentFees.quality !== "not_configured") {
        // leave fee input as-is after first load unless empty
      }
    } catch (err) {
      setReport(null);
      setError(toAdminUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [period, fromIso, toIso]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveFees() {
    setSavingFee(true);
    try {
      const bps = feeBps.trim() === "" ? null : Number(feeBps);
      await updateAdminFinanceFees({
        paymentFeeRateBps: bps != null && Number.isFinite(bps) ? bps : null,
        paymentFeeCostType: bps != null ? "estimated" : null,
      });
      await load();
    } catch (err) {
      setError(toAdminUserMessage(err));
    } finally {
      setSavingFee(false);
    }
  }

  function downloadCsv() {
    if (!report) return;
    const o = report.overview;
    const lines = [
      "metric,value_paise,quality",
      `gross_revenue,${o.grossRevenuePaise},actual`,
      `refunds,${o.refundsPaise},actual`,
      `payment_fees,${o.paymentFees.amountPaise ?? ""},${o.paymentFees.quality}`,
      `api_cost,${o.apiCost.amountPaise ?? ""},${o.apiCost.quality}`,
      `contribution_profit,${o.contribution.contributionProfitPaise ?? ""},derived`,
      `credits_used,${o.creditsConsumed},actual`,
      `credits_outstanding,${o.creditsOutstanding},actual`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `admin-finance-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading && !report) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <PageHeader title="Finance" subtitle="Revenue, API cost, and contribution P&L" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="p-4 md:p-6">
        <PageHeader title="Finance" subtitle="Revenue, API cost, and contribution P&L" />
        <InlineErrorRetry message={error} onRetry={() => void load()} />
      </div>
    );
  }

  const o = report?.overview;
  const chartEmpty = !report?.timeSeries?.length;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <PageHeader
        title="Finance"
        subtitle="Authoritative cash, credits, and estimated API COGS — never invents numbers"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadCsv} disabled={!report}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Period</label>
          <Select value={period} onValueChange={(v) => setPeriod(v as AdminFinancePeriod)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {period === "custom" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From (ISO)</label>
              <Input value={fromIso} onChange={(e) => setFromIso(e.target.value)} placeholder="2026-01-01T00:00:00.000Z" className="w-[220px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To (ISO)</label>
              <Input value={toIso} onChange={(e) => setToIso(e.target.value)} placeholder="2026-02-01T00:00:00.000Z" className="w-[220px]" />
            </div>
          </>
        )}
        {report && (
          <p className="text-xs text-muted-foreground pb-2">
            Last updated {new Date(report.lastUpdated).toLocaleString()} · {report.period.fromIso.slice(0, 10)} → {report.period.toIso.slice(0, 10)} UTC
          </p>
        )}
      </div>

      {error && <InlineErrorRetry message={error} onRetry={() => void load()} />}

      {o && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> Revenue</CardDescription>
              <CardTitle className="text-xl tabular-nums">{formatPaiseInr(o.grossRevenuePaise)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <QualityBadge quality="actual" />
              <p>{o.purchaseCount} purchases · avg {formatPaiseInr(o.averagePurchasePaise)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><Cpu className="h-3.5 w-3.5" /> API / AI cost</CardDescription>
              <CardTitle className="text-xl">
                <MoneyCell paise={o.apiCost.amountPaise} quality={o.apiCost.quality} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Est {formatPaiseInr(o.apiCostBreakdown.estimatedPaise)} · Act {formatPaiseInr(o.apiCostBreakdown.actualPaise)}
              {o.apiCostBreakdown.unknownRows > 0 && ` · ${o.apiCostBreakdown.unknownRows} unknown rows`}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Payment fees</CardDescription>
              <CardTitle className="text-xl">
                <MoneyCell paise={o.paymentFees.amountPaise} quality={o.paymentFees.quality} />
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">{o.paymentFees.label}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Contribution profit</CardDescription>
              <CardTitle className="text-xl tabular-nums">
                {o.contribution.contributionProfitPaise == null
                  ? "—"
                  : formatPaiseInr(o.contribution.contributionProfitPaise)}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <p>
                Margin{" "}
                {o.contribution.contributionMarginPercent == null
                  ? "—"
                  : `${o.contribution.contributionMarginPercent}%`}
              </p>
              <p>Fixed operating costs not configured</p>
              <p>Refunds {formatPaiseInr(o.refundsPaise)} ({o.refundCount})</p>
            </CardContent>
          </Card>
        </div>
      )}

      {o && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <Card><CardContent className="pt-4">Paying users <strong className="float-right tabular-nums">{o.payingUsers}</strong></CardContent></Card>
          <Card><CardContent className="pt-4">Credits consumed <strong className="float-right tabular-nums">{o.creditsConsumed}</strong></CardContent></Card>
          <Card><CardContent className="pt-4">Credits outstanding <strong className="float-right tabular-nums">{o.creditsOutstanding}</strong></CardContent></Card>
          <Card><CardContent className="pt-4">Credits reserved (open) <strong className="float-right tabular-nums">{o.creditsReservedOpen}</strong></CardContent></Card>
        </div>
      )}

      {o && <ProfitLossStatement overview={o} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue vs API cost</CardTitle>
          <CardDescription>Same period boundary · empty = no data (not fabricated)</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {chartEmpty ? (
            <EmptyState title="No data for this period." description="Payments or usage will appear here when recorded." />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={report!.timeSeries}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number, name: string) => [
                    formatPaiseInr(v),
                    name === "revenuePaise" ? "Revenue" : "API cost",
                  ]}
                />
                <Legend />
                <Line type="monotone" dataKey="revenuePaise" name="Revenue" stroke="hsl(var(--primary))" dot={false} />
                <Line type="monotone" dataKey="apiCostPaise" name="API cost" stroke="hsl(var(--destructive))" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Credit economy</CardTitle>
            <CardDescription>{report?.creditEconomy.note}</CardDescription>
          </CardHeader>
          <CardContent>
            {!report ? null : (
              <Table>
                <TableBody>
                  {(
                    [
                      ["Purchased", report.creditEconomy.purchased],
                      ["Granted", report.creditEconomy.granted],
                      ["Used", report.creditEconomy.used],
                      ["Released", report.creditEconomy.released],
                      ["Refunded", report.creditEconomy.refunded],
                      ["Reserved (open)", report.creditEconomy.reservedOpen],
                      ["Outstanding", report.creditEconomy.outstanding],
                    ] as const
                  ).map(([label, val]) => (
                    <TableRow key={label}>
                      <TableCell>{label}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{val}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top providers</CardTitle>
            <CardDescription>Estimated from provider_usage / ai_usage_logs</CardDescription>
          </CardHeader>
          <CardContent>
            {!report?.topProviders.length ? (
              <EmptyState title="No data for this period." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Est.</TableHead>
                    <TableHead className="text-right">Act.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.topProviders.map((p) => (
                    <TableRow key={p.provider}>
                      <TableCell className="font-medium">{p.provider}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.rows}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPaiseInr(p.estimatedCostPaise)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPaiseInr(p.actualCostPaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profit / Loss by Feature</CardTitle>
          <CardDescription>
            Per-feature contribution when API cost and revenue attribution are known.
          </CardDescription>
          {report?.featureEconomics.length ? (
            <FeatureProfitLossSummary features={report.featureEconomics} />
          ) : null}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!report?.featureEconomics.length ? (
            <EmptyState
              title="No feature P&L for this period."
              description="Usage and payments in this window will populate profitable vs loss-making features."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Feature / operation</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">API cost</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead>P&amp;L status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.featureEconomics.map((f) => (
                  <TableRow key={f.feature}>
                    <TableCell className="font-medium max-w-[220px] truncate">{f.feature}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.operations}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.creditsUsed}</TableCell>
                    <TableCell className="text-right">
                      <MoneyCell paise={f.apiCostPaise} quality={f.apiCostQuality} />
                    </TableCell>
                    <TableCell className="text-right">
                      {f.revenuePaise == null ? (
                        <span className="text-muted-foreground text-xs">REVENUE ATTRIBUTION UNKNOWN</span>
                      ) : (
                        formatPaiseInr(f.revenuePaise)
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(f.status)}>{f.status.replace(/_/g, " ")}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Reconciliation issues
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report?.reconciliation ?? []).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id}</TableCell>
                  <TableCell>{r.severity}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">{r.detail}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "fixed_in_source" ? "default" : "secondary"}>
                      {r.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider status</CardTitle>
            <CardDescription>Never shows API secrets — Configured / Missing + masked id only</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Credential</TableHead>
                  <TableHead>Identifier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(report?.providerStatus ?? []).map((p) => (
                  <TableRow key={`${p.provider}-${p.service}`}>
                    <TableCell className="font-medium">{p.provider}</TableCell>
                    <TableCell>{p.service}</TableCell>
                    <TableCell>
                      {p.status === "configured" ? "Configured" : "Not configured"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.identifier ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cost configuration</CardTitle>
            <CardDescription>Payment fee rate (bps). NULL = COST UNKNOWN, not ₹0.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Fee rate (bps)</label>
                <Input
                  value={feeBps}
                  onChange={(e) => setFeeBps(e.target.value)}
                  placeholder="e.g. 200 = 2%"
                  className="w-40"
                />
              </div>
              <Button size="sm" onClick={() => void saveFees()} disabled={savingFee}>
                Save fee settings
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Data quality: {JSON.stringify(report?.dataQuality ?? {})}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void upsertAdminUnitCost({
                  provider: "gemini",
                  service: "ai",
                  operation: "text_generation_input",
                  unit: "1M_tokens",
                  unitCost: 0.1,
                  costType: "estimated",
                  notes: "Admin refresh of seed rate",
                }).then(() => load())
              }
            >
              Refresh Gemini input unit cost (estimated)
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent payment orders</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!report?.recentOrders.length ? (
            <EmptyState title="No data for this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.recentOrders.map((ord) => (
                  <TableRow key={ord.id}>
                    <TableCell className="text-xs">{String(ord.createdAt).slice(0, 19)}</TableCell>
                    <TableCell className="font-mono text-xs">{ord.userId?.slice(0, 8)}…</TableCell>
                    <TableCell>{ord.status}</TableCell>
                    <TableCell>{ord.productType ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaiseInr(ord.amountPaise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Deep-dives:{" "}
        <a className="text-primary underline" href="/app/admin/revenue">Revenue</a>
        {" · "}
        <a className="text-primary underline" href="/app/admin/model-costs">Model Costs</a>
      </p>
    </div>
  );
}
