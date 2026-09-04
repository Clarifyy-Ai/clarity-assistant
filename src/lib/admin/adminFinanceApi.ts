import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import type { MoneyAmount, MoneyQuality } from "@/lib/admin/financeMath";

export type AdminFinancePeriod =
  | "today"
  | "7d"
  | "30d"
  | "90d"
  | "this_month"
  | "previous_month"
  | "this_year"
  | "all_time"
  | "custom";

export type AdminFinanceReport = {
  lastUpdated: string;
  period: { preset: string; fromIso: string; toIso: string; timezone: string };
  currency: string;
  usdToInr: number;
  overview: {
    grossRevenuePaise: number;
    purchaseCount: number;
    averagePurchasePaise: number;
    revenuePerPayingUserPaise: number;
    payingUsers: number;
    refundsPaise: number;
    refundCount: number;
    refundRate: number;
    paymentFees: MoneyAmount;
    apiCost: MoneyAmount;
    apiCostBreakdown: {
      estimatedMicrocents: number;
      actualMicrocents: number;
      estimatedPaise: number;
      actualPaise: number;
      unknownRows: number;
    };
    contribution: {
      contributionProfitPaise: number | null;
      contributionMarginPercent: number | null;
      includedCosts: string[];
      excludedReasons: string[];
      formulaLabel: string;
      fixedOpexConfigured: false;
    };
    creditsConsumed: number;
    creditsOutstanding: number;
    creditsReservedOpen: number;
  };
  revenueSplit: {
    creditPackPaise: number;
    planPaise: number;
    attributionNote: string;
  };
  creditEconomy: {
    purchased: number;
    granted: number;
    used: number;
    released: number;
    refunded: number;
    reservedOpen: number;
    outstanding: number;
    note: string;
  };
  timeSeries: Array<{ day: string; revenuePaise: number; apiCostPaise: number }>;
  topProviders: Array<{
    provider: string;
    rows: number;
    estimatedCostPaise: number;
    actualCostPaise: number;
    costQuality: string;
  }>;
  featureEconomics: Array<{
    feature: string;
    operations: number;
    successful: number;
    failed: number;
    creditsUsed: number;
    apiCostPaise: number | null;
    apiCostQuality: string;
    revenuePaise: number | null;
    revenueQuality: string;
    status: "PROFITABLE" | "BREAK_EVEN" | "LOSS_MAKING" | "UNKNOWN";
  }>;
  unitCosts: Array<Record<string, unknown>>;
  providerStatus: Array<{
    provider: string;
    service: string;
    status: "configured" | "missing";
    identifier: string | null;
  }>;
  reconciliation: Array<{
    id: string;
    severity: string;
    title: string;
    detail: string;
    status: string;
  }>;
  dataQuality: Record<string, string>;
  recentOrders: Array<{
    id: string;
    userId: string;
    amountPaise: number;
    status: string;
    productType: string | null;
    createdAt: string;
  }>;
  errors?: Record<string, string | null>;
};

export async function fetchAdminFinanceReport(input: {
  period: AdminFinancePeriod;
  fromIso?: string;
  toIso?: string;
}): Promise<AdminFinanceReport> {
  return fetchEdgeJson("admin-finance-report", {
    action: "report",
    period: input.period,
    fromIso: input.fromIso,
    toIso: input.toIso,
  });
}

export async function updateAdminFinanceFees(input: {
  paymentFeeRateBps: number | null;
  paymentFeeCostType: "estimated" | "actual" | null;
}): Promise<{ ok: boolean }> {
  return fetchEdgeJson("admin-finance-report", {
    action: "update_fee_settings",
    ...input,
  });
}

export async function upsertAdminUnitCost(unitCost: {
  id?: string;
  provider: string;
  service: string;
  operation: string;
  unit: string;
  unitCost: number;
  currency?: string;
  costType: "estimated" | "actual";
  notes?: string;
}): Promise<{ ok: boolean }> {
  return fetchEdgeJson("admin-finance-report", {
    action: "upsert_unit_cost",
    unitCost,
  });
}

export function formatPaiseInr(paise: number | null | undefined): string {
  if (paise == null || !Number.isFinite(paise)) return "—";
  const inr = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(inr);
}

export function qualityBadgeLabel(q: MoneyQuality | string | undefined): string {
  const v = String(q ?? "unknown").toUpperCase();
  if (v === "NOT_CONFIGURED") return "NOT CONFIGURED";
  return v;
}
