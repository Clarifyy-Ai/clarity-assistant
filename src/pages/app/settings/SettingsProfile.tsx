// @ts-nocheck -- retained: notification_prefs and privacy_prefs JSONB column types not in Supabase generated schema; Toggle component uses Radix UI checked prop which TypeScript does not accept on the wrapper component type.
import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import { avatarStorage } from "@/lib/supabase/storage";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  User, Camera, Save, CheckCircle,
  Briefcase, Globe, RotateCcw, Mail, Lock, Eye, EyeOff,
} from "lucide-react";
import { cn, isValidUrl } from "@/lib/utils";
import { toast } from "sonner";
import { getPasswordStrength } from "@/lib/validators/emailValidator";
import { changePasswordSchema } from "@/lib/validators/authSchemas";
import { profileUpdateSchema } from "@/lib/validators/profileSchemas";
import { SettingsPageShell } from "@/components/layout/SettingsPageShell";
import { SettingsSaveBar } from "@/components/settings/SettingsSaveBar";

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!isValidUrl(candidate)) {
    throw new Error("Enter a valid website URL (e.g. https://example.com).");
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error("Website must use http or https.");
    }
    if (!u.hostname.includes(".")) {
      throw new Error("Enter a valid website URL (e.g. https://example.com).");
    }
  } catch (err) {
    if (err instanceof Error && /valid website|http or https/i.test(err.message)) throw err;
    throw new Error("Enter a valid website URL (e.g. https://example.com).");
  }
  return candidate;
}

const PROFILE_TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Australia/Sydney",
] as const;

