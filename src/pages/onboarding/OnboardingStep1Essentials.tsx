// ─────────────────────────────────────────────────────────────────────────────
// OnboardingStep1Essentials — Step 1: Name, target role, experience level.
// Combines former Role + Experience steps into one ~60s screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Code2,
  Package,
  BarChart3,
  Palette,
  Cog,
  ClipboardList,
  Megaphone,
  Puzzle,
  Info,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getStoredRefCode, normalizeRefCode } from "@/lib/referrals";
import type { StepProps } from "@/types/onboarding.types";
import type { ProfileRow } from "@/types";
import {
  isAllowedOnboardingInterviewDate,
  isMeaningfulDisplayName,
  maxOnboardingInterviewIsoDate,
  onboardingEssentialsSchema,
  todayIsoDate,
} from "@/lib/onboarding/schema";

const ROLES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "software_engineer", label: "Software Engineer", icon: Code2 },
  { value: "product_manager",   label: "Product Manager",   icon: Package },
  { value: "data_scientist",    label: "Data Scientist",    icon: BarChart3 },
  { value: "designer",          label: "Designer",          icon: Palette },
  { value: "devops_engineer",   label: "DevOps / SRE",      icon: Cog },
  { value: "business_analyst",  label: "Business Analyst",  icon: ClipboardList },
  { value: "marketing",         label: "Marketing",         icon: Megaphone },
  { value: "other",             label: "Other",             icon: Puzzle },
];

const LEVELS = [
  { value: "intern",  label: "Intern",       sub: "0 yrs"     },
  { value: "junior",  label: "Junior",       sub: "0 – 2 yrs" },
  { value: "mid",     label: "Mid-level",    sub: "2 – 5 yrs" },
  { value: "senior",  label: "Senior",       sub: "5 – 8 yrs" },
  { value: "staff",   label: "Staff / Lead", sub: "8+ yrs"    },
  { value: "manager", label: "Manager",      sub: "Any"       },
] as const;

const YEARS_MAP: Record<string, number> = {
  intern: 0, junior: 1, mid: 3, senior: 6, staff: 10, manager: 8,
};

