import { Link } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { profilesDB, sessionsDB } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import {
  User,
  Mail,
  MapPin,
  Briefcase,
  Trophy,
  Flame,
  Zap,
  Star,
  Settings,
  Calendar,
  Edit,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase";

type ProfileRow = Tables<"profiles">;
type SessionRow = Tables<"sessions">;

function ProfilePageSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-1">
        <div className="flex flex-col items-center text-center space-y-3">
          <Skeleton className="w-24 h-24 rounded-full" />
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </Card>
      <div className="lg:col-span-2 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="text-center p-4 space-y-2">
              <Skeleton className="h-5 w-5 mx-auto rounded" />
              <Skeleton className="h-7 w-12 mx-auto" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </Card>
          ))}
        </div>
        <Card className="space-y-3 p-4">
          <Skeleton className="h-4 w-24" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </Card>
        <Card className="space-y-3 p-4">
          <Skeleton className="h-4 w-28" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-8 w-32" />
          ))}
        </Card>
      </div>
    </div>
  );
}

export default function Profile() {
  const { profile: storeProfile, user, setProfile } = useAuthStore();
  const [profile, setLocalProfile] = useState<any>(storeProfile);
  const [profileLoading, setProfileLoading] = useState(!storeProfile);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionsCompleted, setSessionsCompleted] = useState(0);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user?.id) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const row = await profilesDB.getById(user.id);
      setLocalProfile(row);
      setProfile(row as any);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setProfileLoading(false);
    }
  }, [user?.id, setProfile]);

  const loadSessions = useCallback(async () => {
    if (!user?.id) return;
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const [count, recent] = await Promise.all([
        sessionsDB.countCompletedByUserId(user.id),
        sessionsDB.getByUserId(user.id, 5),
      ]);
      setSessionsCompleted(count);
      setSessions(recent);
    } catch (err) {
      setSessionsError(err instanceof Error ? err.message : "Failed to load sessions");
      setSessions([]);
      setSessionsCompleted(0);
    } finally {
      setSessionsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const displayProfile = profile ?? storeProfile;
  const pageLoading = profileLoading && !displayProfile;

  const initial = (
    displayProfile?.full_name?.trim()?.[0] ??
    displayProfile?.email?.trim()?.[0] ??
    "U"
  ).toUpperCase();

  const bio =
    displayProfile && "bio" in displayProfile
      ? String((displayProfile as ProfileRow & { bio?: string }).bio ?? "")
      : "";

  const stats = [
    { label: "XP Earned", value: displayProfile?.xp ?? 0, icon: Zap, color: "text-amber-500" },
    {
      label: "Current Streak",
      value: `${displayProfile?.streak_current ?? 0}d`,
      icon: Flame,
      color: "text-orange-500",
    },
    { label: "Sessions", value: sessionsCompleted, icon: Video, color: "text-blue-500" },
    {
      label: "Badges",
      value: (displayProfile?.badges as string[] | null)?.length ?? 0,
      icon: Star,
      color: "text-violet-500",
    },
  ];

  const details = [
    { label: "Email", value: displayProfile?.email ?? "?", icon: Mail },
    { label: "Role", value: displayProfile?.role ?? "Not set", icon: Briefcase },
    { label: "Experience", value: displayProfile?.experience_level ?? "Not set", icon: User },
    { label: "Domain", value: displayProfile?.domain ?? "Not set", icon: MapPin },
    {
      label: "Joined",
      value: displayProfile?.created_at
        ? new Date(displayProfile.created_at).toLocaleDateString()
        : "?",
      icon: Calendar,
    },
  ];

  if (pageLoading) {
    return (
      <div>
        <PageHeader title="Profile" description="Your public profile and stats" />
        <ProfilePageSkeleton />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your public profile and stats"
        actions={
          <Link to="/app/settings/profile">
            <Button variant="secondary" size="sm" leftIcon={<Edit className="w-4 h-4" />}>
              Edit Profile
            </Button>
          </Link>
        }
      />

      {profileError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <span className="flex-1">{profileError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadProfile()}>
            Retry
          </Button>
        </div>
      )}

      {sessionsError && (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <span className="flex-1">{sessionsError}</span>
          <Button size="sm" variant="outline" onClick={() => void loadSessions()}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            {displayProfile?.avatar_url ? (
              <img
                src={displayProfile.avatar_url}
                alt={
                  displayProfile.full_name
                    ? `Profile photo of ${displayProfile.full_name}`
                    : "Your profile photo"
                }
                className="w-24 h-24 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-violet-700 flex items-center justify-center text-3xl font-bold text-white">
                {initial}
              </div>
            )}
            <h2 className="mt-4 text-lg font-bold text-foreground">
              {displayProfile?.full_name ?? "User"}
            </h2>
            <p className="text-sm text-muted-foreground">{displayProfile?.email}</p>
            {displayProfile?.experience_level && (
              <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-500/15 text-violet-500 dark:text-violet-300 capitalize">
                {displayProfile.experience_level}
              </span>
            )}
            {bio && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{bio}</p>
            )}
            {displayProfile?.domain && (
              <p className="mt-2 text-xs text-muted-foreground capitalize">
                {displayProfile.domain} professional
              </p>
            )}
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <Card key={s.label} className="text-center">
                <s.icon className={cn("w-5 h-5 mx-auto mb-1", s.color)} />
                {s.label === "Sessions" && sessionsLoading ? (
                  <Skeleton className="h-7 w-10 mx-auto" />
                ) : (
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                )}
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </Card>
            ))}
          </div>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-4">Details</h3>
            <div className="space-y-3">
              {details.map((d) => (
                <div key={d.label} className="flex items-center gap-3">
                  <d.icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground w-24">{d.label}</span>
                  <span className="text-sm text-foreground capitalize">{d.value}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Recent Sessions</h3>
            {sessionsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sessions yet.</p>
            ) : (
              <ul className="space-y-2">
                {sessions.map((session) => (
                  <li
                    key={session.id}
                    className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0"
                  >
                    <span className="text-foreground capitalize">
                      {session.session_type ?? "Practice"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {session.created_at
                        ? new Date(session.created_at).toLocaleDateString()
                        : "?"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Links</h3>
            <div className="flex flex-wrap gap-2">
              <Link to="/app/settings/profile">
                <Button variant="ghost" size="sm" leftIcon={<Settings className="w-3.5 h-3.5" />}>
                  Edit Settings
                </Button>
              </Link>
              <Link to="/app/sessions">
                <Button variant="ghost" size="sm" leftIcon={<Star className="w-3.5 h-3.5" />}>
                  View Sessions
                </Button>
              </Link>
              <Link to="/app/analytics">
                <Button variant="ghost" size="sm" leftIcon={<Trophy className="w-3.5 h-3.5" />}>
                  Analytics
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
