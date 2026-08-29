/**
 * Local microphone pre-check: permission + device + real audio signal.
 * Never calls a remote STT / Deepgram provider.
 */

import type { AudioDevice } from "@/types/audio.types";
import { MicState } from "@/lib/audio/precheckStates";

export const MIC_SIGNAL_RMS_THRESHOLD = 0.004;
export const MIC_SIGNAL_WINDOW_MS = 1_200;
export const MIC_SIGNAL_SAMPLE_MS = 50;

export type LocalMicCheckResult = {
  state: MicState;
  deviceId: string | null;
  deviceLabel: string | null;
  devices: AudioDevice[];
  peakRms: number;
  usedFallback: boolean;
  error?: string;
};

export type LocalMicAnalyser = {
  getRms: () => number;
  disconnect: () => void;
};

export type LocalMicCheckDeps = {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
  createAnalyser?: (stream: MediaStream) => LocalMicAnalyser;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  isSecureContext?: boolean;
  mediaDevicesSupported?: boolean;
  audioContextSupported?: boolean;
};

export function classifyGetUserMediaError(err: unknown): MicState {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: string }).name)
      : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return MicState.PERMISSION_DENIED;
  }
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError" ||
    name === "NotReadableError" ||
    name === "TrackStartError"
  ) {
    return MicState.DEVICE_UNAVAILABLE;
  }
  return MicState.ERROR;
}

export function resolveInputDevice(
  devices: AudioDevice[],
  preferredId: string | null | undefined,
): { device: AudioDevice | null; usedFallback: boolean; preferredMissing: boolean } {
  if (devices.length === 0) {
    return { device: null, usedFallback: false, preferredMissing: Boolean(preferredId) };
  }
  if (preferredId) {
    const match = devices.find((d) => d.deviceId === preferredId);
    if (match) return { device: match, usedFallback: false, preferredMissing: false };
    const fallback = devices.find((d) => d.isDefault) ?? devices[0];
    return { device: fallback, usedFallback: true, preferredMissing: true };
  }
  return {
    device: devices.find((d) => d.isDefault) ?? devices[0],
    usedFallback: false,
    preferredMissing: false,
  };
}

export function mapMediaInputs(devices: MediaDeviceInfo[]): AudioDevice[] {
  return devices
    .filter((d) => d.kind === "audioinput")
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || `Microphone ${i + 1}`,
      kind: "audioinput" as const,
      isDefault: d.deviceId === "default" || i === 0,
    }));
}

export function rmsFromTimeDomain(samples: ArrayLike<number>): number {
  const len = samples.length || 1;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0;
    sum += v * v;
  }
  return Math.sqrt(sum / len);
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function defaultCreateAnalyser(stream: MediaStream): LocalMicAnalyser {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    throw new Error("AudioContext is not supported");
  }
  const ctx = new AudioCtx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.2;
  source.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);

  return {
    getRms() {
      try {
        analyser.getFloatTimeDomainData(buffer);
      } catch {
        return 0;
      }
      return rmsFromTimeDomain(buffer);
    },
    disconnect() {
      try {
        source.disconnect();
        analyser.disconnect();
      } finally {
        void ctx.close().catch(() => {});
      }
    },
  };
}

function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => {
    try {
      track.stop();
    } catch {
      // ignore
    }
  });
}

export async function detectAudioSignal(
  getRms: () => number,
  options?: {
    windowMs?: number;
    sampleMs?: number;
    threshold?: number;
    signal?: AbortSignal;
    now?: () => number;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  },
): Promise<{ peakRms: number; heard: boolean }> {
  const windowMs = options?.windowMs ?? MIC_SIGNAL_WINDOW_MS;
  const sampleMs = options?.sampleMs ?? MIC_SIGNAL_SAMPLE_MS;
  const threshold = options?.threshold ?? MIC_SIGNAL_RMS_THRESHOLD;
  const now = options?.now ?? Date.now;
  const sleep = options?.sleep ?? defaultSleep;
  const start = now();
  let peakRms = 0;

  while (now() - start < windowMs) {
    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    peakRms = Math.max(peakRms, getRms());
    if (peakRms >= threshold) {
      return { peakRms, heard: true };
    }
    await sleep(sampleMs, options?.signal);
  }

  peakRms = Math.max(peakRms, getRms());
  return { peakRms, heard: peakRms >= threshold };
}

