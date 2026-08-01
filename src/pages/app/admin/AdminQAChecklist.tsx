import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageStateLoading } from "@/components/common/PageStateLoading";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ClipboardCheck, Search } from "lucide-react";
import type { QaChecklistItem, QaPriority, QaStatus, QaStatusMap } from "@/types/qa.types";

const STATUS_OPTIONS: QaStatus[] = [
  "Not Tested",
  "Pass",
  "Fail",
  "Blocked",
  "N/A",
  "Implemented",
];

const PRIORITY_COLORS: Record<QaPriority, string> = {
  P0: "text-red-500 bg-red-500/10 border-red-500/30",
  P1: "text-orange-500 bg-orange-500/10 border-orange-500/30",
  P2: "text-blue-500 bg-blue-500/10 border-blue-500/30",
  P3: "text-muted-foreground bg-muted/40 border-border",
};

const STATUS_COLORS: Record<QaStatus, string> = {
  "Not Tested": "text-muted-foreground bg-muted/50 border-border",
  Pass: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
  Fail: "text-red-600 bg-red-500/10 border-red-500/30",
  Blocked: "text-orange-600 bg-orange-500/10 border-orange-500/30",
  "N/A": "text-primary bg-primary/10 border-primary/30",
  Implemented: "text-blue-600 bg-blue-500/10 border-blue-500/30",
};

function mergeStatuses(
  saved: QaStatusMap,
  seed: QaChecklistItem[],
): QaChecklistItem[] {
  return seed.map((item) => ({
    ...item,
    status: saved[item.id] ?? item.status,
  }));
}

