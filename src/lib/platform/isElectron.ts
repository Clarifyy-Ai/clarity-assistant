/** True when running inside the Clarify AI Electron desktop shell. */
export function isElectronApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron,
  );
}
