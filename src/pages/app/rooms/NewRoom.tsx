// @ts-nocheck
// src/pages/app/rooms/NewRoom.tsx — PRODUCTION FIXED
// Fixes (F4 - UI):
// - Replaced raw supabase.from("practice_rooms").insert() with useRoom().createRoom()
//   so all F4 guards (requireUserId, participant insert, rollback) apply automatically
// - Removed duplicate raw room_participants insert (now handled atomically in hook)
// - max_players → max_participants (correct schema column name)
// - role: "host" → "interviewer" (valid room_participants.role enum value)
// - Added interviewType selector (was missing — createRoom() requires it)
// - Error from createRoom() surfaced via toast.error with actual message
// - navigate() only called on confirmed success (was called before checking error)

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { useRoom } from "@/hooks/useRoom";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Video, Globe, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ✅ FIX: Interview type is a required field in createRoom — was entirely missing
// from the original form, causing the hook to receive undefined for interview_type.
const INTERVIEW_TYPES = [
  { value: "behavioral",   label: "Behavioral"   },
  { value: "technical",    label: "Technical"    },
  { value: "system_design",label: "System Design"},
  { value: "hr",           label: "HR / Culture" },
  { value: "mixed",        label: "Mixed"        },
];

export default function NewRoom() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // ✅ FIX: Use the hook instead of raw supabase calls — all guards apply
  const { createRoom } = useRoom();

  const [name,          setName]          = useState("");
  const [description,   setDescription]   = useState("");
  const [interviewType, setInterviewType] = useState("behavioral");
  const [maxParticipants, setMaxParticipants] = useState(2);
  const [isPublic,      setIsPublic]      = useState(true);
  const [creating,      setCreating]      = useState(false);

  async function handleCreate() {
    // ✅ FIX: Early UI guard — hook also guards, but this gives instant feedback
    if (!user?.id) {
      toast.error("Please sign in to create a room.");
      return;
    }
    if (!name.trim()) {
      toast.error("Please give the room a name.");
      return;
    }

    setCreating(true);
    try {
      // ✅ FIX: createRoom() handles:
      //   - requireUserId() guard (throws if auth not hydrated)
      //   - room insert
      //   - host participant insert (with rollback if it fails)
      //   - duplicate participant guard on rejoin
      const { roomId, error } = await createRoom({
        name:            name.trim(),
        interviewType,                      // ✅ was missing
        maxParticipants,                    // ✅ was max_players (wrong column)
        isPublic,
      });

      if (error) {
        // ✅ FIX: Surface the actual error (RLS denial, auth failure, etc.)
        // Previously any error was shown as a generic "Failed to create room"
        toast.error(error);
        return;
      }

      if (!roomId) {
        toast.error("Room creation failed — no room ID returned.");
        return;
      }

      toast.success("Room created!");
      // ✅ FIX: navigate() is only called after confirmed success
      navigate(`/app/rooms/${roomId}/session`);
    } catch (e: any) {
      // Catches unexpected throws (network errors, etc.) from the hook
      toast.error(e?.message ?? "Failed to create room");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="New Practice Room"
        subtitle="Host a live mock interview session"
        icon={<Video className="w-5 h-5 text-violet-400" aria-hidden="true" />}
        breadcrumbs={[
          { label: "Practice Rooms", href: "/app/rooms" },
          { label: "New Room" },
        ]}
      />

      <div className="max-w-2xl space-y-4">
        {/* Room name + description */}
        <Card>
          <label
            htmlFor="room-name"
            className="block text-sm font-semibold text-foreground mb-1.5"
          >
            Room name
          </label>
          <input
            id="room-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Frontend Interview Prep"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />

          <label
            htmlFor="room-description"
            className="block text-sm font-semibold text-foreground mb-1.5 mt-4"
          >
            Description <span className="font-normal text-muted-foreground">(optional)</span>
          </label>
          <textarea
            id="room-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What will you practice?"
            rows={3}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </Card>

        {/* ✅ NEW: Interview type selector — was entirely missing */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Interview type</h3>
          <div className="flex flex-wrap gap-2">
            {INTERVIEW_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setInterviewType(t.value)}
                aria-pressed={interviewType === t.value}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                  interviewType === t.value
                    ? "border-violet-500/50 bg-violet-500/10 text-violet-400"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        {/* Visibility */}
        <Card>
          <h3 className="text-sm font-semibold text-foreground mb-3">Visibility</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: true,  label: "Public",  icon: Globe, desc: "Anyone can join" },
              { value: false, label: "Private", icon: Lock,  desc: "Invite only"     },
            ].map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setIsPublic(opt.value)}
                aria-pressed={isPublic === opt.value}
                className={cn(
                  "p-3 rounded-xl border text-left transition",
                  isPublic === opt.value
                    ? "border-violet-500/50 bg-violet-500/5"
                    : "border-border hover:border-border/80",
                )}
              >
                <opt.icon className="w-4 h-4 mb-1 text-violet-400" aria-hidden="true" />
                <p className="text-sm font-medium text-foreground">{opt.label}</p>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            ))}
          </div>
        </Card>

        {/* Max participants */}
        <Card>
          <label
            htmlFor="max-participants"
            className="block text-sm font-semibold text-foreground mb-2"
          >
            Max participants: {maxParticipants}
          </label>
          <input
            id="max-participants"
            type="range"
            min={2}
            max={6}
            value={maxParticipants}
            onChange={(e) => setMaxParticipants(Number(e.target.value))}
            className="w-full"
            aria-label={`Max participants: ${maxParticipants}`}
          />
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>2</span>
            <span>6</span>
          </div>
        </Card>

        <div className="flex gap-2 justify-end">
          <Button
            variant="ghost"
            onClick={() => navigate("/app/rooms")}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            loading={creating}
            disabled={creating || !name.trim()}
          >
            Create Room
          </Button>
        </div>
      </div>
    </div>
  );
}
