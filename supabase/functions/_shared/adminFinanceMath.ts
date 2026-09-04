/** Deno copy of src/lib/admin/financeMath.ts — keep in sync. */

export type MoneyQuality = "actual" | "estimated" | "unknown" | "not_configured";

export type MoneyAmount = {
  amountPaise: number | null;
  quality: MoneyQuality;
  label: string;
};

export type ContributionInput = {
  grossRevenuePaise: number;
  refundsPaise: number;
  paymentFees: MoneyAmount;
  apiCostPaise: MoneyAmount;
  variableInfraPaise: MoneyAmount;
};

export type ContributionResult = {
  contributionProfitPaise: number | null;
  contributionMarginPercent: number | null;
  includedCosts: string[];
  excludedReasons: string[];
  formulaLabel: "Contribution Profit";
  fixedOpexConfigured: false;
};

function knownPaise(m: MoneyAmount): number | null {
  if (m.quality === "unknown" || m.quality === "not_configured") return null;
  if (m.amountPaise == null || !Number.isFinite(m.amountPaise)) return null;
  return m.amountPaise;
}

export function computeContributionProfit(input: ContributionInput): ContributionResult {
  const included: string[] = ["gross_revenue", "refunds"];
  const excluded: string[] = [];
  let profit = input.grossRevenuePaise - input.refundsPaise;

  const fee = knownPaise(input.paymentFees);
  if (fee == null) excluded.push(`payment_fees:${input.paymentFees.quality}`);
  else {
    profit -= fee;
    included.push("payment_fees");
  }

  const api = knownPaise(input.apiCostPaise);
  if (api == null) excluded.push(`api_cost:${input.apiCostPaise.quality}`);
  else {
    profit -= api;
    included.push("api_cost");
  }

  const infra = knownPaise(input.variableInfraPaise);
  if (infra == null) excluded.push(`variable_infra:${input.variableInfraPaise.quality}`);
  else {
    profit -= infra;
    included.push("variable_infra");
  }

  const netRevenue = input.grossRevenuePaise - input.refundsPaise;
  const margin =
    netRevenue > 0 && Number.isFinite(profit)
      ? Math.round((profit / netRevenue) * 10000) / 100
      : null;

  return {
    contributionProfitPaise: Number.isFinite(profit) ? Math.round(profit) : null,
    contributionMarginPercent: margin,
    includedCosts: included,
    excludedReasons: excluded,
    formulaLabel: "Contribution Profit",
    fixedOpexConfigured: false,
  };
}

export function estimatePaymentFeesPaise(
  grossRevenuePaise: number,
  feeRateBps: number | null | undefined,
  costType: "estimated" | "actual" | null | undefined,
): MoneyAmount {
  if (feeRateBps == null || !Number.isFinite(feeRateBps) || feeRateBps < 0) {
    return {
      amountPaise: null,
      quality: "not_configured",
      label: "COST UNKNOWN — payment fee rate not configured",
    };
  }
  return {
    amountPaise: Math.round((grossRevenuePaise * feeRateBps) / 10_000),
    quality: costType === "actual" ? "actual" : "estimated",
    label: costType === "actual" ? "Actual" : "Estimated",
  };
}

export function usdMicrocentsToInrPaise(microcents: number, usdToInr: number): number {
  if (!Number.isFinite(microcents) || !Number.isFinite(usdToInr) || usdToInr <= 0) return 0;
  return Math.round((microcents / 1_000_000) * usdToInr * 100);
}

export function classifyFeatureMargin(
  revenuePaise: number | null,
  costPaise: number | null,
): "PROFITABLE" | "BREAK_EVEN" | "LOSS_MAKING" | "UNKNOWN" {
  if (revenuePaise == null || costPaise == null) return "UNKNOWN";
  const delta = revenuePaise - costPaise;
  if (Math.abs(delta) < 1) return "BREAK_EVEN";
  return delta > 0 ? "PROFITABLE" : "LOSS_MAKING";
}

