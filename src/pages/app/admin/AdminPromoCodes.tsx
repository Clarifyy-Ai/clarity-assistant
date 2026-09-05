import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { toast } from "sonner";
import { Plus, Tag, Percent, Gift, Hash } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage, toAdminUserMessage } from "@/lib/admin/adminErrors";
import { AdminStatGrid } from "@/components/admin/AdminStatGrid";

type PromoRow = Tables<"promo_codes">;

function parseBonusCredits(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  // Base-10 only so values like "0100" become 100, never octal / NaN → 0.
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export default function AdminPromoCodes() {
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("10");
  const [bonus, setBonus] = useState("0");
  const [maxRedemptions, setMaxRedemptions] = useState<string>("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);
  const cancelledRef = useRef(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (cancelledRef.current) return;
    if (error) {
      setLoadError(toAdminUserMessage(error, undefined, "AdminPromoCodes"));
      toast.error(toAdminUserMessage(error));
    } else setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    cancelledRef.current = false;
    void load();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  async function createPromo() {
    if (saving) return;
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast.error("Code must be at least 4 characters");
      return;
    }
    const discountNum = Number.parseInt(discount.trim(), 10);
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) {
      toast.error("Discount must be 0–100");
      return;
    }
    const bonusNum = parseBonusCredits(bonus);
    if (bonusNum === null) {
      toast.error("Bonus credits must be a whole number (e.g. 100 or 0100)");
      return;
    }
    const maxRaw = maxRedemptions.trim();
    const maxNum = maxRaw ? Number.parseInt(maxRaw, 10) : null;
    if (maxRaw && (!Number.isFinite(maxNum) || (maxNum as number) < 1)) {
      toast.error("Max redemptions must be a positive whole number");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("promo_codes")
        .insert({
          code: trimmed,
          discount_percent: discountNum,
          bonus_credits: bonusNum,
          applies_to: "all",
          is_active: true,
          max_redemptions: maxNum,
          valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        })
        .select("id, bonus_credits")
        .maybeSingle();
      if (error) {
        toast.error(adminActionFailedMessage(error));
        return;
      }
      if (data?.id) {
        await writeAdminAudit({
          action: "create",
          targetType: "promo_code",
          targetId: data.id,
          newValue: {
            code: trimmed,
            discount_percent: discountNum,
            bonus_credits: data.bonus_credits ?? bonusNum,
          },
        });
      }
      const stored = Number(data?.bonus_credits ?? bonusNum);
      toast.success(
        `Promo code created${stored > 0 ? ` (+${stored} bonus credits)` : ""}`,
      );
      setCode("");
      setBonus("0");
      setMaxRedemptions("");
      setValidUntil("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: PromoRow) {
    const next = !row.is_active;
    const { error } = await supabase
      .from("promo_codes")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) toast.error(adminActionFailedMessage(error));
    else {
      await writeAdminAudit({
        action: "update",
        targetType: "promo_code",
        targetId: row.id,
        oldValue: { is_active: row.is_active },
        newValue: { is_active: next },
      });
      void load();
    }
  }

  const promoDash = useMemo(() => {
    const now = Date.now();
    const active = rows.filter((r) => r.is_active && (!r.valid_until || new Date(r.valid_until).getTime() > now));
    const redemptions = rows.reduce((sum, r) => sum + Number(r.redemption_count ?? 0), 0);
    return { total: rows.length, active: active.length, redemptions };
  }, [rows]);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Promo codes"
        description="Manage checkout discounts and bonus credits. Active codes appear on the public landing, pricing, and gov exam pages."
        icon={<Tag className="w-5 h-5 text-red-400" />}
      />

      <AdminStatGrid
        loading={loading}
        columns={3}
        stats={[
          { id: "total", label: "Total codes", value: promoDash.total.toLocaleString(), icon: Hash },
          { id: "active", label: "Active", value: promoDash.active.toLocaleString(), variant: "success", icon: Percent },
          { id: "redemptions", label: "Redemptions", value: promoDash.redemptions.toLocaleString(), icon: Gift },
        ]}
      />

      {loadError && <InlineErrorRetry message={loadError} onRetry={() => void load()} />}

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Create offer</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            type="text"
            inputMode="numeric"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="% off"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
          />
          <input
            type="text"
            inputMode="numeric"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Bonus credits (e.g. 100)"
            value={bonus}
            onChange={(e) => setBonus(e.target.value)}
            aria-label="Bonus credits"
          />
          <input
            type="number"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Max redemptions (optional)"
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
          />
          <input
            type="date"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
          <Button
            onClick={() => void createPromo()}
            disabled={saving}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            {saving ? "Saving…" : "Add"}
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-3">Code</th>
              <th className="text-right p-3">% off</th>
              <th className="text-right p-3">Bonus credits</th>
              <th className="text-right p-3">Used</th>
              <th className="text-right p-3">Expires</th>
              <th className="text-right p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-muted-foreground">No promo codes yet</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="p-3 font-mono font-medium">{row.code}</td>
                  <td className="p-3 text-right">{row.discount_percent}%</td>
                  <td className="p-3 text-right font-mono">
                    {Number(row.bonus_credits ?? 0).toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    {row.redemption_count}
                    {row.max_redemptions != null ? ` / ${row.max_redemptions}` : ""}
                  </td>
                  <td className="p-3 text-right text-xs text-muted-foreground">
                    {row.valid_until ? new Date(row.valid_until).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => void toggleActive(row)}>
                      {row.is_active ? "Active" : "Off"}
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
