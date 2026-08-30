import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  HardDrive,
  Radio,
  RefreshCw,
  Server,
  Shield,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";
import { scraperApi } from "@/lib/scraper/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { cn } from "@/lib/utils";

export type HealthStatus = "PASS" | "WARNING" | "FAIL" | "NOT_CONFIGURED" | "MANUAL";

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  detail: string;
};

const STATUS_STYLE: Record<HealthStatus, string> = {
  PASS: "bg-emerald-500/15 text-emerald-600",
  WARNING: "bg-amber-500/15 text-amber-600",
  FAIL: "bg-red-500/15 text-red-600",
  NOT_CONFIGURED: "bg-slate-500/15 text-slate-600",
  MANUAL: "bg-blue-500/15 text-blue-600",
};

type HybridPresence = { configured: boolean; status: "ok" | "not_configured" };

type HybridHealthPayload = {
  edge?: string;
  required?: "ok" | "service-unavailable";
  db?: { ok: boolean; status: string };
  storage?: { ok: boolean; status: string };
  supported_operations?: string[];
  operations_count?: number;
  edge_operation_wrappers?: Record<string, string>;
  chaos?: {
    force_ai_unavailable?: boolean;
    force_python_unavailable?: boolean;
  };
  python?: {
    configured?: boolean;
    hmac_ok?: boolean;
    up?: boolean;
    down?: boolean;
    status?: string;
    health?: { ok: boolean; latency_ms?: number } | null;
    ready?: { ok: boolean; latency_ms?: number } | null;
    signed_internal?: { ok: boolean; latency_ms?: number; code?: string } | null;
  };
  ai?: {
    gemini?: HybridPresence;
    openai?: HybridPresence;
    anthropic?: HybridPresence;
  };
  razorpay?: { configured?: boolean; valid?: boolean; status?: string };
  integrations?: {
    deepgram?: HybridPresence;
    resend?: HybridPresence;
    calendar?: HybridPresence;
    sentry?: HybridPresence;
    posthog?: HybridPresence;
  };
};

function presenceCheck(
  id: string,
  label: string,
  item: HybridPresence | undefined,
): HealthCheck {
  const configured = item?.configured === true;
  return {
    id,
    label,
    status: configured ? "PASS" : "NOT_CONFIGURED",
    detail: configured ? "Configured" : "Integration not configured",
  };
}

