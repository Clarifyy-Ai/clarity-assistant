/**
 * Admin Finance report — revenue, credits, estimated API COGS, contribution P&L.
 * Admin-only. Never returns API secrets. Unknown costs ≠ ₹0.
 */
import { handleCors, getCorsHeaders, corsJson } from "../_shared/cors.ts";
import { authenticateRequest, enforceAdmin } from "../_shared/auth.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  builtInReconciliationIssues,
  classifyFeatureMargin,
  computeContributionProfit,
  estimatePaymentFeesPaise,
  maskCredentialIdentifier,
  periodBounds,
  redactSecrets,
  usdMicrocentsToInrPaise,
} from "../_shared/adminFinanceMath.ts";

const USD_TO_INR = Number(Deno.env.get("FINANCE_USD_TO_INR") ?? "83") || 83;

const PAID_STATUSES = new Set(["paid", "fulfilled", "captured", "success"]);

type Body = {
  period?: string;
  fromIso?: string;
  toIso?: string;
  format?: "json" | "csv";
  action?: "report" | "update_fee_settings" | "upsert_unit_cost";
  paymentFeeRateBps?: number | null;
  paymentFeeCostType?: "estimated" | "actual" | null;
  unitCost?: {
    id?: string;
    provider: string;
    service: string;
    operation: string;
    unit: string;
    unitCost: number;
    currency?: string;
    costType: "estimated" | "actual";
    notes?: string;
  };
};

function present(v: string | undefined): boolean {
  return Boolean((v ?? "").trim());
}

function envMasked(name: string): { status: "configured" | "missing"; identifier: string | null } {
  const raw = Deno.env.get(name);
  if (!present(raw)) return { status: "missing", identifier: null };
  return { status: "configured", identifier: maskCredentialIdentifier(raw) };
}

