// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState, useRef } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  User, Camera, Save, CheckCircle,
  Briefcase, MapPin, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// SettingsProfile — edit name, avatar, role, bio
// ─────────────────────────────────────────────────────────────────

const EXPERIENCE_LEVELS: { label: string; years: number }[] = [
  { label: "Student",     years: 0  },
  { label: "0–1 years",   years: 1  },
  { label: "1–3 years",   years: 2  },
  { label: "3–5 years",   years: 4  },
  { label: "5–10 years",  years: 7  },
  { label: "10+ years",   years: 10 },
];

function yearsToLabel(years: number | null | undefined): string {
  if (years == null) return "";
  // Find closest bucket
  return (
    EXPERIENCE_LEVELS.slice().reverse().find((l) => years >= l.years)?.label ?? ""
  );
}

const TARGET_ROLES = [
  "Software Engineer", "Product Manager", "Data Scientist",
  "UX Designer", "Marketing", "Finance", "Operations", "Other",
];

export default function SettingsProfile() {
  const { profile, user, setProfile } = useAuthStore();

  const [name,       setName]       = useState(profile?.full_name ?? "");
  const [bio,        setBio]        = useState(profile?.bio ?? "");
  const [location,   setLocation]   = useState(profile?.timezone ?? "");
  const [website,    setWebsite]    = useState(profile?.website_url ?? "");
  const [experience, setExperience] = useState<string>(yearsToLabel(profile?.experience_years));
  const [targetRole, setTargetRole] = useState(profile?.target_role ?? "");
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [avatarUrl,  setAvatarUrl]  = useState(profile?.avatar_url ?? "");
  const [uploading,  setUploading]  = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);

    const ext  = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (error) {
      toast.error("Failed to upload avatar. Please try again.");
    } else {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast.success("Avatar updated!");
    }
    setUploading(false);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);

    const yearsNum = EXPERIENCE_LEVELS.find((l) => l.label === experience)?.years ?? null;
    const updates: Record<string, unknown> = {
      full_name:        name.trim(),
      bio:              bio.trim(),
      timezone:         location.trim() || "UTC",
      website_url:      website.trim() || null,
      experience_years: yearsNum,
      target_role:      targetRole || null,
      avatar_url:       avatarUrl,
      updated_at:       new Date().toISOString(),
    };

    try {
      const { error } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (error) throw error;

      setProfile({ ...profile, ...updates } as any);
      setSaved(true);
      toast.success("Profile saved");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Profile</h2>

      {/* Avatar */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Profile picture</h3>
        <div className="flex items-center gap-5">
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="w-16 h-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 border border-border flex items-center justify-center text-xl font-black text-foreground">
                {initials || <User className="w-6 h-6" />}
              </div>
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-violet-600 hover:bg-violet-500 rounded-xl flex items-center justify-center shadow-lg transition-colors"
            >
              {uploading
                ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                : <Camera className="w-3.5 h-3.5 text-foreground" />
              }
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <div>
            <p className="text-sm text-foreground font-medium">{name || "Your name"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
            <Badge variant="violet" size="sm" className="mt-1.5">
              {profile?.plan_id ?? "free"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Basic info */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Basic info</h3>
        <div className="space-y-4">
          <Input
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
          <div>
            <p className="text-xs font-medium text-foreground mb-1.5">Bio</p>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short bio about your background…"
              rows={3}
              maxLength={280}
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
            <p className="text-[10px] text-muted-foreground text-right mt-1">
              {bio.length}/280
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. London, UK"
              leftIcon={<MapPin className="w-3.5 h-3.5" />}
            />
            <Input
              label="Website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
              leftIcon={<Globe className="w-3.5 h-3.5" />}
            />
          </div>
        </div>
      </Card>

      {/* Career info */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-violet-400" />
          Career info
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-foreground mb-2">
              Experience level
            </p>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_LEVELS.map((lvl) => (
                <button
                  key={lvl.label}
                  onClick={() => setExperience(lvl.label)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                    experience === lvl.label
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground mb-2">
              Target role
            </p>
            <div className="flex flex-wrap gap-2">
              {TARGET_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setTargetRole(role)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                    targetRole === role
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Button
        variant={saved ? "success" : "primary"}
        size="md"
        loading={saving}
        onClick={handleSave}
        leftIcon={saved
          ? <CheckCircle className="w-4 h-4" />
          : <Save className="w-4 h-4" />
        }
      >
        {saved ? "Saved!" : "Save changes"}
      </Button>
    </div>
  );
}
