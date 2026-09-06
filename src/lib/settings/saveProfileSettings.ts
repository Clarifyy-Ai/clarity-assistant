import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { withTimeout } from "@/lib/auth/accountBootstrap";
import type { TablesUpdate } from "@/integrations/supabase/types";

const SAVE_TIMEOUT_MS = 45_000;

/** Returns user id or shows a toast and returns null. */
export function requireSettingsUser(): string | null {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    toast.error("Sign in to save settings.");
    return null;
  }
  return userId;
}

export function settingsSaveError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Could not save settings. Check your connection and try again.";
}

/** Persist profile patches using auth user id — does not require profile row in memory. */
export async function saveProfileSettings(
  updates: TablesUpdate<"profiles">,
): Promise<void> {
  if (!requireSettingsUser()) return;
  const updateProfile = useAuthStore.getState().updateProfile;
  await withTimeout(
    updateProfile(updates),
    SAVE_TIMEOUT_MS,
    "Saving timed out. Check your connection and try again.",
  );
}