function json(req: Request, body: unknown, status = 200): Response {
  return corsJson(req, status, body);
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST" && req.method !== "GET") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  const auth = await authenticateRequest(req);
  if (auth.error || !auth.context) {
    return json(req, { error: "unauthorized" }, 401);
  }

  const denied = await enforceAdmin(auth.context.user.id, req);
  if (denied) return denied;

  const db = createServiceClient();
  let body: Body = {};
  if (req.method === "POST") {
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }
  } else {
    const url = new URL(req.url);
    body = {
      period: url.searchParams.get("period") ?? "30d",
      fromIso: url.searchParams.get("from") ?? undefined,
      toIso: url.searchParams.get("to") ?? undefined,
      format: (url.searchParams.get("format") as "json" | "csv") ?? "json",
      action: "report",
    };
  }

  const action = body.action ?? "report";

  if (action === "update_fee_settings") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ("paymentFeeRateBps" in body) {
      patch.payment_fee_rate_bps = body.paymentFeeRateBps;
    }
    if ("paymentFeeCostType" in body) {
      patch.payment_fee_cost_type = body.paymentFeeCostType;
    }
    const { data: before } = await db.from("billing_settings").select("*").eq("id", 1).maybeSingle();
    const { error } = await db.from("billing_settings").update(patch).eq("id", 1);
    if (error) return json(req, { error: error.message }, 500);
    await db.from("admin_audit_log").insert({
      admin_id: auth.context.user.id,
      action: "finance_fee_settings_update",
      target_type: "billing_settings",
      target_id: "1",
      old_value: redactSecrets({
        payment_fee_rate_bps: before?.payment_fee_rate_bps ?? null,
        payment_fee_cost_type: before?.payment_fee_cost_type ?? null,
      }),
      new_value: redactSecrets(patch),
    });
    return json(req, { ok: true });
  }

  if (action === "upsert_unit_cost" && body.unitCost) {
    const uc = body.unitCost;
    const row = {
      provider: uc.provider.trim(),
      service: uc.service.trim(),
      operation: uc.operation.trim(),
      unit: uc.unit.trim(),
      unit_cost: uc.unitCost,
      currency: (uc.currency ?? "USD").trim(),
      cost_type: uc.costType,
      notes: uc.notes ?? null,
      source: "admin_ui",
      updated_at: new Date().toISOString(),
      effective_from: new Date().toISOString(),
    };
    let error;
    if (uc.id) {
      ({ error } = await db.from("provider_unit_costs").update(row).eq("id", uc.id));
    } else {
      ({ error } = await db.from("provider_unit_costs").insert(row));
    }
    if (error) return json(req, { error: error.message }, 500);
    await db.from("admin_audit_log").insert({
      admin_id: auth.context.user.id,
      action: "finance_unit_cost_upsert",
      target_type: "provider_unit_costs",
      target_id: uc.id ?? row.provider,
      new_value: redactSecrets(row),
    });
    return json(req, { ok: true });
  }

  const { fromIso, toIso } = periodBounds(body.period ?? "30d", Date.now(), {
    fromIso: body.fromIso,
    toIso: body.toIso,
  });

  const [
    ordersRes,
    creditsRes,
    usageRes,
    settingsRes,
    unitCostsRes,
    profilesCreditsRes,
    govJobsRes,
    debriefJobsRes,
    researchJobsRes,
  ] = await Promise.all([
    db
      .from("payment_orders")
      .select("id, user_id, amount_paise, status, credits_granted, product_type, created_at, metadata, updated_at")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(20000),
    db
      .from("credit_transactions")
      .select("id, user_id, amount, action, description, created_at, metadata")
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(50000),
    db
      .from("provider_usage")
      .select(
        "id, provider, service, operation, user_id, feature, estimated_cost_microcents, actual_cost_microcents, cost_type, status, created_at, billing_mode",
      )
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .limit(50000),
    db
      .from("billing_settings")
      .select("payment_fee_rate_bps, payment_fee_cost_type, finance_currency")
      .eq("id", 1)
      .maybeSingle(),
    db.from("provider_unit_costs").select("*").is("effective_to", null).limit(500),
    db.from("profiles").select("credits").limit(100000),
    db
      .from("gov_paper_generation_jobs")
      .select("credits_reserved, credits_charged, credits_finalized_at, credits_released_at, status")
      .is("credits_finalized_at", null)
      .is("credits_released_at", null)
      .limit(5000),
    db
      .from("session_debrief_jobs")
      .select("credits_reserved, status")
      .in("status", ["queued", "running", "leased"])
      .limit(5000),
    db
      .from("company_research_jobs")
      .select("credits_reserved, status")
      .in("status", ["queued", "running", "leased"])
      .limit(5000),
  ]);

  const orders = ordersRes.data ?? [];
  const credits = creditsRes.data ?? [];
  const usage = usageRes.data ?? [];
  const settings = settingsRes.data;

  let grossRevenuePaise = 0;
  let purchaseCount = 0;
  let creditPackPaise = 0;
  let planPaise = 0;
  let refundsPaise = 0;
  let refundCount = 0;
  const revenueByDay: Record<string, number> = {};

  for (const o of orders) {
    const status = String(o.status ?? "").toLowerCase();
    const amount = Number(o.amount_paise) || 0;
    const day = String(o.created_at ?? "").slice(0, 10);
    if (PAID_STATUSES.has(status)) {
      grossRevenuePaise += amount;
      purchaseCount += 1;
      const ptype = String(o.product_type ?? "").toLowerCase();
      if (ptype.includes("credit")) creditPackPaise += amount;
      else planPaise += amount;
      revenueByDay[day] = (revenueByDay[day] ?? 0) + amount;
    }
    if (status === "refunded") {
      refundsPaise += amount;
      refundCount += 1;
    }
  }

  let creditsPurchased = 0;
  let creditsGranted = 0;
  let creditsUsed = 0;
  let creditsRefunded = 0;
  let creditsReleased = 0;
  const usageByFeature: Record<
    string,
    { runs: number; credits: number; success: number; failed: number }
  > = {};

  for (const c of credits) {
    const action = String(c.action ?? "");
    const amount = Number(c.amount) || 0;
    const desc = String(c.description ?? "unknown");
    if (action === "purchase") creditsPurchased += Math.abs(amount);
    else if (action === "bonus" || action === "referral_reward" || action === "subscription_grant" || action === "admin_adjustment") {
      if (amount > 0) creditsGranted += amount;
    } else if (action === "usage") {
      creditsUsed += Math.abs(amount);
      const bucket = usageByFeature[desc] ?? { runs: 0, credits: 0, success: 0, failed: 0 };
      bucket.runs += 1;
      bucket.credits += Math.abs(amount);
      bucket.success += 1;
      usageByFeature[desc] = bucket;
    } else if (action === "refund") {
      creditsRefunded += Math.abs(amount);
      if (String(c.description ?? "").toLowerCase().includes("releas")) {
        creditsReleased += Math.abs(amount);
      }
    }
  }

  let estimatedApiMicro = 0;
  let actualApiMicro = 0;
  let unknownCostRows = 0;
  const costByProvider: Record<string, { estimatedMicro: number; actualMicro: number; rows: number }> = {};
  const costByDay: Record<string, number> = {};

  for (const u of usage) {
    const provider = String(u.provider ?? "unknown");
    const day = String(u.created_at ?? "").slice(0, 10);
    const bucket = costByProvider[provider] ?? { estimatedMicro: 0, actualMicro: 0, rows: 0 };
    bucket.rows += 1;
    const est = u.estimated_cost_microcents == null ? null : Number(u.estimated_cost_microcents);
    const act = u.actual_cost_microcents == null ? null : Number(u.actual_cost_microcents);
    if (u.cost_type === "unknown" || (est == null && act == null)) {
      unknownCostRows += 1;
    } else if (act != null && Number.isFinite(act)) {
      actualApiMicro += act;
      bucket.actualMicro += act;
      costByDay[day] = (costByDay[day] ?? 0) + act;
    } else if (est != null && Number.isFinite(est)) {
      estimatedApiMicro += est;
      bucket.estimatedMicro += est;
      costByDay[day] = (costByDay[day] ?? 0) + est;
    } else {
      unknownCostRows += 1;
    }
    costByProvider[provider] = bucket;

    const feature = String(u.feature ?? u.operation ?? "unknown");
    const fb = usageByFeature[feature] ?? { runs: 0, credits: 0, success: 0, failed: 0 };
    fb.runs += 1;
    if (u.status === "failed" || u.status === "timeout") fb.failed += 1;
    else fb.success += 1;
    usageByFeature[feature] = fb;
  }

  const apiCostPaiseEstimated = usdMicrocentsToInrPaise(estimatedApiMicro, USD_TO_INR);
  const apiCostPaiseActual = usdMicrocentsToInrPaise(actualApiMicro, USD_TO_INR);
  const apiTotalPaise = apiCostPaiseEstimated + apiCostPaiseActual;
  const apiMoney =
    unknownCostRows > 0 && apiTotalPaise === 0
      ? {
          amountPaise: null as number | null,
          quality: "unknown" as const,
          label: "COST UNKNOWN — usage rows without cost",
        }
      : apiTotalPaise > 0
        ? {
            amountPaise: apiTotalPaise,
            quality: (actualApiMicro > 0 && estimatedApiMicro === 0
              ? "actual"
              : actualApiMicro > 0
                ? "estimated"
                : "estimated") as "actual" | "estimated",
            label:
              actualApiMicro > 0 && estimatedApiMicro > 0
                ? "Mixed ACTUAL + ESTIMATED"
                : actualApiMicro > 0
                  ? "Actual"
                  : "Estimated",
          }
        : usage.length === 0
          ? {
              amountPaise: 0,
              quality: "estimated" as const,
              label: "No provider usage in period",
            }
          : {
              amountPaise: null,
              quality: "unknown" as const,
              label: "COST UNKNOWN",
            };

  const paymentFees = estimatePaymentFeesPaise(
    grossRevenuePaise,
    settings?.payment_fee_rate_bps ?? null,
    (settings?.payment_fee_cost_type as "estimated" | "actual" | null) ?? null,
  );

  const variableInfra = {
    amountPaise: null as number | null,
    quality: "not_configured" as const,
    label: "Fixed/variable infra not configured",
  };

  const contribution = computeContributionProfit({
    grossRevenuePaise,
    refundsPaise,
    paymentFees,
    apiCostPaise: apiMoney,
    variableInfraPaise: variableInfra,
  });

  let outstandingCredits = 0;
  for (const p of profilesCreditsRes.data ?? []) {
    outstandingCredits += Math.max(0, Number(p.credits) || 0);
  }

  let reservedCredits = 0;
  for (const j of govJobsRes.data ?? []) {
    reservedCredits += Math.max(0, Number(j.credits_reserved) || 0);
  }
  for (const j of debriefJobsRes.data ?? []) {
    reservedCredits += Math.max(0, Number(j.credits_reserved) || 0);
  }
  for (const j of researchJobsRes.data ?? []) {
    reservedCredits += Math.max(0, Number(j.credits_reserved) || 0);
  }

  const payingUsers = new Set(
    orders.filter((o) => PAID_STATUSES.has(String(o.status ?? "").toLowerCase())).map((o) => o.user_id),
  );

  const featureEconomics = Object.entries(usageByFeature)
    .map(([feature, stats]) => {
      const apiShare =
        creditsUsed > 0
          ? Math.round((stats.credits / creditsUsed) * apiTotalPaise)
          : null;
      const revenueAttr = null as number | null;
      return {
        feature,
        operations: stats.runs,
        successful: stats.success,
        failed: stats.failed,
        creditsUsed: stats.credits,
        apiCostPaise: apiShare,
        apiCostQuality: apiShare == null ? "unknown" : apiMoney.quality,
        revenuePaise: revenueAttr,
        revenueQuality: "unknown" as const,
        status: classifyFeatureMargin(revenueAttr, apiShare),
      };
    })
    .sort((a, b) => (b.apiCostPaise ?? 0) - (a.apiCostPaise ?? 0))
    .slice(0, 50);

  const topProviders = Object.entries(costByProvider)
    .map(([provider, v]) => ({
      provider,
      rows: v.rows,
      estimatedCostPaise: usdMicrocentsToInrPaise(v.estimatedMicro, USD_TO_INR),
      actualCostPaise: usdMicrocentsToInrPaise(v.actualMicro, USD_TO_INR),
      costQuality: v.actualMicro > 0 ? "actual" : "estimated",
    }))
    .sort(
      (a, b) =>
        b.estimatedCostPaise + b.actualCostPaise - (a.estimatedCostPaise + a.actualCostPaise),
    )
    .slice(0, 10);

  const seriesDays = [...new Set([...Object.keys(revenueByDay), ...Object.keys(costByDay)])].sort();
  const timeSeries = seriesDays.map((day) => ({
    day,
    revenuePaise: revenueByDay[day] ?? 0,
    apiCostPaise: usdMicrocentsToInrPaise(costByDay[day] ?? 0, USD_TO_INR),
  }));

  const providerStatus = [
    { provider: "gemini", service: "ai", ...envMasked("GEMINI_API_KEY") },
    { provider: "openai", service: "ai", ...envMasked("OPENAI_API_KEY") },
    { provider: "anthropic", service: "ai", ...envMasked("ANTHROPIC_API_KEY") },
    { provider: "deepgram", service: "stt", ...envMasked("DEEPGRAM_API_KEY") },
    { provider: "razorpay", service: "payments", ...envMasked("RAZORPAY_KEY_SECRET") },
    { provider: "resend", service: "email", ...envMasked("RESEND_API_KEY") },
    { provider: "hostinger", service: "email", ...envMasked("HOSTINGER_MAIL_TOKEN") },
    { provider: "ocr_space", service: "ocr", ...envMasked("OCR_API_KEY") },
    {
      provider: "python_hybrid",
      service: "ai",
      status: present(Deno.env.get("PYTHON_SERVICE_URL")) ? ("configured" as const) : ("missing" as const),
      identifier: null,
    },
  ];

  const report = {
    lastUpdated: new Date().toISOString(),
    period: { preset: body.period ?? "30d", fromIso, toIso, timezone: "UTC" },
    currency: settings?.finance_currency ?? "INR",
    usdToInr: USD_TO_INR,
    overview: {
      grossRevenuePaise,
      purchaseCount,
      averagePurchasePaise: purchaseCount > 0 ? Math.round(grossRevenuePaise / purchaseCount) : 0,
      revenuePerPayingUserPaise:
        payingUsers.size > 0 ? Math.round(grossRevenuePaise / payingUsers.size) : 0,
      payingUsers: payingUsers.size,
      refundsPaise,
      refundCount,
      refundRate:
        purchaseCount + refundCount > 0
          ? Math.round((refundCount / (purchaseCount + refundCount)) * 10000) / 100
          : 0,
      paymentFees,
      apiCost: apiMoney,
      apiCostBreakdown: {
        estimatedMicrocents: estimatedApiMicro,
        actualMicrocents: actualApiMicro,
        estimatedPaise: apiCostPaiseEstimated,
        actualPaise: apiCostPaiseActual,
        unknownRows: unknownCostRows,
      },
      contribution,
      creditsConsumed: creditsUsed,
      creditsOutstanding: outstandingCredits,
      creditsReservedOpen: reservedCredits,
    },
    revenueSplit: {
      creditPackPaise,
      planPaise,
      attributionNote: "REVENUE ATTRIBUTION to features is UNKNOWN unless payment metadata maps a feature",
    },
    creditEconomy: {
      purchased: creditsPurchased,
      granted: creditsGranted,
      used: creditsUsed,
      released: creditsReleased,
      refunded: creditsRefunded,
      reservedOpen: reservedCredits,
      outstanding: outstandingCredits,
      note: "Unused credits are liability, not revenue",
    },
    timeSeries,
    topProviders,
    featureEconomics,
    unitCosts: unitCostsRes.data ?? [],
    providerStatus,
    reconciliation: builtInReconciliationIssues(),
    dataQuality: {
      revenue: "actual",
      refunds: "actual",
      paymentFees: paymentFees.quality,
      apiCost: apiMoney.quality,
      pythonPaperFactory: "data_not_available",
      ocrEmailCosts: "data_not_available",
      vendorInvoices: "requires_configuration",
      fixedOpex: "not_configured",
    },
    recentOrders: orders
      .slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 25)
      .map((o) => ({
        id: o.id,
        userId: o.user_id,
        amountPaise: o.amount_paise,
        status: o.status,
        productType: o.product_type,
        createdAt: o.created_at,
      })),
    errors: {
      orders: ordersRes.error?.message ?? null,
      credits: creditsRes.error?.message ?? null,
      usage: usageRes.error?.message ?? null,
    },
  };

  if (body.format === "csv") {
    const lines = [
      "metric,value_paise,quality",
      `gross_revenue,${grossRevenuePaise},actual`,
      `refunds,${refundsPaise},actual`,
      `payment_fees,${paymentFees.amountPaise ?? ""},${paymentFees.quality}`,
      `api_cost,${apiMoney.amountPaise ?? ""},${apiMoney.quality}`,
      `contribution_profit,${contribution.contributionProfitPaise ?? ""},derived`,
    ];
    return new Response(lines.join("\n"), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="admin-finance.csv"',
      },
    });
  }

  return json(req, redactSecrets(report));
});
