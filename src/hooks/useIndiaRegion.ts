import { useMemo } from "react";
import { useAuthStore } from "@/store/userStore";
import { resolveIsIndiaUser } from "@/lib/regional/indiaRegion";

/** True when Gov Exam Mock Tests and related surfaces should be visible (currently always). */
export function useIndiaRegion(): { isIndia: boolean } {
  const profile = useAuthStore((s) => s.profile);

  const isIndia = useMemo(
    () =>
      resolveIsIndiaUser(
        profile
          ? { timezone: profile.timezone, locale: profile.locale }
          : null,
      ),
    [profile?.timezone, profile?.locale],
  );

  return { isIndia };
}