const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

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
  const [timezone,   setTimezone]   = useState(profile?.timezone ?? "UTC");
  const [website,    setWebsite]    = useState(profile?.website_url ?? "");
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [nameTried,  setNameTried]  = useState(false);
  const [experience, setExperience] = useState<string>(yearsToLabel(profile?.experience_years));
  const [targetRole, setTargetRole] = useState(profile?.target_role ?? "");
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [avatarUrl,  setAvatarUrl]  = useState(profile?.avatar_url ?? "");
  const [uploading,  setUploading]  = useState(false);

  // Keep local form fields in sync when authStore profile updates (single source of truth).
  useEffect(() => {
    if (!profile) return;
    setName(profile.full_name ?? "");
    setBio(profile.bio ?? "");
    setTimezone(profile.timezone ?? "UTC");
    setWebsite(profile.website_url ?? "");
    setWebsiteError(null);
    setNameTried(false);
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
  const [showCurrentPw,   setShowCurrentPw]   = useState(false);
  const [showNewPw,       setShowNewPw]       = useState(false);
  const [showConfirmPw,   setShowConfirmPw]   = useState(false);
  const [showEmailPw,     setShowEmailPw]     = useState(false);
  const [passwordSaving,  setPasswordSaving]  = useState(false);

  const passwordStrength = getPasswordStrength(newPassword);

  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    // Allow re-selecting the same file after a failed attempt.
    e.target.value = "";

    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("Avatar must be 2 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const result = await avatarStorage.upload(user.id, file);
      const publicUrl = `${result.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(publicUrl);
      await updateProfile({ avatar_url: publicUrl } as any);
      toast.success("Avatar updated!");
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to upload avatar. Please try again.";
      toast.error(
        message.includes("not supported") || message.includes("too large")
          ? message
          : "Failed to upload avatar. Please try again."
      );
    } finally {
      setUploading(false);
    }
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
    if (trimmed.toLowerCase() === user.email?.trim().toLowerCase()) {
      toast.info("That is already your current email address.");
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
    const parsed = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Password does not meet requirements.");
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
    setSaved(false);
    setSaveFailed(false);
    setNameTried(true);

    const trimmedName = name.trim();
    const yearsNum = EXPERIENCE_LEVELS.find((l) => l.label === experience)?.years ?? null;
    const tz =
      PROFILE_TIMEZONES.includes(timezone as (typeof PROFILE_TIMEZONES)[number])
        ? timezone
        : "UTC";

    const payload = {
      full_name: trimmedName,
      bio: bio.trim(),
      timezone: tz,
      website_url: website.trim() || null,
      experience_years: yearsNum,
      target_role: targetRole || null,
      avatar_url: avatarUrl.trim() || null,
    };

    // Validate payload with schema
    const validation = profileUpdateSchema.safeParse(payload);
    if (!validation.success) {
      const firstError = validation.error.issues[0]?.message ?? "Invalid profile data.";
      toast.error(firstError);
      setSaveFailed(true);
      setSaving(false);
      return;
    }

    try {
      await updateProfile(validation.data as any);
      if (website.trim()) setWebsite(website.trim());
      setSaved(true);
      toast.success("Profile saved");
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setSaveFailed(true);
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

  const trimmedNameLen = name.trim().length;
  const nameError =
    nameTried || trimmedNameLen > 0
      ? trimmedNameLen === 0
        ? "Full name is required."
        : trimmedNameLen < 2
          ? "Full name must be at least 2 characters long."
          : trimmedNameLen > 200
            ? "Full name must be 200 characters or less."
            : null
      : null;

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
              accept={AVATAR_ACCEPT}
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
          <div>
            <Input
              id="profile-full-name"
              label="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTried(true)}
              placeholder="Your name"
              error={nameError ?? undefined}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? "profile-full-name-error" : undefined}
              required
            />
          </div>
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
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block" htmlFor="profile-timezone">
                Timezone
              </label>
              <select
                id="profile-timezone"
                value={PROFILE_TIMEZONES.includes(timezone as (typeof PROFILE_TIMEZONES)[number]) ? timezone : "UTC"}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm"
              >
                {PROFILE_TIMEZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Canonical IANA timezone used for reminders and scheduling.
              </p>
            </div>
            <div>
              <Input
                id="profile-website"
                label="Website"
                value={website}
                onChange={(e) => {
                  setWebsite(e.target.value);
                  setWebsiteError(null);
                }}
                onBlur={() => {
                  if (!website.trim()) {
                    setWebsiteError(null);
                    return;
                  }
                  try {
                    normalizeWebsiteUrl(website);
                    setWebsiteError(null);
                  } catch (err) {
                    setWebsiteError(err instanceof Error ? err.message : "Invalid website URL.");
                  }
                }}
                placeholder="https://example.com"
                leftIcon={<Globe className="w-3.5 h-3.5" />}
                error={websiteError ?? undefined}
                aria-invalid={Boolean(websiteError)}
                aria-describedby={websiteError ? "profile-website-error" : undefined}
              />
            </div>
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
          <div className="relative">
            <Input
              label="Confirm with current password"
              type={showEmailPw ? "text" : "password"}
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowEmailPw((v) => !v)}
              aria-label={showEmailPw ? "Hide email confirmation password" : "Show email confirmation password"}
              aria-pressed={showEmailPw}
              className="absolute right-2 bottom-2.5 text-muted-foreground hover:text-foreground"
            >
              {showEmailPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
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
        <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
          <Lock className="w-4 h-4 text-primary" />
          Password
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Password changes live on Security so credentials are not updated from this page.
        </p>
        <Link
          to="/app/settings/security"
          className="inline-flex text-xs font-semibold text-primary hover:text-primary/80"
        >
          Change password on Security →
        </Link>
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

      <SettingsSaveBar>
      <Button
        variant={saved ? "success" : saveFailed ? "danger" : "primary"}
        size="md"
        loading={saving}
        onClick={handleSave}
        leftIcon={saved
          ? <CheckCircle className="w-4 h-4" />
          : <Save className="w-4 h-4" />
        }
      >
        {saving ? "Saving…" : saved ? "Saved!" : saveFailed ? "Failed — retry" : "Save changes"}
      </Button>
      </SettingsSaveBar>
    </SettingsPageShell>
  );
}
