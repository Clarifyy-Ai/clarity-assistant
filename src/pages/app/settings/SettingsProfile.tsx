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

// ─────────────────────────────────────────────────────────────────
// SettingsProfile — edit name, avatar, role, bio
// ─────────────────────────────────────────────────────────────────

const EXPERIENCE_LEVELS = [
  "Student", "0–1 years", "1–3 years",
  "3–5 years", "5–10 years", "10+ years",
];

const TARGET_ROLES = [
  "Software Engineer", "Product Manager", "Data Scientist",
  "UX Designer", "Marketing", "Finance", "Operations", "Other",
];

export default function SettingsProfile() {
  const { profile, user, setProfile } = useAuthStore();

  const [name,       setName]       = useState(profile?.full_name ?? "");
  const [bio,        setBio]        = useState(profile?.bio ?? "");
  const [location,   setLocation]   = useState(profile?.location ?? "");
  const [website,    setWebsite]    = useState(profile?.website ?? "");
  const [experience, setExperience] = useState(profile?.experience_level ?? "");
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

    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
    }
    setUploading(false);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);

    const updates = {
      full_name:        name.trim(),
      bio:              bio.trim(),
      location:         location.trim(),
      website:          website.trim(),
      experience_level: experience,
      target_role:      targetRole,
      avatar_url:       avatarUrl,
      updated_at:       new Date().toISOString(),
    };

    await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    setProfile({ ...profile, ...updates } as any);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white">Profile</h2>

      {/* Avatar */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">Profile picture</h3>
        <div className="flex items-center gap-5">
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name}
                className="w-16 h-16 rounded-2xl object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/40 to-blue-600/40 border border-white/10 flex items-center justify-center text-xl font-black text-white">
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
                : <Camera className="w-3.5 h-3.5 text-white" />
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
            <p className="text-sm text-white font-medium">{name || "Your name"}</p>
            <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
            <Badge variant="violet" size="sm" className="mt-1.5">
              {profile?.plan ?? "free"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Basic info */}
      <Card>
        <h3 className="text-sm font-semibold text-white mb-4">Basic info</h3>
        <div className="space-y-4">
          <Input
            label="Full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
          <div>
            <p className="text-xs font-medium text-gray-300 mb-1.5">Bio</p>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="A short bio about your background…"
              rows={3}
              maxLength={280}
              className="w-full bg-black/30 border border-white/10 text-white placeholder-gray-600 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-violet-500"
            />
            <p className="text-[10px] text-gray-600 text-right mt-1">
              {bio.length}/280
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
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
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Briefcase className="w-4 h-4 text-violet-400" />
          Career info
        </h3>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">
              Experience level
            </p>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setExperience(lvl)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl border text-xs font-medium transition-all",
                    experience === lvl
                      ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                      : "bg-white/3 border-white/10 text-gray-500 hover:text-gray-300"
                  )}
                >
                  {lvl}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-300 mb-2">
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
                      ? "bg-violet-600/20 border-violet-500/30 text-violet-300"
                      : "bg-white/3 border-white/10 text-gray-500 hover:text-gray-300"
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