export async function runLocalMicCheck(
  options?: {
    deviceId?: string | null;
    signal?: AbortSignal;
    signalWindowMs?: number;
  },
  deps: LocalMicCheckDeps = {},
): Promise<LocalMicCheckResult> {
  const mediaSupported =
    deps.mediaDevicesSupported ??
    Boolean(typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia);
  const audioCtxSupported =
    deps.audioContextSupported ??
    Boolean(
      typeof window !== "undefined" &&
        (window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext),
    );
  const secure = deps.isSecureContext ?? (typeof window !== "undefined" ? window.isSecureContext : true);

  if (!mediaSupported || !audioCtxSupported) {
    return {
      state: MicState.BROWSER_UNSUPPORTED,
      deviceId: null,
      deviceLabel: null,
      devices: [],
      peakRms: 0,
      usedFallback: false,
      error: "This browser cannot access the microphone.",
    };
  }

  if (!secure) {
    return {
      state: MicState.BROWSER_UNSUPPORTED,
      deviceId: null,
      deviceLabel: null,
      devices: [],
      peakRms: 0,
      usedFallback: false,
      error: "Microphone access requires a secure connection (HTTPS).",
    };
  }

  if (options?.signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const getUserMedia =
    deps.getUserMedia ??
    ((constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints));
  const enumerateDevices =
    deps.enumerateDevices ?? (() => navigator.mediaDevices.enumerateDevices());

  let stream: MediaStream | null = null;
  let analyser: LocalMicAnalyser | null = null;

  try {
    const preferredId = options?.deviceId?.trim() || null;
    const constraints: MediaStreamConstraints = {
      audio: preferredId
        ? { deviceId: { exact: preferredId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true },
      video: false,
    };

    try {
      stream = await getUserMedia(constraints);
    } catch (err) {
      if (isAbortError(err)) {
        throw err;
      }
      if (preferredId) {
        const classified = classifyGetUserMediaError(err);
        if (classified === MicState.DEVICE_UNAVAILABLE) {
          try {
            stream = await getUserMedia({ audio: true, video: false });
          } catch (fallbackErr) {
            if (isAbortError(fallbackErr)) throw fallbackErr;
            const state = classifyGetUserMediaError(fallbackErr);
            return {
              state,
              deviceId: null,
              deviceLabel: null,
              devices: [],
              peakRms: 0,
              usedFallback: true,
              error: fallbackErr instanceof Error ? fallbackErr.message : "Microphone unavailable",
            };
          }
        } else {
          return {
            state: classified,
            deviceId: null,
            deviceLabel: null,
            devices: [],
            peakRms: 0,
            usedFallback: false,
            error: err instanceof Error ? err.message : "Microphone check failed",
          };
        }
      } else {
        const state = classifyGetUserMediaError(err);
        return {
          state,
          deviceId: null,
          deviceLabel: null,
          devices: [],
          peakRms: 0,
          usedFallback: false,
          error: err instanceof Error ? err.message : "Microphone check failed",
        };
      }
    }

    if (options?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const mediaInfos = await enumerateDevices();
    const devices = mapMediaInputs(mediaInfos);
    const trackId = stream.getAudioTracks()[0]?.getSettings?.().deviceId ?? null;
    const resolved = resolveInputDevice(devices, preferredId ?? trackId);
    const liveTrack = stream.getAudioTracks()[0];
    if (!liveTrack || liveTrack.readyState === "ended") {
      return {
        state: MicState.DEVICE_UNAVAILABLE,
        deviceId: resolved.device?.deviceId ?? null,
        deviceLabel: resolved.device?.label ?? null,
        devices,
        peakRms: 0,
        usedFallback: resolved.usedFallback,
        error: "The selected microphone is not available.",
      };
    }

    const createAnalyser = deps.createAnalyser ?? defaultCreateAnalyser;
    analyser = createAnalyser(stream);
    const { peakRms, heard } = await detectAudioSignal(() => analyser!.getRms(), {
      windowMs: options?.signalWindowMs,
      signal: options?.signal,
      now: deps.now,
      sleep: deps.sleep,
    });

    const deviceId = resolved.device?.deviceId ?? trackId;
    const deviceLabel = resolved.device?.label ?? liveTrack.label ?? null;

    return {
      state: heard ? MicState.READY : MicState.NO_SIGNAL,
      deviceId,
      deviceLabel,
      devices,
      peakRms,
      usedFallback: resolved.usedFallback || Boolean(preferredId && preferredId !== deviceId),
    };
  } catch (err) {
    if (isAbortError(err)) {
      throw err;
    }
    return {
      state: MicState.ERROR,
      deviceId: null,
      deviceLabel: null,
      devices: [],
      peakRms: 0,
      usedFallback: false,
      error: err instanceof Error ? err.message : "Microphone check failed",
    };
  } finally {
    analyser?.disconnect();
    stopStream(stream);
  }
}
