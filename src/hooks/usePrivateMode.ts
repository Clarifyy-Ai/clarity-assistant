// Sprint C: Private Mode — disables session persistence & transcript storage locally.
// Reads/writes localStorage. Acts as a global feature flag.
import { useCallback, useEffect, useState } from "react";

const KEY = "clarify_private_mode";

export function getPrivateMode(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setPrivateMode(v: boolean) {
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
    window.dispatchEvent(new CustomEvent("clarify:private-mode", { detail: v }));
  } catch {}
}

export function usePrivateMode() {
  const [enabled, setEnabled] = useState<boolean>(() => getPrivateMode());

  useEffect(() => {
    const onChange = (e: Event) => {
      const v = (e as CustomEvent<boolean>).detail;
      setEnabled(!!v);
    };
    window.addEventListener("clarify:private-mode", onChange as EventListener);
    return () =>
      window.removeEventListener("clarify:private-mode", onChange as EventListener);
  }, []);

  const toggle = useCallback(() => {
    const next = !getPrivateMode();
    setPrivateMode(next);
    setEnabled(next);
  }, []);

  const set = useCallback((v: boolean) => {
    setPrivateMode(v);
    setEnabled(v);
  }, []);

  return { enabled, toggle, set };
}
