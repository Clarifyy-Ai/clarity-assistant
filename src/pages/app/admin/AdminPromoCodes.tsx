import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { toast } from "sonner";
import { Plus, Tag } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

type PromoRow = Tables<"promo_codes">;

export default function AdminPromoCodes() {
  const [rows, setRows] = useState<PromoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState(10);
  const [bonus, setBonus] = useState(0);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createPromo() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      toast.error("Code must be at least 4 characters");
      return;
    }
    const { error } = await supabase.from("promo_codes").insert({
      code: trimmed,
      discount_percent: discount,
      bonus_credits: bonus,
      applies_to: "all",
      is_active: true,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Promo code created");
      setCode("");
      void load();
    }
  }

  async function toggleActive(row: PromoRow) {
    const { error } = await supabase
      .from("promo_codes")
      .update({ is_active: !row.is_active, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else void load();
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Promo codes"
        description="Manage checkout discounts and bonus credits"
        icon={<Tag className="w-5 h-5 text-red-400" />}
      />

      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Create offer</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="CODE"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <input
            type="number"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="% off"
            value={discount}
            onChange={(e) => setDiscount(Number(e.target.value))}
          />
          <input
            type="number"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="Bonus credits"
            value={bonus}
            onChange={(e) => setBonus(Number(e.target.value))}
          />
          <Button onClick={() => void createPromo()} leftIcon={<Plus className="w-4 h-4" />}>
            Add
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/30 text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-3">Code</th>
              <th className="text-right p-3">% off</th>
              <th className="text-right p-3">Bonus cr</th>
              <th className="text-right p-3">Used</th>
              <th className="text-right p-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-4 text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-muted-foreground">No promo codes yet</td></tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-border/60">
                  <td className="p-3 font-mono font-medium">{row.code}</td>
                  <td className="p-3 text-right">{row.discount_percent}%</td>
                  <td className="p-3 text-right">{row.bonus_credits}</td>
                  <td className="p-3 text-right">
                    {row.redemption_count}
                    {row.max_redemptions != null ? ` / ${row.max_redemptions}` : ""}
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
