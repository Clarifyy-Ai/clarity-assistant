import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { practiceRoomsDB } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { Plus, Video, Users, ChevronRight, Search, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

interface Room {
  id: string;
  name: string;
  description: string | null;
  status: string;
  max_players: number;
  is_public: boolean;
  host_id: string;
  created_at: string;
}

export default function PracticeRooms() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function loadRooms() {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await practiceRoomsDB.listRecent(50);
      setRooms(data as Room[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load practice rooms.");
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user?.id) return;
    void loadRooms();
  }, [user?.id]);

  const filtered = rooms.filter(
    (r) => !search || r.name?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor: Record<string, string> = {
    completed: "text-emerald-500 bg-emerald-500/15",
    in_progress: "text-amber-500 bg-amber-500/15",
    waiting: "text-blue-500 bg-blue-500/15",
  };

  return (
    <div>
      <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
        <strong className="font-semibold">Practice rooms.</strong>{" "}
        Voice and video (WebRTC) is coming soon. Text-based practice rooms are available now.
      </div>

      <PageHeader
        title={PRODUCT_NAMES.groupPractice}
        subtitle="Coordinate practice sessions with other candidates (chat-based)"
        action={
          <Link to="/app/rooms/new">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              New Room
            </Button>
          </Link>
        }
      />

      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void loadRooms()} />
      )}

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rooms…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Video}
            title="No rooms yet"
            description="Create one to start practicing live with other candidates."
            actionLabel="Create Room"
            onAction={() => navigate("/app/rooms/new")}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Link key={r.id} to={`/app/rooms/${r.id}/session`}>
              <Card className="hover:border-primary/40 transition cursor-pointer h-full">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">{r.name}</h3>
                    {r.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{r.description}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full capitalize",
                    statusColor[r.status] ?? "bg-muted text-muted-foreground")}>
                    {r.status?.replace("_", " ")}
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground inline-flex items-center gap-1">
                    {r.is_public ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    {r.is_public ? "Public" : "Private"}
                  </span>
                  <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1 ml-auto">
                    <Users className="w-3 h-3" /> max {r.max_players}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
