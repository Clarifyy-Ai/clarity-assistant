// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { PlanGate } from "@/components/layout/PlanGate";
import {
  Users, Zap, Lock, ChevronRight,
  Mic, Globe, Clock, Star,
  Plus, Search, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// PracticeRooms — peer practice & community rooms
// ─────────────────────────────────────────────────────────────────

const ROOM_TYPES = [
  {
    id:    "solo_timed",
    icon:  "⏱️",
    label: "Solo Timed",
    desc:  "Practice alone with a live countdown and auto-feedback.",
    plan:  "free",
    color: "blue",
  },
  {
    id:    "peer_1v1",
    icon:  "🤝",
    label: "Peer 1-on-1",
    desc:  "Match with another user to practise as interviewer and interviewee.",
    plan:  "pro",
    color: "violet",
  },
  {
    id:    "ai_panel",
    icon:  "🤖",
    label: "AI Panel",
    desc:  "Face a simulated 3-person AI panel with different personas.",
    plan:  "pro",
    color: "emerald",
  },
  {
    id:    "group_debrief",
    icon:  "💬",
    label: "Group Debrief",
    desc:  "Join a live community debrief session hosted by a coach.",
    plan:  "pro",
    color: "amber",
  },
];

const SAMPLE_ROOMS = [
  {
    id:     "r1",
    type:   "peer_1v1",
    host:   "Alex M.",
    topic:  "Google SWE Behavioural",
    joined: 1,
    max:    2,
    live:   true,
    plan:   "pro",
  },
  {
    id:     "r2",
    type:   "ai_panel",
    host:   "System",
    topic:  "Product Manager System Design",
    joined: 0,
    max:    1,
    live:   false,
    plan:   "pro",
  },
  {
    id:     "r3",
    type:   "solo_timed",
    host:   "System",
    topic:  "Data Science Technical",
    joined: 0,
    max:    1,
    live:   false,
    plan:   "free",
  },
];

export default function PracticeRooms() {
  const navigate     = useNavigate();
  const { profile }  = useAuthStore();
  const isPro        = profile?.plan !== "free";

  const [createOpen, setCreateOpen] = useState(false);
  const [selected,   setSelected]   = useState<string | null>(null);

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Practice Rooms"
        subtitle="Solo, peer, and AI-panel sessions"
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateOpen(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Create room
          </Button>
        }
      />

      {/* Room type cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ROOM_TYPES.map((rt) => {
          const locked = rt.plan === "pro" && !isPro;
          return (
            <Card
              key={rt.id}
              hover={!locked}
              onClick={locked ? undefined : () => {
                if (rt.id === "solo_timed") navigate("/app/mock");
                else setCreateOpen(true);
              }}
              className={cn(
                "flex flex-col gap-2 relative",
                locked && "opacity-60 cursor-default"
              )}
              padding="sm"
            >
              {locked && (
                <Lock className="absolute top-3 right-3 w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="text-2xl">{rt.icon}</span>
              <p className="text-xs font-bold text-foreground">{rt.label}</p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {rt.desc}
              </p>
              {rt.plan === "pro" && (
                <Badge variant="amber" size="sm" className="w-fit">Pro</Badge>
              )}
            </Card>
          );
        })}
      </div>

      {/* Live + available rooms */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Available rooms
          </p>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium">
              {SAMPLE_ROOMS.filter((r) => r.live).length} live
            </span>
          </div>
        </div>

        <div className="space-y-2">
          {SAMPLE_ROOMS.map((room) => {
            const locked = room.plan === "pro" && !isPro;
            const full   = room.joined >= room.max;
            return (
              <Card
                key={room.id}
                hover={!locked && !full}
                onClick={locked || full ? undefined : () => navigate(`/app/rooms/${room.id}`)}
                className={cn(
                  "flex items-center gap-4",
                  (locked || full) && "opacity-60"
                )}
                padding="sm"
              >
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
                )}>
                  {ROOM_TYPES.find((r) => r.id === room.type)?.icon ?? "🎤"}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-foreground">{room.topic}</p>
                    {room.live && (
                      <Badge variant="red" size="sm" dot>Live</Badge>
                    )}
                    {room.plan === "pro" && !isPro && (
                      <Badge variant="amber" size="sm">Pro</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Hosted by {room.host} · {room.joined}/{room.max} joined
                  </p>
                </div>

                <Button
                  variant={full ? "ghost" : "secondary"}
                  size="xs"
                  disabled={locked || full}
                >
                  {full ? "Full" : locked ? "Upgrade" : "Join"}
                </Button>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Create room modal */}
      <CreateRoomModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        isPro={isPro}
        onCreated={(id) => navigate(`/app/rooms/${id}`)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CreateRoomModal
// ─────────────────────────────────────────────────────────────────

function CreateRoomModal({
  open, onClose, isPro, onCreated,
}: {
  open:      boolean;
  onClose:   () => void;
  isPro:     boolean;
  onCreated: (id: string) => void;
}) {
  const [type,    setType]    = useState("solo_timed");
  const [topic,   setTopic]   = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!topic.trim()) return;
    setLoading(true);
    // Simulate room creation
    await new Promise((r) => setTimeout(r, 800));
    onCreated(`new-${Date.now()}`);
    setLoading(false);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Create practice room" size="md">
      <div className="space-y-5">
        {/* Type picker */}
        <div>
          <p className="text-xs font-medium text-foreground mb-2">Room type</p>
          <div className="grid grid-cols-2 gap-2">
            {ROOM_TYPES.map((rt) => {
              const locked = rt.plan === "pro" && !isPro;
              return (
                <button
                  key={rt.id}
                  disabled={locked}
                  onClick={() => setType(rt.id)}
                  className={cn(
                    "flex items-center gap-2 p-3 rounded-xl border text-left transition-all",
                    type === rt.id
                      ? "bg-violet-600/20 border-violet-500/30"
                      : "bg-secondary border-border hover:border-primary/30",
                    locked && "opacity-50 cursor-default"
                  )}
                >
                  <span>{rt.icon}</span>
                  <div>
                    <p className="text-xs font-medium text-foreground">{rt.label}</p>
                    {locked && (
                      <p className="text-[10px] text-amber-400">Pro only</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Topic */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1.5">Room topic</p>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Google Behavioural · FAANG SWE"
            className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
          />
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            loading={loading}
            disabled={!topic.trim()}
            onClick={handleCreate}
          >
            Create room
          </Button>
        </div>
      </div>
    </Modal>
  );
}