export default function AdminQAChecklist() {
  const [savedStatuses, setSavedStatuses] = useLocalStorage<QaStatusMap>(
    "Clarify AI_qa_statuses",
    {}
  );
  const [seedData, setSeedData] = useState<QaChecklistItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tests, setTests] = useState<QaChecklistItem[]>([]);  const [search, setSearch] = useState("");
  const [filterSection, setFilterSection] = useState("All");
  const [filterPriority, setFilterPriority] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterPart, setFilterPart] = useState("All");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    import("@/data/qaChecklist.json")
      .then((mod) => {
        if (cancelled) return;
        const data = mod.default as QaChecklistItem[];
        setSeedData(data);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load QA checklist",
        );
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!seedData) return;
    setTests(mergeStatuses(savedStatuses, seedData));
  }, [savedStatuses, seedData]);

  const sections = useMemo(
    () =>
      seedData
        ? ["All", ...Array.from(new Set(seedData.map((t) => t.section)))]
        : ["All"],
    [seedData],
  );
  const parts = useMemo(
    () =>
      seedData
        ? ["All", ...Array.from(new Set(seedData.map((t) => t.part)))]
        : ["All"],
    [seedData],
  );
  const persistStatuses = useCallback(
    (updatedTests: QaChecklistItem[]) => {
      setSaving(true);
      const map: QaStatusMap = {};
      updatedTests.forEach((t) => {
        map[t.id] = t.status;
      });
      setSavedStatuses(map);
      window.setTimeout(() => setSaving(false), 400);
    },
    [setSavedStatuses]
  );

  const updateStatus = useCallback(
    (id: string, newStatus: QaStatus) => {
      setTests((prev) => {
        const updated = prev.map((t) =>
          t.id === id ? { ...t, status: newStatus } : t
        );
        persistStatuses(updated);
        return updated;
      });
    },
    [persistStatuses]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tests.filter((t) => {
      if (filterSection !== "All" && t.section !== filterSection) return false;
      if (filterPriority !== "All" && t.priority !== filterPriority) return false;
      if (filterStatus !== "All" && t.status !== filterStatus) return false;
      if (filterPart !== "All" && t.part !== filterPart) return false;
      if (
        q &&
        !t.test.toLowerCase().includes(q) &&
        !t.id.toLowerCase().includes(q) &&
        !t.subsection.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [tests, search, filterSection, filterPriority, filterStatus, filterPart]);

  const grouped = useMemo(() => {
    const g: Record<string, Record<string, QaChecklistItem[]>> = {};
    filtered.forEach((t) => {
      if (!g[t.section]) g[t.section] = {};
      if (!g[t.section][t.subsection]) g[t.section][t.subsection] = [];
      g[t.section][t.subsection].push(t);
    });
    return g;
  }, [filtered]);

  const stats = useMemo(() => {
    const s: Record<string, number> = { total: tests.length };
    STATUS_OPTIONS.forEach((status) => {
      s[status] = 0;
    });
    tests.forEach((t) => {
      s[t.status] = (s[t.status] ?? 0) + 1;
    });
    return s;
  }, [tests]);

  const coverage =
    stats.total > 0
      ? Math.round(
          (((stats.Pass ?? 0) + (stats.Implemented ?? 0)) / stats.total) * 100,
        )
      : 0;

  const sectionCount = useMemo(
    () => (seedData ? new Set(seedData.map((t) => t.section)).size : 0),
    [seedData],
  );
  const toggleSection = (key: string) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    Object.keys(grouped).forEach((s) => {
      all[s] = true;
    });
    setExpandedSections(all);
  };

  const collapseAll = () => setExpandedSections({});

  if (loadError) {
    return (
      <div data-testid="admin-qa-checklist">
        <InlineErrorRetry
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            setSeedData(null);
            import("@/data/qaChecklist.json")
              .then((mod) => {
                const data = mod.default as QaChecklistItem[];
                setSeedData(data);
                setTests(mergeStatuses(savedStatuses, data));
              })
              .catch((err: unknown) => {
                setLoadError(
                  err instanceof Error ? err.message : "Failed to load QA checklist",
                );
              });
          }}
        />
      </div>
    );
  }

  if (!seedData) {
    return (
      <div data-testid="admin-qa-checklist">
        <PageStateLoading message="Loading QA checklist…" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl" data-testid="admin-qa-checklist">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-red-400" />
            <h1 className="text-xl font-bold text-foreground">Master QA Checklist</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {stats.total} test cases across {sectionCount} sections
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5 max-w-xl">
            Statuses are stored in this browser only (localStorage) — not shared across admins or devices.
          </p>
        </div>
        <div className="text-xs text-muted-foreground">
          {saving ? (
            <span className="text-indigo-400">Saving…</span>
          ) : (
            <span className="text-emerald-500">Saved locally (this browser)</span>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold">Coverage</CardTitle>
            <span className="text-lg font-bold text-indigo-400">{coverage}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
              style={{ width: `${coverage}%` }}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 pt-0">
          {STATUS_OPTIONS.map((status) => (
            <div key={status} className="flex items-center gap-2 text-xs">
              <Badge variant="outline" className={cn("font-normal", STATUS_COLORS[status])}>
                {status}
              </Badge>
              <span className="font-semibold tabular-nums">{stats[status] ?? 0}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tests, IDs, subsections…"
              className="pl-8 h-9 text-sm"
            />
          </div>

          {[
            { label: "Part", value: filterPart, set: setFilterPart, opts: parts },
            { label: "Section", value: filterSection, set: setFilterSection, opts: sections },
            {
              label: "Priority",
              value: filterPriority,
              set: setFilterPriority,
              opts: ["All", "P0", "P1", "P2", "P3"],
            },
            {
              label: "Status",
              value: filterStatus,
              set: setFilterStatus,
              opts: ["All", ...STATUS_OPTIONS],
            },
          ].map(({ label, value, set, opts }) => (
            <Select key={label} value={value} onValueChange={set}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder={label} />
              </SelectTrigger>
              <SelectContent>
                {opts.map((o) => (
                  <SelectItem key={o} value={o} className="text-xs">
                    {o === "All" ? `All ${label}s` : o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={expandAll} className="text-xs h-8">
              Expand all
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} className="text-xs h-8">
              Collapse all
            </Button>
          </div>

          <span className="text-xs text-muted-foreground w-full sm:w-auto">
            {filtered.length} tests shown
          </span>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {Object.entries(grouped).map(([section, subsections]) => {
          const isOpen = expandedSections[section] !== false;
          const sectionTests = Object.values(subsections).flat();
          const sectionPass = sectionTests.filter(
            (t) => t.status === "Pass" || t.status === "Implemented"
          ).length;
          const sectionCov = Math.round((sectionPass / sectionTests.length) * 100);

          return (
            <Card key={section} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection(section)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/5 transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-indigo-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-indigo-400 shrink-0" />
                )}
                <span className="font-semibold text-sm flex-1">{section}</span>
                <span className="text-xs text-muted-foreground">{sectionTests.length} tests</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs tabular-nums",
                    sectionCov === 100
                      ? "text-emerald-500 border-emerald-500/30"
                      : "text-indigo-400 border-indigo-500/30"
                  )}
                >
                  {sectionCov}% done
                </Badge>
              </button>

              {isOpen &&
                Object.entries(subsections).map(([sub, subTests]) => (
                  <div key={sub}>
                    <div className="px-4 py-2 pl-10 bg-muted/30 border-y border-border/50">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400">
                        {sub}
                      </span>
                      <span className="text-[11px] text-muted-foreground ml-2">
                        {subTests.length} tests
                      </span>
                    </div>
                    {subTests.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-wrap items-center gap-2 px-4 py-2.5 pl-10 border-b border-border/30 last:border-0 hover:bg-accent/5"
                      >
                        <span className="text-[11px] font-mono text-muted-foreground min-w-[68px]">
                          {t.id}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] px-1.5 py-0", PRIORITY_COLORS[t.priority])}
                        >
                          {t.priority}
                        </Badge>
                        <span className="flex-1 text-sm text-foreground/90 min-w-[200px]">
                          {t.test}
                        </span>
                        <Select
                          value={t.status}
                          onValueChange={(v) => updateStatus(t.id, v as QaStatus)}
                        >
                          <SelectTrigger
                            className={cn(
                              "w-[130px] h-8 text-xs font-semibold border",
                              STATUS_COLORS[t.status]
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {s}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                ))}
            </Card>
          );
        })}

        {Object.keys(grouped).length === 0 && (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No tests match your filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
