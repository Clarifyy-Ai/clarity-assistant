/**
 * Contribution P&L math — shared by Edge report + unit tests.
 * Unknown fees/costs must NOT coerce to zero in totals when status is not_configured.
 */

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

/** Contribution = Gross − Refunds − Fees − API − Variable infra (only when known). */
export function computeContributionProfit(input: ContributionInput): ContributionResult {
  const included: string[] = ["gross_revenue", "refunds"];
  const excluded: string[] = [];

  let profit = input.grossRevenuePaise - input.refundsPaise;

  const fee = knownPaise(input.paymentFees);
  if (fee == null) {
    excluded.push(`payment_fees:${input.paymentFees.quality}`);
  } else {
    profit -= fee;
    included.push("payment_fees");
  }

  const api = knownPaise(input.apiCostPaise);
  if (api == null) {
    excluded.push(`api_cost:${input.apiCostPaise.quality}`);
  } else {
    profit -= api;
    included.push("api_cost");
  }

  const infra = knownPaise(input.variableInfraPaise);
  if (infra == null) {
    excluded.push(`variable_infra:${input.variableInfraPaise.quality}`);
  } else {
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

/** Estimated fee from gross when bps configured; otherwise not_configured. */
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
  const amount = Math.round((grossRevenuePaise * feeRateBps) / 10_000);
  return {
    amountPaise: amount,
    quality: costType === "actual" ? "actual" : "estimated",
    label: costType === "actual" ? "Actual" : "Estimated",
  };
}

/** Convert USD microcents → INR paise using FX micro-rate (INR paise per USD cent * 100?).
 * microcents: 1 USD = 100 cents = 1_000_000 microcents.
 * 1 INR = 100 paise.
 * usdToInr: rupees per 1 USD (e.g. 83).
 */
export function usdMicrocentsToInrPaise(
  microcents: number,
  usdToInr: number,
): number {
  if (!Number.isFinite(microcents) || !Number.isFinite(usdToInr) || usdToInr <= 0) {
    return 0;
  }
  const usd = microcents / 1_000_000;
  const inr = usd * usdToInr;
  return Math.round(inr * 100);
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
  const startOfDay = (d: Date) => {
    const x = new Date(d);
    x.setUTCHours(0, 0, 0, 0);
    return x;
  };

  if (preset === "custom" && custom?.fromIso && custom?.toIso) {
    return { fromIso: custom.fromIso, toIso: custom.toIso };
  }

  let from = startOfDay(to);
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

/** Strip secret-like keys from objects before audit/API return. */
export function redactSecrets<T>(value: T): T {
  if (value == null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v)) as T;
  }
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
