import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Plus, Video, Clock, Users, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface Room {
  id: string;
  title: string;
  type: string;
  status: string;
  difficulty: string;
  duration_minutes: number;
  created_at: string;
}

export default function PracticeRooms() {
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("practice_rooms")
        .select("*")
        .eq("host_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setRooms((data as Room[]) ?? []);
      setLoading(false);
    })();
  }, [user?.id]);

  const filtered = rooms.filter(
    (r) =>
      !search ||
      r.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.type?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor: Record<string, string> = {
    completed: "text-emerald-500 bg-emerald-500/15",
    in_progress: "text-amber-500 bg-amber-500/15",
    scheduled: "text-blue-500 bg-blue-500/15",
  };

  return (
    <div>
      <PageHeader
        title="Practice Rooms"
        description="Your mock interview sessions"
        icon={<Video className="w-5 h-5 text-violet-400" />}
        actions={
          <Link to="/app/rooms/new">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              New Session
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="text-center py-12">
          <Video className="w-10 h-10 mx-auto text-muted-foreground opacity-40 mb-3" />
          <p className="text-foreground font-medium">No practice sessions yet</p>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            Start a mock interview to begin building your skills.
          </p>
          <Link to="/app/rooms/new">
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Start First Session
            </Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((room) => (
            <Link key={room.id} to={`/app/rooms/${room.id}/session`}>
              <Card className="hover:border-violet-500/30 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/15 flex-shrink-0">
                    <Video className="w-4 h-4 text-violet-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{room.title || "Practice Session"}</p>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-0.5">
                      <span className="capitalize">{room.type ?? "Behavioral"}</span>
                      {room.duration_minutes > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-3 h-3" /> {room.duration_minutes}m
                        </span>
                      )}
                      <span>{new Date(room.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  {room.status && (
                    <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", statusColor[room.status] ?? "text-muted-foreground bg-muted")}>
                      {room.status.replace("_", " ")}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
