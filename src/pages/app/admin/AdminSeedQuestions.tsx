// @ts-nocheck
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { Database, Upload, RefreshCw, Sparkles } from "lucide-react";
import ExcelImportTab from "@/pages/app/mock-test/ExcelImportTab";
import { cn } from "@/lib/utils";

interface BankStat {
  exam_type: string;
  total: number;
  verified: number;
  ai_generated: number;
  years: string[];
  subjects: string[];
}

export default function AdminSeedQuestions() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<BankStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void loadStats(); }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("questions")
        .select("exam_type, source, is_verified, subject, source_year");

      const map: Record<string, BankStat> = {};
      for (const q of (data ?? []) as any[]) {
        const et = q.exam_type ?? "CUSTOM";
        if (!map[et]) map[et] = { exam_type: et, total: 0, verified: 0, ai_generated: 0, years: [], subjects: [] };
        map[et].total++;
        if (q.is_verified) map[et].verified++;
        if (q.source === "AI_GENERATED") map[et].ai_generated++;
        if (q.source_year && !map[et].years.includes(String(q.source_year))) map[et].years.push(String(q.source_year));
        if (q.subject && !map[et].subjects.includes(q.subject)) map[et].subjects.push(q.subject);
      }
      setStats(Object.values(map).sort((a, b) => b.total - a.total));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Seed Questions" description="Import questions and manage the question bank." />

      {/* Excel Import */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-5 w-5 text-violet-400" />
            <h3 className="font-semibold text-foreground">Bulk Excel Import</h3>
          </div>
          <ExcelImportTab onImported={() => void loadStats()} />
        </CardContent>
      </Card>

      {/* Question Bank Status */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-violet-400" />
              <h3 className="font-semibold text-foreground">Question Bank Status</h3>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadStats()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-xl bg-muted/20 animate-pulse" />)}
            </div>
          ) : stats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No questions in the bank yet. Import some above!</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Exam Type</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Verified</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">AI Gen</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Years</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Subjects</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.exam_type} className="border-b border-border/50 hover:bg-muted/10">
                      <td className="px-3 py-2 font-medium text-foreground">{s.exam_type.replace(/_/g, " ")}</td>
                      <td className="px-3 py-2 text-right font-bold text-foreground">{s.total}</td>
                      <td className="px-3 py-2 text-right text-green-400">{s.verified}</td>
                      <td className="px-3 py-2 text-right text-amber-400 flex items-center justify-end gap-1">
                        {s.ai_generated > 0 && <Sparkles className="h-3 w-3" />}
                        {s.ai_generated}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s.years.sort().join(", ") || "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{s.subjects.join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}