/** Cron is scheduled in repo; live send needs Resend + Vault (not verifiable from git). */
export function interviewReminderWorkerCheck(resendConfigured: boolean): HealthCheck {
  return {
    id: "interview_reminders",
    label: "Interview reminder worker",
    status: resendConfigured ? "WARNING" : "NOT_CONFIGURED",
    detail: resendConfigured
      ? "pg_cron send-interview-reminders-every-15m is scheduled in repo; emails also need Vault interview_reminder_cron_secret (runtime not verified from git)."
      : "Cron is scheduled in repo; emails require Resend + vault secret (runtime not verified from git).",
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runAdminHealthChecks(): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // Role
  try {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) throw error;
    checks.push({
      id: "role",
      label: "Admin role",
      status: data === true ? "PASS" : "FAIL",
      detail: data === true ? "is_admin() returned true" : "Current user is not admin",
    });
  } catch (e) {
    checks.push({
      id: "role",
      label: "Admin role",
      status: "FAIL",
      detail: toAdminUserMessage(e, undefined, "diagnostics.role"),
    });
  }

  // Database
  try {
    const { error } = await supabase.from("profiles").select("id", { count: "exact", head: true });
    if (error) throw error;
    checks.push({
      id: "db",
      label: "Database",
      status: "PASS",
      detail: "profiles readable",
    });
  } catch (e) {
    checks.push({
      id: "db",
      label: "Database",
      status: "FAIL",
      detail: toAdminUserMessage(e, undefined, "diagnostics.db"),
    });
  }

  // Admin RPC smoke
  try {
    const { error } = await supabase.rpc("get_admin_dau_mau", { p_days: 1 });
    if (error) throw error;
    checks.push({
      id: "rpc",
      label: "Admin analytics RPC",
      status: "PASS",
      detail: "get_admin_dau_mau ok",
    });
  } catch (e) {
    checks.push({
      id: "rpc",
      label: "Admin analytics RPC",
      status: "FAIL",
      detail: toAdminUserMessage(e, undefined, "diagnostics.rpc"),
    });
  }

  // Feature flags public contract
  try {
    const { error } = await supabase.rpc("get_public_feature_flags");
    if (error) throw error;
    checks.push({
      id: "flags",
      label: "Feature flags public RPC",
      status: "PASS",
      detail: "get_public_feature_flags ok",
    });
  } catch {
    checks.push({
      id: "flags",
      label: "Feature flags public RPC",
      status: "WARNING",
      detail: "RPC unavailable — migration may not be applied yet",
    });
  }

  // Edge: ai-hub-router status
  try {
    await withTimeout(
      fetchEdgeJson("ai-hub-router", { action: "status" }),
      12_000,
      "ai-hub-router",
    );
    checks.push({
      id: "edge",
      label: "Edge (AI Hub)",
      status: "PASS",
      detail: "ai-hub-router responded",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.push({
      id: "edge",
      label: "Edge (AI Hub)",
      status: msg.toLowerCase().includes("not configured") ? "NOT_CONFIGURED" : "WARNING",
      detail: toAdminUserMessage(e, undefined, "diagnostics.edge"),
    });
  }

  // Storage
  try {
    const { error } = await supabase.storage.from("question-images").list("", { limit: 1 });
    if (error) throw error;
    checks.push({
      id: "storage",
      label: "Storage (question-images)",
      status: "PASS",
      detail: "bucket list ok",
    });
  } catch (e) {
    checks.push({
      id: "storage",
      label: "Storage (question-images)",
      status: "WARNING",
      detail: toAdminUserMessage(e, undefined, "diagnostics.storage"),
    });
  }

  // Realtime smoke
  try {
    const channel = supabase.channel(`admin-diag-${Date.now()}`);
    const status = await withTimeout(
      new Promise<string>((resolve) => {
        channel.subscribe((s) => {
          if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            resolve(s);
          }
        });
      }),
      8_000,
      "realtime",
    );
    await supabase.removeChannel(channel);
    checks.push({
      id: "realtime",
      label: "Realtime",
      status: status === "SUBSCRIBED" ? "PASS" : "WARNING",
      detail: status === "SUBSCRIBED" ? "channel subscribed" : `status=${status}`,
    });
  } catch {
    checks.push({
      id: "realtime",
      label: "Realtime",
      status: "WARNING",
      detail: "Realtime unavailable — support chat may need manual refresh",
    });
  }

  // Authenticated hybrid-health (no secret values)
  try {
    const hybrid = await withTimeout(
      fetchEdgeJson<HybridHealthPayload>("hybrid-health", {}),
      15_000,
      "hybrid-health",
    );

    checks.push({
      id: "required_env",
      label: "Required platform config",
      status: hybrid.required === "ok" ? "PASS" : "FAIL",
      detail:
        hybrid.required === "ok"
          ? "Required platform services reachable"
          : "service-unavailable",
    });
    checks.push({
      id: "hybrid_db",
      label: "Database (hybrid-health)",
      status: hybrid.db?.ok ? "PASS" : "FAIL",
      detail: hybrid.db?.ok ? "Database reachable" : "service-unavailable",
    });
    checks.push({
      id: "hybrid_storage",
      label: "Storage (hybrid-health)",
      status: hybrid.storage?.ok
        ? "PASS"
        : hybrid.storage?.status === "not_configured"
          ? "NOT_CONFIGURED"
          : "WARNING",
      detail: hybrid.storage?.ok
        ? "Storage list ok"
        : hybrid.storage?.status === "not_configured"
          ? "Integration not configured"
          : "Storage check failed",
    });

    const pyOk = hybrid.python?.health?.ok && hybrid.python?.ready?.ok;
    const hmacOk = hybrid.python?.hmac_ok === true;
    checks.push({
      id: "python_hmac",
      label: "Python HMAC (Edge→Render)",
      status: !hybrid.python?.configured
        ? "NOT_CONFIGURED"
        : hmacOk
          ? "PASS"
          : pyOk
            ? "WARNING"
            : "FAIL",
      detail: !hybrid.python?.configured
        ? "Integration not configured"
        : hmacOk
          ? "Signed internal route ok (secret not exposed)"
          : pyOk
            ? "Public /health ok but signed internal auth failed — check HMAC secret sync"
            : hybrid.python?.signed_internal?.code ?? "HMAC probe failed",
    });
    checks.push({
      id: "python_edge",
      label: "Python via Edge",
      status: !hybrid.python?.configured
        ? "NOT_CONFIGURED"
        : pyOk
          ? "PASS"
          : "WARNING",
      detail: !hybrid.python?.configured
        ? "Integration not configured"
        : pyOk
          ? "Python health and ready ok"
          : "Python configured but not ready",
    });

    checks.push(presenceCheck("ai_gemini", "Gemini", hybrid.ai?.gemini));
    checks.push(presenceCheck("ai_openai", "OpenAI", hybrid.ai?.openai));
    checks.push(presenceCheck("ai_anthropic", "Anthropic", hybrid.ai?.anthropic));

    checks.push({
      id: "razorpay",
      label: "Razorpay",
      status: !hybrid.razorpay?.configured
        ? "NOT_CONFIGURED"
        : hybrid.razorpay.valid
          ? "PASS"
          : "WARNING",
      detail: !hybrid.razorpay?.configured
        ? "Integration not configured"
        : hybrid.razorpay.valid
          ? "Checkout credentials valid"
          : "Checkout credentials present but invalid",
    });

    checks.push(presenceCheck("deepgram", "Deepgram", hybrid.integrations?.deepgram));
    checks.push(presenceCheck("resend", "Email (Resend)", hybrid.integrations?.resend));
    checks.push(
      interviewReminderWorkerCheck(hybrid.integrations?.resend?.configured === true),
    );
    checks.push(presenceCheck("calendar", "Google Calendar", hybrid.integrations?.calendar));
    checks.push(presenceCheck("sentry", "Sentry", hybrid.integrations?.sentry));
    checks.push(presenceCheck("posthog", "PostHog", hybrid.integrations?.posthog));

    const opCount = hybrid.operations_count ?? hybrid.supported_operations?.length ?? 0;
    checks.push({
      id: "hybrid_operations",
      label: "Hybrid operations matrix",
      status: opCount > 0 ? "PASS" : "WARNING",
      detail: `${opCount} operations; ${Object.keys(hybrid.edge_operation_wrappers ?? {}).length} Edge wrappers`,
    });

    if (hybrid.chaos?.force_ai_unavailable || hybrid.chaos?.force_python_unavailable) {
      checks.push({
        id: "hybrid_chaos",
        label: "Hybrid chaos flags",
        status: "WARNING",
        detail: `force_ai=${Boolean(hybrid.chaos.force_ai_unavailable)} force_python=${Boolean(hybrid.chaos.force_python_unavailable)}`,
      });
    }
  } catch (e) {
    checks.push({
      id: "hybrid_health",
      label: "Hybrid health",
      status: "WARNING",
      detail: toAdminUserMessage(e, undefined, "diagnostics.hybrid"),
    });
  }

  // Scraper (JWT admin paths — separate from Edge HMAC)
  if (!scraperApi.isConfigured()) {
    checks.push({
      id: "scraper",
      label: "FastAPI scraper",
      status: "NOT_CONFIGURED",
      detail: "Scraper integration not configured",
    });
  } else {
    checks.push({
      id: "scraper",
      label: "FastAPI scraper",
      status: "PASS",
      detail: "VITE_SCRAPER_URL is set (JWT-verified admin calls)",
    });
    try {
      const sources = await withTimeout(scraperApi.sources(), 10_000, "scrape/sources");
      checks.push({
        id: "scraper_sources",
        label: "Scraper sources",
        status: sources.supported?.length ? "PASS" : "WARNING",
        detail: sources.supported?.length
          ? `${sources.supported.length} exam types: ${sources.supported.slice(0, 5).join(", ")}${sources.supported.length > 5 ? "…" : ""}`
          : "No supported exam types returned",
      });
    } catch (e) {
      checks.push({
        id: "scraper_sources",
        label: "Scraper sources",
        status: "WARNING",
        detail: toAdminUserMessage(e, undefined, "diagnostics.scraper_sources"),
      });
    }
    try {
      const exams = await withTimeout(scraperApi.paperFactoryExams(), 12_000, "paper-factory/exams");
      checks.push({
        id: "paper_factory_exams",
        label: "Paper factory exams",
        status: exams.success && exams.count > 0 ? "PASS" : exams.success ? "WARNING" : "FAIL",
        detail: exams.success
          ? `${exams.count} gov exam(s) visible to factory`
          : "paper-factory/exams did not return success",
      });
    } catch (e) {
      checks.push({
        id: "paper_factory_exams",
        label: "Paper factory exams",
        status: "WARNING",
        detail: toAdminUserMessage(e, undefined, "diagnostics.paper_factory"),
      });
    }
  }

  // Edge hybrid ping (HMAC smoke — no secrets in response)
  try {
    await withTimeout(fetchEdgeJson("hybrid-ping", {}), 12_000, "hybrid-ping");
    checks.push({
      id: "hybrid_ping",
      label: "Hybrid ping",
      status: "PASS",
      detail: "Edge → Python ping via HMAC ok",
    });
  } catch (e) {
    checks.push({
      id: "hybrid_ping",
      label: "Hybrid ping",
      status: "WARNING",
      detail: toAdminUserMessage(e, undefined, "diagnostics.hybrid_ping"),
    });
  }

  // Admin provider key presence (no secret values)
  try {
    const keys = await withTimeout(
      fetchEdgeJson<{ providers?: Record<string, boolean> }>("ai-key-check", {}),
      8_000,
      "ai-key-check",
    );
    const configured = Object.values(keys.providers ?? {}).filter(Boolean).length;
    checks.push({
      id: "ai_key_check",
      label: "Provider keys (presence)",
      status: configured > 0 ? "PASS" : "NOT_CONFIGURED",
      detail:
        configured > 0
          ? `${configured} provider integration(s) configured (values never returned)`
          : "No provider keys configured on Edge",
    });
  } catch (e) {
    checks.push({
      id: "ai_key_check",
      label: "Provider keys (presence)",
      status: "WARNING",
      detail: toAdminUserMessage(e, undefined, "diagnostics.ai_key_check"),
    });
  }

  // Billing settings
  try {
    const { error } = await supabase.from("billing_settings").select("id").limit(1);
    if (error) throw error;
    checks.push({
      id: "billing",
      label: "Billing settings",
      status: "PASS",
      detail: "billing_settings readable",
    });
  } catch (e) {
    checks.push({
      id: "billing",
      label: "Billing settings",
      status: "WARNING",
      detail: toAdminUserMessage(e, undefined, "diagnostics.billing"),
    });
  }

  // Manual dashboard items (never fake PASS)
  checks.push({
    id: "hibp",
    label: "Leaked password protection (HIBP)",
    status: "MANUAL",
    detail: "Enable in Supabase Dashboard → Auth → Providers → Email",
  });

  return checks;
}

export default function AdminDiagnostics() {
  const [checks, setChecks] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setChecks(await runAdminHealthChecks());
    } catch (e) {
      setError(toAdminUserMessage(e, undefined, "diagnostics"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="admin-diagnostics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <Activity className="h-5 w-5 text-muted-foreground" />
            Admin Diagnostics
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live health probes and manual Dashboard checklist. This is not a security control panel.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void run()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          Re-run
        </Button>
      </div>

      {error && <InlineErrorRetry message={error} onRetry={() => void run()} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live checks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && checks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Running diagnostics…</p>
          ) : (
            checks
              .filter((c) => c.status !== "MANUAL")
              .map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-start gap-2">
                    {c.status === "PASS" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                    ) : c.status === "FAIL" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
                    ) : c.id === "db" ? (
                      <Database className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    ) : c.id === "storage" ? (
                      <HardDrive className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    ) : c.id === "realtime" ? (
                      <Radio className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    ) : c.id === "billing" ? (
                      <Wallet className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Server className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{c.label}</p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                  </div>
                  <Badge className={STATUS_STYLE[c.status]}>{c.status}</Badge>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Manual Dashboard checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            These cannot be flipped from the Admin Portal. Status is always MANUAL — never a fake pass.
          </p>
          {checks
            .filter((c) => c.status === "MANUAL")
            .map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.detail}</p>
                </div>
                <Badge className={STATUS_STYLE.MANUAL}>MANUAL</Badge>
              </div>
            ))}
          <a
            href="https://supabase.com/dashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            Open Supabase Dashboard <ExternalLink className="h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Prefer CI and staged releases for launch quality.{" "}
        <Link to="/app/admin" className="text-primary hover:underline">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}
