import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import {
  sessionDebriefsDB,
  sessionsDB,
} from "@/lib/supabase/database";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { Input } from "@/components/ui/Input";
import {
  Brain, ChevronRight, AlertTriangle,
  CalendarDays, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { Tables } from "@/integrations/supabase";

type DebriefSummary = Pick<
  Tables<"session_debriefs">,
  "id" | "created_at" | "overall_grade" | "priority_focus" | "session_id"
>;

type SessionMeta = Pick<
  Tables<"sessions">,
  "id" | "overall_score" | "type" | "title" | "created_at"
>;

export default function Debrief() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [debriefs, setDebriefs] = useState<DebriefSummary[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionMeta>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchDebriefs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setFetchError(null);

    try {
      const debriefRows = await sessionDebriefsDB.listSummariesByUserId(user.id);
      if (!debriefRows.length) {
        setDebriefs([]);
        setSessions({});
        return;
      }

      const sessionIds = [
        ...new Set(
          debriefRows
            .map((d) => d.session_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      let sessionMap: Record<string, SessionMeta> = {};
      try {
        const sessionRows = await sessionsDB.listMetaByIds(sessionIds);
        sessionMap = Object.fromEntries(sessionRows.map((s) => [s.id, s]));
      } catch (sessErr) {
        console.warn("[Debrief] Failed to fetch sessions:", sessErr);
      }

      setDebriefs(debriefRows);
      setSessions(sessionMap);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load debriefs");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  const filteredDebriefs = search
    ? debriefs.filter((d) => {
        const q = search.toLowerCase();
        const sess = d.session_id ? sessions[d.session_id] ?? null : null;
        return (
          (sess?.type ?? "").toLowerCase().includes(q) ||
          (sess?.title ?? "").toLowerCase().includes(q) ||
          (d.priority_focus ?? "").toLowerCase().includes(q) ||
          (d.overall_grade ?? "").toLowerCase().includes(q)
        );
      })
    : debriefs;

  useEffect(() => {
    void fetchDebriefs();
  }, [fetchDebriefs]);

  const gradeColor = (g: string) => {
    if (!g) return "red";
    const base = g.charAt(0).toUpperCase();
    if (base === "A") return "emerald";
    if (base === "B") return "blue";
    if (base === "C") return "amber";
    return "red";
  };

  if (loading) {
    return (
      <PageContent className="space-y-5 max-w-3xl">
        <PageHeader
          title="Debriefs"
          subtitle="Deep-dive AI analysis of each session"
          breadcrumbs={[
            { label: "Dashboard", href: "/app/dashboard" },
            { label: "Debriefs" },
          ]}
        />
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </PageContent>
    );
  }

  return (
    <PageContent className="space-y-5 max-w-3xl">
      <PageHeader
        title="Debriefs"
        subtitle="Deep-dive AI analysis of each session"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Debriefs" },
        ]}
      />

      <Input
        placeholder="Search debriefs…"
        aria-label="Search debriefs"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search className="w-4 h-4" />}
        className="max-w-sm"
      />

      {fetchError && (
        <InlineErrorRetry
          message={fetchError}
          onRetry={() => void fetchDebriefs()}
        />
      )}

      {!fetchError && filteredDebriefs.length === 0 && (
        <Card>
          <EmptyState
            icon={Brain}
            title={search ? "No matching debriefs" : "No debriefs yet"}
            description={search ? `No debriefs match "${search}".` : "Complete a mock session to get your first AI debrief with grades, focus areas, and improvement tips."}
            actionLabel={search ? undefined : "Start mock session"}
            onAction={search ? undefined : () => navigate("/app/mock")}
          />
        </Card>
      )}

      {!fetchError && filteredDebriefs.length > 0 && (
        <div className="space-y-3">
          {filteredDebriefs.map((d) => {
            const sess = d.session_id ? sessions[d.session_id] ?? null : null;
            const gc = gradeColor(d.overall_grade ?? "");

            return (
              <Card
                key={d.id}
                hover
                onClick={() => navigate(`/app/debriefs/${d.id}`)}
              >
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-lg font-black border",
                    gc === "emerald" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                    gc === "blue"    ? "bg-blue-500/10 border-blue-500/20 text-blue-400"          :
                    gc === "amber"   ? "bg-amber-500/10 border-amber-500/20 text-amber-400"       :
                                       "bg-red-500/10 border-red-500/20 text-red-400"
                  )}>
                    {d.overall_grade ?? "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {sess?.type ?? "Session"} Interview
                        {sess?.title && ` — ${sess.title}`}
                      </p>
                      {sess?.overall_score != null && (
                        <Badge
                          variant={
                            sess.overall_score >= 75 ? "emerald" :
                            sess.overall_score >= 55 ? "amber"   : "red"
                          }
                          size="sm"
                        >
                          {sess.overall_score}/100
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      {format(new Date(d.created_at), "MMM d, yyyy · h:mm a")}
                    </p>

                    {d.priority_focus && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-300">
                          Focus: {d.priority_focus}
                        </p>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </PageContent>
  );
}