export function periodBounds(
  preset: string,
  nowMs = Date.now(),
  custom?: { fromIso?: string; toIso?: string },
): { fromIso: string; toIso: string } {
  const to = new Date(nowMs);
  const toIso = to.toISOString();
  if (preset === "custom" && custom?.fromIso && custom?.toIso) {
    return { fromIso: custom.fromIso, toIso: custom.toIso };
  }
  let from = new Date(to);
  from.setUTCHours(0, 0, 0, 0);
  switch (preset) {
    case "today":
      break;
    case "7d":
      from = new Date(to.getTime() - 7 * 86400000);
      break;
    case "30d":
      from = new Date(to.getTime() - 30 * 86400000);
      break;
    case "90d":
      from = new Date(to.getTime() - 90 * 86400000);
      break;
    case "this_month":
      from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
      break;
    case "previous_month": {
      from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
      return { fromIso: from.toISOString(), toIso: end.toISOString() };
    }
    case "this_year":
      from = new Date(Date.UTC(to.getUTCFullYear(), 0, 1));
      break;
    case "all_time":
      return { fromIso: "1970-01-01T00:00:00.000Z", toIso };
    default:
      from = new Date(to.getTime() - 30 * 86400000);
  }
  return { fromIso: from.toISOString(), toIso };
}

export function redactSecrets<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/secret|password|token|apikey|api_key|authorization|webhook|service_role|private/i.test(k)) {
      out[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      out[k] = redactSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out as T;
}

export function maskCredentialIdentifier(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (s.length < 4) return null;
  return `••••••••${s.slice(-4)}`;
}

/** Built-in catalog vs charge-path reconciliation checks (static knowledge). */
export function builtInReconciliationIssues(): Array<{
  id: string;
  severity: "critical" | "major" | "info";
  title: string;
  detail: string;
  status: "open" | "fixed_in_source";
}> {
  return [
    {
      id: "REC-SCREENSHOT-COST",
      severity: "critical",
      title: "Screenshot answer catalog vs charge path",
      detail:
        "Catalog screenshot_answer=10; generate-answer must charge screenshot_answer when screenshot present (not live_answer=8).",
      status: "fixed_in_source",
    },
    {
      id: "REC-LONG-ANSWER-COST",
      severity: "critical",
      title: "Long answer catalog vs charge path",
      detail:
        "resolveActionCost(liveanswerlong)=12; generate-answer must use long cost when mode requests long answers.",
      status: "fixed_in_source",
    },
    {
      id: "REC-GAP-ANALYSIS-UI",
      severity: "major",
      title: "Gap analysis client map vs server",
      detail:
        "useCredits mapped gap_analysis→analyze_test_performance(12); server gap_analysis=10. Client must align.",
      status: "fixed_in_source",
    },
    {
      id: "REC-SCORECARD-DEBRIEF",
      severity: "critical",
      title: "Scorecard and debrief shared session_debrief identity",
      detail:
        "Both charged session_debrief@15. Split generate_scorecard vs session_debrief catalog keys.",
      status: "fixed_in_source",
    },
    {
      id: "REC-POLISH-VS-REPHRASE",
      severity: "info",
      title: "Polish (2) vs rephrase (3) are distinct",
      detail: "Keep polish_star=2 and rephraser=3 separate; do not conflate in UI labels.",
      status: "open",
    },
    {
      id: "REC-PYTHON-USAGE",
      severity: "major",
      title: "Python paper factory usage not logged",
      detail: "DATA NOT AVAILABLE — provider_usage has no paper-factory rows yet.",
      status: "open",
    },
    {
      id: "REC-PAYMENT-FEES",
      severity: "major",
      title: "Razorpay fees require configuration",
      detail: "Set billing_settings.payment_fee_rate_bps or fees remain COST UNKNOWN.",
      status: "open",
    },
  ];
}
