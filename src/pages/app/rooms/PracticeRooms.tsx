// @ts-nocheck
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus, Video, Users, ChevronRight, Search, Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // RLS allows public rooms OR rooms hosted by user
      const { data } = await supabase
        .from("practice_rooms")
        .select("id, name, description, status, max_players, is_public, host_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!cancelled) {
        setRooms((data as Room[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
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
      <PageHeader
        title="Practice Rooms"
        subtitle="Join or host live mock interviews with other candidates"
        action={
          <Button as={Link} to="/app/rooms/new" variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
            New Room
          </Button>
        }
      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search rooms…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Card key={i} className="animate-pulse h-32" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <Video className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-foreground font-medium">No rooms yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create one to start practicing live.</p>
          <Button as={Link} to="/app/rooms/new" variant="primary" size="sm" className="mt-4">
            Create Room
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Link key={r.id} to={`/app/rooms/${r.id}/session`}>
              <Card className="hover:border-violet-500/40 transition cursor-pointer h-full">
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
