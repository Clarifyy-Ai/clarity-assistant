/**
 * Tab-scoped logout: this browser tab can appear signed-out without clearing
 * the shared Supabase localStorage session used by other open tabs.
 */

const TAB_LOCAL_LOGOUT_KEY = "clarify-auth-tab-logged-out";

/** When true, auth storage removeItem is a no-op so soft sign-out keeps other tabs alive. */
let suppressAuthStorageRemove = false;

export function markTabLocalLogout(): void {
  try {
    sessionStorage.setItem(TAB_LOCAL_LOGOUT_KEY, "1");
  } catch {
    // sessionStorage may be unavailable (private mode quotas) — best-effort.
  }
}

export function clearTabLocalLogout(): void {
  try {
    sessionStorage.removeItem(TAB_LOCAL_LOGOUT_KEY);
  } catch {
    // ignore
  }
}

export function isTabLocalLogout(): boolean {
  try {
    return sessionStorage.getItem(TAB_LOCAL_LOGOUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function beginSuppressAuthStorageRemove(): void {
  suppressAuthStorageRemove = true;
}

export function endSuppressAuthStorageRemove(): void {
  suppressAuthStorageRemove = false;
}

export function shouldSuppressAuthStorageRemove(): boolean {
  return suppressAuthStorageRemove || isTabLocalLogout();
}

/**
 * Clear this tab's in-memory GoTrue session without wiping shared localStorage
 * (so other tabs stay signed in).
 */
export async function softClearTabSession(
  signOutLocal: () => Promise<unknown>,
): Promise<void> {
  beginSuppressAuthStorageRemove();
  try {
    await signOutLocal();
  } catch {
    // Best-effort memory clear.
  } finally {
    endSuppressAuthStorageRemove();
  }
}

/**
 * Supabase auth storage: shared localStorage for multi-tab login, but this tab
 * can opt out via sessionStorage without deleting the shared session.
 */
export const tabAwareAuthStorage: Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
> = {
  getItem(key: string): string | null {
    if (isTabLocalLogout()) {
      return null;
    }
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore quota / private mode
    }
  },
  removeItem(key: string): void {
    if (shouldSuppressAuthStorageRemove()) {
      return;
    }
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  },
};
