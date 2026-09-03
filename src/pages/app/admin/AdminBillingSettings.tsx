import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";

type BillingSettings = {
  referral_discount_percent: number;
  referrer_credit_reward: number;
  referee_credit_reward: number;
  razorpay_enabled: boolean;
  pro_monthly_inr_paise: number;
  enterprise_monthly_inr_paise: number;
  credits_50_inr_paise: number;
  credits_150_inr_paise: number;
  credits_500_inr_paise: number;
};

type ReconciliationIncident = {
  id: string;
  reason: string;
  provider: string;
  provider_order_id: string | null;
  payment_order_id: string | null;
  user_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export default function AdminBillingSettings() {
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<ReconciliationIncident[]>([]);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const loadIncidents = useCallback(async () => {
    const { data, error } = await supabase
      .from("billing_reconciliation_incidents")
      .select(
        "id, reason, provider, provider_order_id, payment_order_id, user_id, created_at, resolved_at",
      )
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setIncidentsError(
        toAdminUserMessage(error, undefined, "AdminBillingSettings.incidents"),
      );
      setIncidents([]);
      return;
    }
    setIncidentsError(null);
    setIncidents((data ?? []) as ReconciliationIncident[]);
  }, []);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase
        .from("billing_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) {
        setLoadError(toAdminUserMessage(error, undefined, "AdminBillingSettings.load"));
      } else if (data) {
        setSettings({
          referral_discount_percent: data.referral_discount_percent,
          referrer_credit_reward: data.referrer_credit_reward,
          referee_credit_reward: data.referee_credit_reward,
          razorpay_enabled: data.razorpay_enabled,
          pro_monthly_inr_paise: data.pro_monthly_inr_paise,
          enterprise_monthly_inr_paise: data.enterprise_monthly_inr_paise,
          credits_50_inr_paise: data.credits_50_inr_paise,
          credits_150_inr_paise: data.credits_150_inr_paise,
          credits_500_inr_paise: data.credits_500_inr_paise,
        });
      } else {
        setLoadError("Billing settings are unavailable.");
      }
    })();
    void loadIncidents();
  }, [loadIncidents]);

  async function save() {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("billing_settings")
      .upsert({ id: 1, ...settings, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) {
      const { adminActionFailedMessage } = await import("@/lib/admin/adminErrors");
      toast.error(adminActionFailedMessage(error, "AdminBillingSettings"));
    } else {
      const { writeAdminAudit } = await import("@/lib/admin/writeAdminAudit");
      await writeAdminAudit({
        action: "update",
        targetType: "billing_settings",
        targetId: "1",
        newValue: {
          referral_discount_percent: settings.referral_discount_percent,
          razorpay_enabled: settings.razorpay_enabled,
        },
      });
      toast.success("Billing settings saved");
    }
  }

  async function resolveIncident(id: string) {
    setResolvingId(id);
    const { error } = await supabase
      .from("billing_reconciliation_incidents")
      .update({ resolved_at: new Date().toISOString() })
      .eq("id", id);
    setResolvingId(null);
    if (error) {
      const { adminActionFailedMessage } = await import("@/lib/admin/adminErrors");
      toast.error(adminActionFailedMessage(error, "AdminBillingSettings.resolve"));
      return;
    }
    const { writeAdminAudit } = await import("@/lib/admin/writeAdminAudit");
    await writeAdminAudit({
      action: "update",
      targetType: "billing_reconciliation_incidents",
      targetId: id,
      newValue: { resolved_at: "now" },
    });
    toast.success("Incident marked resolved");
    void loadIncidents();
  }

  function field(
    label: string,
    key: keyof BillingSettings,
    type: "number" | "checkbox" = "number",
  ) {
    if (!settings) return null;
    if (type === "checkbox") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(settings[key])}
            onChange={(e) =>
              setSettings((s) => ({ ...s!, [key]: e.target.checked }))
            }
          />
          {label}
        </label>
      );
    }
    return (
      <label className="block text-sm space-y-1">
        <span className="text-muted-foreground">{label}</span>
        <input
          type="number"
          className="w-full rounded-lg border border-border bg-background px-3 py-2"
          value={settings[key] as number}
          onChange={(e) =>
            setSettings((s) => ({ ...s!, [key]: Number(e.target.value) }))
          }
        />
      </label>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Billing settings"
        description="Referral rewards, Razorpay pricing (INR paise), and open reconciliation incidents"
        icon={<Settings2 className="w-5 h-5 text-red-400" />}
      />

      {loadError && <InlineErrorRetry message={loadError} onRetry={() => window.location.reload()} />}
      {!settings && !loadError && <p className="text-sm text-muted-foreground">Loading billing settings…</p>}
      {settings && (
        <>
          <Card className="p-4 space-y-4">
            <h3 className="font-semibold text-sm">Referral program</h3>
            {field("Referral discount on first purchase (%)", "referral_discount_percent")}
            {field("Credits for referrer", "referrer_credit_reward")}
            {field("Credits for new user", "referee_credit_reward")}
          </Card>

          <Card className="p-4 space-y-4">
            <h3 className="font-semibold text-sm">Credits & payments</h3>
            {field("Razorpay enabled", "razorpay_enabled", "checkbox")}
            {field("Pro one-time (paise)", "pro_monthly_inr_paise")}
            {field("Max one-time (paise)", "enterprise_monthly_inr_paise")}
            {field("50 credits pack (paise)", "credits_50_inr_paise")}
            {field("150 credits pack (paise)", "credits_150_inr_paise")}
            {field("500 credits pack (paise)", "credits_500_inr_paise")}
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save settings"}
            </Button>
          </Card>
        </>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-sm">Open reconciliation incidents</h3>
          <Button variant="outline" size="sm" onClick={() => void loadIncidents()}>
            Refresh
          </Button>
        </div>
        {incidentsError && (
          <InlineErrorRetry message={incidentsError} onRetry={() => void loadIncidents()} />
        )}
        {!incidentsError && incidents.length === 0 && (
          <p className="text-sm text-muted-foreground">No open incidents.</p>
        )}
        {incidents.length > 0 && (
          <ul className="space-y-3">
            {incidents.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm space-y-1"
              >
                <div className="font-medium">{row.reason}</div>
                <div className="text-xs text-muted-foreground">
                  {row.provider}
                  {row.provider_order_id ? ` · order ${row.provider_order_id}` : ""}
                  {" · "}
                  {new Date(row.created_at).toLocaleString()}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={resolvingId === row.id}
                  onClick={() => void resolveIncident(row.id)}
                >
                  {resolvingId === row.id ? "Resolving…" : "Mark resolved"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
