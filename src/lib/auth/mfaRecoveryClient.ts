import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { ApiClientError } from "@/lib/api/apiClient";
import { useAuthStore } from "@/store/authStore";

export type MfaRecoveryStatus = {
  unused_codes: number;
  reenrollment_required: boolean;
  verified_totp: boolean;
};

export function syncMfaReenrollmentFlag(required: boolean): void {
  const { profile, setProfile } = useAuthStore.getState();
  if (!profile) return;
  setProfile({ ...profile, mfa_reenrollment_required: required });
}

export function recoveryErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.status === 429) {
    return "Too many recovery attempts. Wait a few minutes, then try again.";
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Recovery could not be completed. Try again.";
}

export async function fetchMfaRecoveryStatus(): Promise<MfaRecoveryStatus> {
  return fetchEdgeJson<MfaRecoveryStatus>("mfa-recovery", { action: "status" });
}

export async function issueMfaRecoveryCodes(): Promise<string[]> {
  const res = await fetchEdgeJson<{ codes?: string[] }>("mfa-recovery", { action: "issue_codes" });
  return Array.isArray(res.codes) ? res.codes : [];
}

export async function consumeMfaRecoveryCode(code: string): Promise<void> {
  await fetchEdgeJson("mfa-recovery", { action: "consume_code", code });
  syncMfaReenrollmentFlag(true);
  try {
    await useAuthStore.getState().loadProfile({ force: true });
  } catch {
    /* local flag is fail-closed until profile reloads */
  }
}

export async function startMfaEmailRecovery(): Promise<void> {
  await fetchEdgeJson("mfa-recovery", { action: "start_email" });
}

export async function confirmMfaEmailRecovery(token: string): Promise<void> {
  await fetchEdgeJson("mfa-recovery", { action: "confirm_email", token });
  syncMfaReenrollmentFlag(true);
  try {
    await useAuthStore.getState().loadProfile({ force: true });
  } catch {
    /* local flag is fail-closed until profile reloads */
  }
}

export async function completeMfaReenrollment(): Promise<void> {
  await fetchEdgeJson("mfa-recovery", { action: "complete_enroll" });
  syncMfaReenrollmentFlag(false);
  try {
    await useAuthStore.getState().loadProfile({ force: true });
  } catch {
    /* session JWT is still AAL2; route guard will re-read profile */
  }
}
