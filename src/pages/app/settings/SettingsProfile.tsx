// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  User, Camera, Save, CheckCircle,
  Briefcase, MapPin, Globe, RotateCcw, Mail, Lock, Eye, EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getPasswordStrength } from "@/lib/validators/emailValidator";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";

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
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);

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

  // Keep local form fields in sync when authStore profile updates (single source of truth).
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name ?? "");
    setBio(profile.bio ?? "");
    setLocation(profile.timezone ?? "");
    setWebsite(profile.website_url ?? "");
    setExperience(yearsToLabel(profile.experience_years));
    setTargetRole(profile.target_role ?? "");
    setAvatarUrl(profile.avatar_url ?? "");
  }, [
    profile?.id,
    profile?.full_name,
    profile?.bio,
    profile?.timezone,
    profile?.website_url,
    profile?.experience_years,
    profile?.target_role,
    profile?.avatar_url,
  ]);

  const [newEmail,       setNewEmail]       = useState("");
  const [emailPassword,  setEmailPassword]  = useState("");
  const [emailSaving,    setEmailSaving]    = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords,   setShowPasswords]   = useState(false);
  const [passwordSaving,  setPasswordSaving]  = useState(false);

  const passwordStrength = getPasswordStrength(newPassword);

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

  async function handleEmailChange() {
    if (!user) return;
    const trimmed = newEmail.trim();
    if (!trimmed || !trimmed.includes("@")) {
      toast.error("Enter a valid email address.");
      return;
    }
    if (!emailPassword) {
      toast.error("Enter your current password to confirm the email change.");
      return;
    }

    setEmailSaving(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email ?? "",
        password: emailPassword,
      });
      if (signInErr) throw new Error("Password confirmation failed.");

      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;

      toast.success("Verification email sent to your new address.");
      setNewEmail("");
      setEmailPassword("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update email.");
    } finally {
      setEmailSaving(false);
    }
  }

  async function handlePasswordChange() {
    if (!user) return;
    if (!currentPassword) {
      toast.error("Enter your current password.");
      return;
    }
    if (!passwordStrength.isAcceptable) {
      toast.error("Choose a stronger password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user.email ?? "",
        password: currentPassword,
      });
      if (signInErr) throw new Error("Current password is incorrect.");

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success("Password updated");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update password.");
    } finally {
      setPasswordSaving(false);
    }
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
    };

    try {
      await updateProfile(updates as any);
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
    <SettingsPageShell title="Profile">

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
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-primary hover:bg-primary rounded-xl flex items-center justify-center shadow-lg transition-colors"
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
            <Badge variant="primary" size="sm" className="mt-1.5">
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
          <Briefcase className="w-4 h-4 text-primary" />
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

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          Email address
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Current: {user?.email}
        </p>
        <div className="space-y-3 max-w-md">
          <Input
            label="New email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <Input
            label="Confirm with current password"
            type={showPasswords ? "text" : "password"}
            value={emailPassword}
            onChange={(e) => setEmailPassword(e.target.value)}
            placeholder="Current password"
          />
          <Button
            variant="secondary"
            size="sm"
            loading={emailSaving}
            onClick={handleEmailChange}
            disabled={!newEmail || !emailPassword}
          >
            Update email
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          Password
        </h3>
        <div className="space-y-3 max-w-md">
          <Input
            label="Current password"
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <div>
            <Input
              label="New password"
              type={showPasswords ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            {newPassword && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-1 flex-1 rounded-full",
                        i <= passwordStrength.score
                          ? passwordStrength.color === "red"
                            ? "bg-red-500"
                            : passwordStrength.color === "orange"
                              ? "bg-orange-400"
                              : passwordStrength.color === "yellow"
                                ? "bg-amber-400"
                                : passwordStrength.color === "blue"
                                  ? "bg-blue-400"
                                  : "bg-emerald-500"
                          : "bg-muted",
                      )}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Strength: {passwordStrength.label}
                </p>
              </div>
            )}
          </div>
          <Input
            label="Confirm new password"
            type={showPasswords ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPasswords((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPasswords ? "Hide passwords" : "Show passwords"}
          </button>
          <Button
            variant="secondary"
            size="sm"
            loading={passwordSaving}
            onClick={handlePasswordChange}
            disabled={!currentPassword || !newPassword || !confirmPassword}
          >
            Update password
          </Button>
        </div>
      </Card>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-1">Onboarding</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Re-run the setup wizard to update your role, preferences, or audio settings.
          Your existing profile data is preserved.
        </p>
        <Link
          to="/onboarding?rerun=1"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Re-run onboarding
        </Link>
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
    </SettingsPageShell>
  );
}
