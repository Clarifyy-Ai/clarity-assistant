import { useState, useEffect, useMemo } from "react";
import { featureFlagsDB } from "@/lib/supabase/database";
import { useGlobalStore }       from "@/store";
import { FEATURE_FLAGS, FEATURE_PLAN_GATES, isKillOnlyFlag } from "@/lib/constants/features";
import { getPlanDisplayName, type DisplayTier } from "@/lib/constants/pricing";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";

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
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import { FEATURE_FLAGS_QUICK_LINKS } from "@/lib/admin/adminSectionNav";
import {
  Flag, Search, RotateCcw, Save, ShieldCheck, Beaker, Lock, ToggleRight, AlertTriangle,
} from "lucide-react";

import type { FeatureFlagId, PlanId } from "@/types";

interface FlagRow {
  id:      FeatureFlagId;
  minPlan: PlanId;
  category: string;
  isBeta:  boolean;
  enabled: boolean;
}

const PLAN_ORDER: DisplayTier[] = ["free", "pro", "enterprise"];

const PLAN_COLORS: Record<DisplayTier, string> = {
  free:       "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  pro:        "bg-primary/15 text-primary dark:bg-primary/20 dark:text-primary/80",
  enterprise: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

function launchPlanKey(plan: PlanId): DisplayTier {
  if (plan === "enterprise") return "enterprise";
  if (plan === "pro" || plan === "elite") return "pro";
  return "free";
}

const CATEGORIES: Record<string, FeatureFlagId[]> = {
  "Core AI":     ["live_assist", "mock_sessions", "ai_coach", "star_builder", "rephraser"],
  "Advanced AI": ["company_research", "coding_hints", "system_design", "session_debrief", "resume_analysis", "beta_models"],
  "Audio":       ["audio_analysis", "filler_detection", "wpm_tracking", "diarization"],
  "Overlay":     ["overlay", "screenshot_capture"],
  "Data":        ["answer_bank", "analytics", "calendar_sync"],
  // BYOK is retired — omit from Access so admins cannot advertise it as a product toggle.
  "Access":      ["priority_support", "coach_sessions"],
  "Dev":         ["experimental_ui", "debug_panel"],
};

function getCategoryForFlag(id: FeatureFlagId): string {
  return Object.entries(CATEGORIES).find(([, flags]) =>
    flags.includes(id)
  )?.[0] ?? "Other";
}

export default function AdminFeatureFlags() {
  const setFeatureKillSwitches = useGlobalStore((s) => s.setFeatureKillSwitches);

  const [rows,       setRows]       = useState<FlagRow[]>([]);
  const [dbFlags,    setDbFlags]    = useState<Record<string, boolean>>({});
  const [overrides,  setOverrides]  = useState<Partial<Record<FeatureFlagId, boolean>>>({});
  const [search,     setSearch]     = useState("");
  const [filterPlan, setFilterPlan] = useState<DisplayTier | "all">("all");
  const [filterCat,  setFilterCat]  = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "enabled" | "disabled" | "beta">("all");
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
        setFeatureKillSwitches(map);
      } catch (err) {
        if (cancelled) return;
        setDbFlagsError(toAdminUserMessage(err, undefined, "AdminFeatureFlags"));
        toast.error(toAdminUserMessage(err, undefined, "AdminFeatureFlags"));
      } finally {
        if (!cancelled) setDbFlagsLoading(false);
      }
    }

    void loadDbFlags();
    return () => {
      cancelled = true;
    };
  }, [setFeatureKillSwitches]);

  useEffect(() => {
    const built: FlagRow[] = Object.entries(FEATURE_PLAN_GATES ?? {})
      .filter(([id]) => id !== FEATURE_FLAGS.BYOK)
      .map(([id, minPlan]) => ({
        id:       id as FeatureFlagId,
        minPlan:  minPlan as PlanId,
        category: getCategoryForFlag(id as FeatureFlagId),
        isBeta:   id.includes("beta") || id.includes("experimental"),
        enabled: dbFlags[id] !== false,
      }));
    setRows(built);
  }, [dbFlags]);

  const effectiveValue = (row: FlagRow): boolean =>
    overrides[row.id] !== undefined ? (overrides[row.id] as boolean) : row.enabled;

  const filtered = rows.filter((row) => {
    const matchSearch = search.trim() === "" ||
      row.id.toLowerCase().includes(search.toLowerCase());
    const matchPlan = filterPlan === "all" || launchPlanKey(row.minPlan) === filterPlan;
    const matchCat  = filterCat  === "all" || row.category === filterCat;
    const enabled = effectiveValue(row);
    const matchVisibility =
      visibilityFilter === "all" ||
      (visibilityFilter === "enabled" && enabled) ||
      (visibilityFilter === "disabled" && !enabled) ||
      (visibilityFilter === "beta" && row.isBeta);
    return matchSearch && matchPlan && matchCat && matchVisibility;
  });

  const toggleFlag = (id: FeatureFlagId, current: boolean) => {
    setOverrides((prev) => ({ ...prev, [id]: !current }));
    setIsDirty(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const entries = Object.entries(overrides) as [FeatureFlagId, boolean][];
      for (const [key, is_enabled] of entries) {
        await featureFlagsDB.upsertEnabled(key, is_enabled);
        setDbFlags((prev) => ({ ...prev, [key]: is_enabled }));
        const { writeAdminAudit } = await import("@/lib/admin/writeAdminAudit");
        await writeAdminAudit({
          action: "feature_flag_update",
          targetType: "feature_flag",
          targetId: key,
          newValue: { is_enabled },
        });
      }
      const nextMap = { ...dbFlags };
      for (const [key, is_enabled] of entries) {
        nextMap[key] = is_enabled;
      }
      setFeatureKillSwitches(nextMap);
      toast.success(`${entries.length} flag(s) saved to database.`);
      setOverrides({});
      setIsDirty(false);
    } catch (err) {
      const { adminActionFailedMessage } = await import("@/lib/admin/adminErrors");
      toast.error(adminActionFailedMessage(err, "AdminFeatureFlags.save"));
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
  const betaCount = rows.filter((r) => r.isBeta).length;
  const disabledCount = rows.length - enabledCount;

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Feature Flags</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kill-switches saved to feature_flags. They cannot grant plan entitlements.
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

      <AdminSectionDashboard
        loading={dbFlagsLoading}
        columns={4}
        quickLinks={FEATURE_FLAGS_QUICK_LINKS}
        stats={[
          {
            id: "total",
            label: "Total flags",
            value: rows.length.toLocaleString(),
            icon: Flag,
            onClick: () => setVisibilityFilter("all"),
            active: visibilityFilter === "all",
          },
          {
            id: "enabled",
            label: "Enabled",
            value: enabledCount.toLocaleString(),
            variant: "success",
            icon: ToggleRight,
            onClick: () => setVisibilityFilter("enabled"),
            active: visibilityFilter === "enabled",
          },
          {
            id: "disabled",
            label: "Kill-switched",
            value: disabledCount.toLocaleString(),
            variant: disabledCount > 0 ? "danger" : "default",
            icon: Lock,
            onClick: () => setVisibilityFilter("disabled"),
            active: visibilityFilter === "disabled",
          },
          {
            id: "beta",
            label: "Beta flags",
            value: betaCount.toLocaleString(),
            icon: Beaker,
            onClick: () => setVisibilityFilter("beta"),
            active: visibilityFilter === "beta",
          },
        ]}
      />

      {overrideCount > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" />
          {overrideCount} unsaved override{overrideCount !== 1 ? "s" : ""} pending save
        </p>
      )}

      <div
        role="status"
        className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
      >
        Feature flags are kill-switches only. Turning a flag off hides it for
        everyone. Turning a flag on cannot grant Free/Pro/Max entitlements —
        paid features still require the matching plan.
      </div>

      {dbFlagsError && (
        <InlineErrorRetry
          message={`Database flags could not be loaded: ${dbFlagsError}. Showing plan gates only until you refresh.`}
          onRetry={() => window.location.reload()}
        />
      )}
      {dbFlagsLoading && !dbFlagsError && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
        </div>
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

        <Select value={filterPlan} onValueChange={(v) => setFilterPlan(v as DisplayTier | "all")}>
          <SelectTrigger className="w-[140px] h-8 text-sm">
            <SelectValue placeholder="All plans" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All plans</SelectItem>
            {PLAN_ORDER.map((p) => (
              <SelectItem key={p} value={p}>{getPlanDisplayName(p)}</SelectItem>
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
                  <TableCell colSpan={6}>
                    <EmptyState
                      icon={Flag}
                      title="No flags match your filters"
                      description="Try adjusting the search or filter criteria."
                      compact
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const value      = effectiveValue(row);
                  const isOverride = overrides[row.id] !== undefined;
                  const launchMin  = launchPlanKey(row.minPlan);
                  const minIdx     = PLAN_ORDER.indexOf(launchMin);
                  const killOnly   = isKillOnlyFlag(row.id);

                  return (
                    <TableRow
                      key={row.id}
                      className={isOverride ? "bg-amber-50/50 dark:bg-amber-900/10" : ""}
                    >
                      <TableCell className="pr-0">
                        {killOnly
                          ? <Lock className="h-3.5 w-3.5 text-muted-foreground/60" />
                          : row.isBeta
                            ? <Beaker className="h-3.5 w-3.5 text-amber-500" />
                            : row.minPlan === "enterprise"
                              ? <Lock className="h-3.5 w-3.5 text-muted-foreground/40" />
                              : null
                        }
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono text-foreground/80">{row.id}</code>
                          {killOnly && (
                            <Badge variant="outline" className="text-[10px] font-normal">
                              Kill-only · not launched
                            </Badge>
                          )}
                          {isOverride && (
                            <span className="inline-flex items-center px-1.5 py-0 rounded border border-orange-400 text-[10px] text-orange-600">
                              modified
                            </span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">{row.category}</TableCell>

                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${PLAN_COLORS[launchMin]}`}>
                          {getPlanDisplayName(launchMin)}
                        </span>
                      </TableCell>

                      <TableCell>
                        {killOnly ? (
                          <span className="text-[11px] text-muted-foreground">
                            Cannot grant
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            {PLAN_ORDER.map((plan, idx) => (
                              <div
                                key={plan}
                                title={getPlanDisplayName(plan)}
                                className={`h-2 w-2 rounded-full transition-colors ${
                                  idx >= minIdx && value
                                    ? "bg-green-500"
                                    : "bg-muted"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <Switch
                          checked={value}
                          onCheckedChange={() => toggleFlag(row.id, value)}
                          aria-label={
                            killOnly
                              ? `Kill-switch ${row.id} (cannot grant access)`
                              : `Toggle ${row.id}`
                          }
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
