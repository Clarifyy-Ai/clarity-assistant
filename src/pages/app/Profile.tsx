import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  User, Mail, MapPin, Briefcase, Trophy, Flame, Zap,
  Star, Settings, Calendar, Edit,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function Profile() {
  const { profile } = useAuthStore();

  const initial = (
    profile?.full_name?.trim()?.[0] ??
    profile?.email?.trim()?.[0] ??
    "U"
  ).toUpperCase();

  const stats = [
    { label: "XP Earned", value: profile?.xp ?? 0, icon: Zap, color: "text-amber-500" },
    { label: "Current Streak", value: `${profile?.streak_current ?? 0}d`, icon: Flame, color: "text-orange-500" },
    { label: "Longest Streak", value: `${profile?.streak_longest ?? 0}d`, icon: Trophy, color: "text-yellow-500" },
    { label: "Badges", value: (profile?.badges as string[])?.length ?? 0, icon: Star, color: "text-violet-500" },
  ];

  const details = [
    { label: "Email", value: profile?.email, icon: Mail },
    { label: "Role", value: profile?.role ?? "Not set", icon: Briefcase },
    { label: "Experience", value: profile?.experience_level ?? "Not set", icon: User },
    { label: "Domain", value: profile?.domain ?? "Not set", icon: MapPin },
    { label: "Joined", value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : "—", icon: Calendar },
  ];

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name ?? "Avatar"}
                className="w-24 h-24 rounded-full object-cover border-2 border-border"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-violet-700 flex items-center justify-center text-3xl font-bold text-white">
                {initial}
              </div>
            )}
            <h2 className="mt-4 text-lg font-bold text-foreground">
              {profile?.full_name ?? "User"}
            </h2>
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
            {profile?.experience_level && (
              <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-violet-500/15 text-violet-500 dark:text-violet-300 capitalize">
                {profile.experience_level}
              </span>
            )}
            {profile?.domain && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed capitalize">
                {profile.domain} professional
              </p>
            )}
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {stats.map((s) => (
              <Card key={s.label} className="text-center">
                <s.icon className={cn("w-5 h-5 mx-auto mb-1", s.color)} />
                <p className="text-xl font-bold text-foreground">{s.value}</p>
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