export default function OnboardingStep1Essentials({ data, onNext, onChange }: StepProps) {
  const { user, profile, setProfile } = useAuthStore();
  const [searchParams] = useSearchParams();
  const refCode = normalizeRefCode(searchParams.get("ref")) ?? getStoredRefCode();

  const matchedChip = ROLES.find((r) => r.value === data.targetRole)?.value;
  const [name,       setName]       = useState(profile?.full_name ?? "");
  const [role,       setRole]       = useState(
    matchedChip ?? (data.targetRole ? "other" : ""),
  );
  const [customRole, setCustomRole] = useState(
    data.targetRole && !ROLES.some((r) => r.value === data.targetRole) ? data.targetRole : "",
  );
  const [level,      setLevel]      = useState(data.currentLevel || "");
  const [industry, setIndustry] = useState(data.industry || "");
  const [interviewDate, setInterviewDate] = useState(data.interviewDate || "");
  const [difficulty, setDifficulty] = useState(data.difficulty || "medium");
  const [goals, setGoals] = useState(data.improvementGoals.join(", "));
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const resolvedRole = role === "other" ? customRole.trim().slice(0, 100) : role;
  const nameValid = isMeaningfulDisplayName(name);
  const interviewDateValid = isAllowedOnboardingInterviewDate(interviewDate);

  const canProceed = Boolean(
    nameValid && role && level && (role !== "other" || customRole.trim()) && interviewDateValid,
  );

  // Keep parent in sync so "Skip setup" validates the same fields as Continue.
  useEffect(() => {
    onChange?.({
      targetRole: resolvedRole,
      currentLevel: level,
      yearsOfExperience: level ? (YEARS_MAP[level] ?? 0) : data.yearsOfExperience,
      industry,
      interviewDate,
      difficulty,
      improvementGoals: goals.split(",").map((g) => g.trim()).filter(Boolean),
    });
  }, [resolvedRole, level, industry, interviewDate, difficulty, goals, onChange, data.yearsOfExperience]);

  async function handleNext() {
    if (!user) return;
    const parsed = onboardingEssentialsSchema.safeParse({
      fullName: name,
      interviewDate,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your name and interview date.");
      return;
    }
    if (!canProceed) return;
    setLoading(true);
    setError(null);

    const existingPrefs =
      profile?.notification_prefs &&
      typeof profile.notification_prefs === "object" &&
      !Array.isArray(profile.notification_prefs)
        ? (profile.notification_prefs as Record<string, unknown>)
        : {};

    const { data: row, error: dbError } = await supabase
      .from("profiles")
      .update({
        full_name:         parsed.data.fullName,
        role_type:         role,
        target_role:       resolvedRole,
        experience_years:  YEARS_MAP[level] ?? 0,
        industry: industry || null,
        domain: industry || null,
        interview_date: parsed.data.interviewDate || null,
        interview_difficulty: difficulty || null,
        improvement_goals: goals.split(",").map((g) => g.trim()).filter(Boolean),
        notification_prefs: {
          ...existingPrefs,
          experience_level: level,
        },
        onboarding_step:   1,
        // referred_by is server-owned (blocklisted on client profile updates);
        // finishOnboarding records referrals via recordReferral().
      })
      .eq("id", user.id)
      .select()
      .maybeSingle();

    setLoading(false);

    if (dbError) {
      setError(dbError.message);
      return;
    }

    if (row) setProfile(row as unknown as ProfileRow);

    onNext({
      targetRole:        resolvedRole,
      targetCompanies:   data.targetCompanies,
      yearsOfExperience: YEARS_MAP[level] ?? 0,
      currentLevel:      level,
    });
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">
          Quick essentials
        </h2>
        <p className="text-muted-foreground text-sm">
          Two quick questions so Practice Coach can match question difficulty and answer depth to you.
        </p>
      </div>

      {refCode && (
        <div className="px-3 py-2.5 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary text-center">
          Referral code{" "}
          <span className="font-mono font-bold">{refCode}</span>{" "}
          applied — you&apos;ll both earn bonus credits!
        </div>
      )}

      <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Why we ask:</span>{" "}
          Your role and seniority calibrate every live hint — from intern-friendly prompts to staff-level system design depth.
        </p>
      </div>

      <Input
        label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Jane Smith"
        autoFocus
        error={
          name.length > 0 && !nameValid
            ? "Enter your real name — not a placeholder."
            : undefined
        }
      />

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Target role <span className="text-primary">*</span>
          <span className="ml-1 text-[10px] uppercase tracking-wide text-primary/80">Required</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="radiogroup" aria-label="Target role">
          {ROLES.map((r) => {
            const Icon = r.icon;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={role === r.value}
                onClick={() => setRole(r.value)}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all",
                  role === r.value
                    ? "bg-primary/20 border-primary/50 text-primary"
                    : "bg-secondary/50 border-border text-muted-foreground hover:border-primary/30",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {r.label}
              </button>
            );
          })}
        </div>
        {role === "other" && (
          <Input
            label="Describe your role"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value.slice(0, 100))}
            placeholder="e.g. UX Research Lead"
            maxLength={100}
            hint={`${customRole.length}/100 characters`}
          />
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2">
          Experience level <span className="text-primary">*</span>
          <span className="ml-1 text-[10px] uppercase tracking-wide text-primary/80">Required</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Experience level">
          {LEVELS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={level === l.value}
              onClick={() => setLevel(l.value)}
              className={cn(
                "flex flex-col items-start gap-0.5 p-3 rounded-xl border text-left transition-all",
                level === l.value
                  ? "bg-primary/20 border-primary/50"
                  : "bg-secondary/50 border-border hover:border-primary/30",
              )}
            >
              <span className={cn(
                "text-sm font-semibold",
                level === l.value ? "text-primary" : "text-muted-foreground",
              )}>
                {l.label}
              </span>
              <span className="text-[10px] text-muted-foreground">{l.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium text-muted-foreground">
          Industry
          <input
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value.slice(0, 80))}
            placeholder="e.g. Fintech"
            className="mt-1 w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="text-xs font-medium text-muted-foreground">
          Interview date
          <input
            type="date"
            value={interviewDate}
            min={todayIsoDate()}
            max={maxOnboardingInterviewIsoDate()}
            onChange={(e) => setInterviewDate(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
            aria-invalid={interviewDate.length > 0 && !interviewDateValid}
          />
          {interviewDate.length > 0 && !interviewDateValid ? (
            <p className="mt-1 text-[11px] text-destructive">
              Interview date must be today or later, and within the next two years.
            </p>
          ) : null}
        </label>
      </div>
      <label className="text-xs font-medium text-muted-foreground block">
        Difficulty
        <Select value={difficulty} onValueChange={setDifficulty}>
          <SelectTrigger className="mt-1 w-full rounded-xl border-border bg-secondary/50">
            <SelectValue placeholder="Select difficulty" />
          </SelectTrigger>
          <SelectContent position="popper" className="z-[200]">
            <SelectItem value="easy">Easy</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="hard">Hard</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <label className="text-xs font-medium text-muted-foreground block">
        Improvement goals
        <input
          type="text"
          value={goals}
          onChange={(e) => setGoals(e.target.value.slice(0, 200))}
          placeholder="Comma-separated, e.g. STAR stories, system design"
          className="mt-1 w-full rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground"
        />
      </label>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <Button
        variant="primary"
        size="md"
        fullWidth
        loading={loading}
        disabled={!canProceed}
        onClick={() => void handleNext()}
      >
        Continue
      </Button>
    </div>
  );
}
