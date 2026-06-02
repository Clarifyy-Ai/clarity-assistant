import { useState, useEffect } from "react";
import { featureFlagsDB } from "@/lib/supabase/database";
import { useGlobalStore }       from "@/store";
import { FEATURE_PLAN_GATES }   from "@/lib/constants/features";

import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/Card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge }    from "@/components/ui/Badge";
import { Switch }   from "@/components/ui/switch";
import { Button }   from "@/components/ui/Button";
import { Input }    from "@/components/ui/Input";
import { toast }    from "sonner";
import {
  Flag, Search, RotateCcw, Save, ShieldCheck, Beaker, Lock,
} from "lucide-react";

import type { FeatureFlagId, PlanId } from "@/types";

interface FlagRow {
  id:      FeatureFlagId;
  minPlan: PlanId;
  category: string;
  isBeta:  boolean;
  enabled: boolean;
}

const PLAN_ORDER: PlanId[] = ["free", "starter", "pro", "elite", "enterprise"];

const PLAN_COLORS: Record<PlanId, string> = {
  free:       "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  starter:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  pro:        "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  elite:      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  enterprise: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const CATEGORIES: Record<string, FeatureFlagId[]> = {
  "Core AI":     ["live_assist", "mock_sessions", "ai_coach", "star_builder", "rephraser"],
  "Advanced AI": ["company_research", "coding_hints", "system_design", "session_debrief", "resume_analysis", "beta_models"],
  "Audio":       ["audio_analysis", "filler_detection", "wpm_tracking", "diarization"],
  "Overlay":     ["overlay", "stealth_mode", "screenshot_capture"],
  "Data":        ["answer_bank", "analytics", "calendar_sync"],
  "Access":      ["byok", "priority_support", "coach_sessions"],
  "Dev":         ["experimental_ui", "debug_panel"],
};

function getCategoryForFlag(id: FeatureFlagId): string {
  return Object.entries(CATEGORIES).find(([, flags]) =>
    flags.includes(id)
  )?.[0] ?? "Other";
}

export default function AdminFeatureFlags() {
  const featureFlags = useGlobalStore((s) => s.featureFlags);

  const [rows,       setRows]       = useState<FlagRow[]>([]);
  const [dbFlags,    setDbFlags]    = useState<Record<string, boolean>>({});
  const [overrides,  setOverrides]  = useState<Partial<Record<FeatureFlagId, boolean>>>({});
  const [search,     setSearch]     = useState("");
  const [filterPlan, setFilterPlan] = useState<PlanId | "all">("all");
  const [filterCat,  setFilterCat]  = useState<string>("all");
  const [isDirty,        setIsDirty]        = useState(false);
  const [isSaving,       setIsSaving]       = useState(false);
  const [dbFlagsLoading, setDbFlagsLoading] = useState(true);
  const [dbFlagsError,   setDbFlagsError]   = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDbFlags() {
      setDbFlagsLoading(true);
      setDbFlagsError(null);

      try {
        const map = await featureFlagsDB.listKeyEnabled();
        if (cancelled) return;
        setDbFlags(map);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load feature flags from database";
        setDbFlagsError(message);
        console.error("[AdminFeatureFlags] load failed:", err);
        toast.error(message);
      } finally {
        if (!cancelled) setDbFlagsLoading(false);
      }
    }

    void loadDbFlags();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const built: FlagRow[] = Object.entries(FEATURE_PLAN_GATES ?? {}).map(
      ([id, minPlan]) => ({
        id:       id as FeatureFlagId,
        minPlan:  minPlan as PlanId,
        category: getCategoryForFlag(id as FeatureFlagId),
        isBeta:   id.includes("beta") || id.includes("experimental"),
        enabled:
          dbFlags[id] ??
          featureFlags[id as FeatureFlagId] ??
          false,
      })
    );
    setRows(built);
  }, [featureFlags, dbFlags]);

  const filtered = rows.filter((row) => {
    const matchSearch = search.trim() === "" ||
      row.id.toLowerCase().includes(search.toLowerCase());
    const matchPlan = filterPlan === "all" || row.minPlan === filterPlan;
    const matchCat  = filterCat  === "all" || row.category === filterCat;
    return matchSearch && matchPlan && matchCat;
  });

  const toggleFlag = (id: FeatureFlagId, current: boolean) => {
    setOverrides((prev) => ({ ...prev, [id]: !current }));
    setIsDirty(true);
  };

  const effectiveValue = (row: FlagRow): boolean =>
    overrides[row.id] !== undefined ? (overrides[row.id] as boolean) : row.enabled;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const entries = Object.entries(overrides) as [FeatureFlagId, boolean][];
      for (const [key, is_enabled] of entries) {
        await featureFlagsDB.upsertEnabled(key, is_enabled);
        setDbFlags((prev) => ({ ...prev, [key]: is_enabled }));
      }
      toast.success(`${entries.length} flag(s) saved to database.`);
      setOverrides({});
      setIsDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save flag overrides.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setOverrides({});
    setIsDirty(false);
    toast.info("Overrides discarded.");
  };

  const enabledCount  = rows.filter((r) => effectiveValue(r)).length;
  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Feature Flags</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Plan gates (client) plus global toggles saved to feature_flags.
          </p>
        </div>

        {isDirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Discard
            </Button>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {isSaving ? "Saving…" : `Save ${overrideCount} change${overrideCount !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )}
      </div>

      {dbFlagsError && (
        <p className="text-sm text-red-500 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          Database flags could not be loaded: {dbFlagsError}. Showing plan gates only until you refresh.
        </p>
      )}
      {dbFlagsLoading && !dbFlagsError && (
        <p className="text-xs text-muted-foreground">Loading database flag overrides…</p>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Flag className="h-3.5 w-3.5 text-primary" />
          <span><strong>{rows.length}</strong> total flags</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-green-500" />
          <span><strong>{enabledCount}</strong> enabled</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Beaker className="h-3.5 w-3.5 text-amber-500" />
          <span><strong>{rows.filter((r) => r.isBeta).length}</strong> beta</span>
        </div>
        {isDirty && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-orange-400 text-[11px] font-medium text-orange-600">
            {overrideCount} unsaved change{overrideCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search flags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        <Select value={filterPlan} onValueChange={(v) => setFilterPlan(v as PlanId | "all")}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="All plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {PLAN_ORDER.map((p) => (
              <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {Object.keys(CATEGORIES).map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Flags table */}
      <Card padding="none">
        <CardHeader className="px-5 pt-4">
          <CardTitle>All Flags</CardTitle>
          <CardDescription>{filtered.length} of {rows.length} shown</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead>Flag ID</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Min. Plan</TableHead>
                <TableHead>Plan Access</TableHead>
                <TableHead className="text-right">Enabled</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    No flags match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const value      = effectiveValue(row);
                  const isOverride = overrides[row.id] !== undefined;
                  const minIdx     = PLAN_ORDER.indexOf(row.minPlan);

                  return (
                    <TableRow
                      key={row.id}
                      className={isOverride ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}
                    >
                      <TableCell className="pr-0">
                        {row.isBeta
                          ? <Beaker className="h-3.5 w-3.5 text-amber-500" />
                          : row.minPlan === "enterprise"
                            ? <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
                            : null
                        }
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono text-foreground/80">{row.id}</code>
                          {isOverride && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded border border-orange-400 text-[10px] text-orange-600">
                              modified
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>

                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium capitalize ${PLAN_COLORS[row.minPlan]}`}>
                          {row.minPlan}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1">
                          {PLAN_ORDER.map((plan, idx) => (
                            <div
                              key={plan}
                              title={plan}
                              className={`h-2 w-2 rounded-full transition-colors ${
                                idx >= minIdx && value
                                  ? "bg-green-500"
                                  : "bg-muted"
                              }`}
                            />
                          ))}
                        </div>
                      </TableCell>

                      <TableCell className="text-right">
                        <Switch
                          checked={value}
                          onCheckedChange={() => toggleFlag(row.id, value)}
                          aria-label={`Toggle ${row.id}`}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
