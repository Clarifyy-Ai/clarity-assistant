import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

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

const defaults: BillingSettings = {
  referral_discount_percent: 50,
  referrer_credit_reward: 25,
  referee_credit_reward: 25,
  razorpay_enabled: true,
  pro_monthly_inr_paise: 249900,
  enterprise_monthly_inr_paise: 679900,
  credits_50_inr_paise: 69900,
  credits_150_inr_paise: 189900,
  credits_500_inr_paise: 599900,
};

export default function AdminBillingSettings() {
  const [settings, setSettings] = useState<BillingSettings>(defaults);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("billing_settings" as "profiles")
        .select("*")
        .eq("id", "1")
        .maybeSingle();
      if (data) setSettings({ ...defaults, ...(data as unknown as BillingSettings) });
    })();
  }, []);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("billing_settings" as "profiles")
      .upsert({ id: "1", ...settings, updated_at: new Date().toISOString() } as never);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Billing settings saved");
  }

  function field(
    label: string,
    key: keyof BillingSettings,
    type: "number" | "checkbox" = "number",
  ) {
    if (type === "checkbox") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(settings[key])}
            onChange={(e) =>
              setSettings((s) => ({ ...s, [key]: e.target.checked }))
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
            setSettings((s) => ({ ...s, [key]: Number(e.target.value) }))
          }
        />
      </label>
    );
  }

  return (
    <div className="space-y-6 max-w-xl">
      <PageHeader
        title="Billing settings"
        description="Referral rewards and Razorpay pricing (INR paise)"
        icon={<Settings2 className="w-5 h-5 text-red-400" />}
      />

      <Card className="p-4 space-y-4">
        <h3 className="font-semibold text-sm">Referral program</h3>
        {field("Referral discount on first purchase (%)", "referral_discount_percent")}
        {field("Credits for referrer", "referrer_credit_reward")}
        {field("Credits for new user", "referee_credit_reward")}
      </Card>

      <Card className="p-4 space-y-4">
        <h3 className="font-semibold text-sm">Credits & payments</h3>
        {field("Razorpay enabled", "razorpay_enabled", "checkbox")}
        {field("Pro monthly (paise)", "pro_monthly_inr_paise")}
        {field("Enterprise monthly (paise)", "enterprise_monthly_inr_paise")}
        {field("50 credits pack (paise)", "credits_50_inr_paise")}
        {field("150 credits pack (paise)", "credits_150_inr_paise")}
        {field("500 credits pack (paise)", "credits_500_inr_paise")}
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </Card>
    </div>
  );
}
