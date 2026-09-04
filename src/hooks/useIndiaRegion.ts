import { useMemo } from "react";
import { useAuthStore } from "@/store/userStore";
import { resolveIsIndiaUser } from "@/lib/regional/indiaRegion";

/** True when Gov Exam Mock Tests and related surfaces should be visible (worldwide by default). */
export function useIndiaRegion(): { isIndia: boolean } {
  const profile = useAuthStore((s) => s.profile);

  const isIndia = useMemo(
    () =>
      resolveIsIndiaUser(
        profile
          ? {
              timezone: profile.timezone,
              locale: profile.locale,
              region: profile.region,
            }
          : null,
      ),
    [profile?.timezone, profile?.locale, profile?.region],
  );

  return { isIndia };
}
