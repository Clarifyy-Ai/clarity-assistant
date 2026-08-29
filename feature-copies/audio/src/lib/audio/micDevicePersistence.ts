const MIC_DEVICE_KEY = "clarify:precheck.micDeviceId";
const SPEAKER_DEVICE_KEY = "clarify:precheck.speakerDeviceId";

function readKey(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (!value) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Quota / private mode — persistence is best-effort.
  }
}

export function loadPersistedMicDeviceId(): string | null {
  return readKey(MIC_DEVICE_KEY);
}

export function persistMicDeviceId(deviceId: string | null): void {
  writeKey(MIC_DEVICE_KEY, deviceId);
}

export function loadPersistedSpeakerDeviceId(): string | null {
  return readKey(SPEAKER_DEVICE_KEY);
}

export function persistSpeakerDeviceId(deviceId: string | null): void {
  writeKey(SPEAKER_DEVICE_KEY, deviceId);
}

export function supportsOutputDeviceSelection(): boolean {
  if (typeof HTMLMediaElement === "undefined") return false;
  return typeof (HTMLMediaElement.prototype as HTMLMediaElement & { setSinkId?: unknown }).setSinkId === "function";
}
