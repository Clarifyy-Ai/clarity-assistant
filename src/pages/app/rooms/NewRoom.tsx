// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Video, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function NewRoom() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!user?.id) return;
    if (!name.trim()) {
      toast.error("Please give the room a name");
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from("practice_rooms")
        .insert({
          host_id: user.id,
          name: name.trim(),
          description: description.trim() || null,
          status: "waiting",
          max_players: maxPlayers,
          is_public: isPublic,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Auto-join the host as a participant
      await supabase.from("room_participants").insert({
        room_id: data.id,
        user_id: user.id,
        role: "host",
      });

      toast.success("Room created!");
      navigate(`/app/rooms/${data.id}/session`);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to create room");
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Practice Room"
        subtitle="Host a live mock interview session"
        icon={<Video className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Practice Rooms", href: "/app/rooms" },
          { label: "New Room" },
        ]}
      />

      <div className="max-w-2xl space-y-4">
        <Card>
          <label className="block text-sm font-semibold text-foreground mb-1.5">Room name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Frontend Interview Prep"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
          <label className="block text-sm font-semibold text-foreground mb-1.5 mt-4">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will you practice?"
            rows={3}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Visibility</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: true, label: "Public", icon: Globe, desc: "Anyone can join" },
              { value: false, label: "Private", icon: Lock, desc: "Invite only" },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setIsPublic(opt.value)}
                className={cn(
                  "p-3 rounded-xl border text-left transition",
                  isPublic === opt.value
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-border hover:border-border/80"
                )}
              >
                <opt.icon className="w-4 h-4 mb-1 text-violet-400" />
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Max participants: {maxPlayers}
          </label>
          <input
            type="range"
            min={2}
            max={6}
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            className="w-full"
          />
        </Card>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={() => navigate("/app/rooms")}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} loading={creating}>
            Create Room
          </Button>
        </div>
      </div>
    </div>
  );
}
