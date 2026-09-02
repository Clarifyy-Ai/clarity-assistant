import type { AudioError, AudioErrorCode } from "@/types/audio.types";
import {
  getMicPermissionState,
  type AudioPermissionState,
} from "@/lib/validators/audioValidator";

export type MicPermissionState = AudioPermissionState;

export const MIC_DENIED_RECOVERY =
  "Microphone access is blocked. Click the lock icon in the address bar, allow the microphone, then retry.";

export const MIC_NO_DEVICE_RECOVERY =
  "No microphone was found. Plug one in and retry.";

export class MicrophoneAccessError extends Error {
  readonly audioCode: AudioErrorCode;
  readonly recoverable: boolean;
  readonly suggestion: string;

  constructor(
    audioCode: AudioErrorCode,
    message: string,
    suggestion: string,
    recoverable: boolean,
  ) {
    super(message);
    this.name = "MicrophoneAccessError";
    this.audioCode = audioCode;
    this.suggestion = suggestion;
    this.recoverable = recoverable;
  }

  toAudioError(): AudioError {
    return {
      code: this.audioCode,
      message: this.message,
      recoverable: this.recoverable,
      suggestion: this.suggestion,
    };
  }
}

export function isMicrophoneAccessError(err: unknown): err is MicrophoneAccessError {
  return err instanceof MicrophoneAccessError;
}

export function shouldShowMicrophonePrompt(permission: MicPermissionState): boolean {
  return permission === "prompt";
}

export function microphoneSetupHint(
  permission: MicPermissionState,
  opts?: { restore?: boolean },
): string {
  if (permission === "denied") return MIC_DENIED_RECOVERY;
  if (permission === "granted") {
    return opts?.restore ? "Reconnecting microphone…" : "Connecting microphone…";
  }
  if (permission === "prompt") return "Allow microphone access when prompted";
  return opts?.restore ? "Reconnecting microphone…" : "Connecting microphone…";
}

export function restoredSessionToast(
  micReady: boolean,
  permission: MicPermissionState,
): string {
  if (micReady || permission === "granted") return "Session restored.";
  if (permission === "denied") {
    return "Session restored. Allow microphone access in your browser settings to continue transcription.";
  }
  if (permission === "prompt") {
    return "Session restored. Allow microphone access when prompted to continue transcription.";
  }
  return "Session restored. Connect a microphone to continue transcription.";
}

export type AcquireMicrophoneResult = {
  stream: MediaStream;
  permission: MicPermissionState;
  browserPrompted: boolean;
};

export type AcquireMicrophoneInput = {
  deviceId?: string | null;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
};

export type AcquireMicrophoneDeps = {
  queryPermission?: () => Promise<MicPermissionState>;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  enumerateDevices?: () => Promise<Array<Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">>>;
};

function throwForCode(code: AudioErrorCode, original?: unknown): never {
  if (code === "PERMISSION_DENIED") {
    throw new MicrophoneAccessError(
      "PERMISSION_DENIED",
      MIC_DENIED_RECOVERY,
      MIC_DENIED_RECOVERY,
      false,
    );
  }
  if (code === "DEVICE_NOT_FOUND") {
    throw new MicrophoneAccessError(
      "DEVICE_NOT_FOUND",
      MIC_NO_DEVICE_RECOVERY,
      MIC_NO_DEVICE_RECOVERY,
      true,
    );
  }
  if (code === "DEVICE_IN_USE") {
    throw new MicrophoneAccessError(
      "DEVICE_IN_USE",
      "Your microphone is being used by another app. Close other apps and try again.",
      "Close other apps using the microphone, then retry.",
      true,
    );
  }
  const message =
    original instanceof Error && original.message
      ? original.message
      : "Could not start the microphone.";
  throw new MicrophoneAccessError(
    "UNKNOWN",
    message,
    "Refresh the page and try again.",
    true,
  );
}

export function classifyGetUserMediaErrorCode(err: unknown): AudioErrorCode {
  const name =
    err && typeof err === "object" && "name" in err
      ? String((err as { name?: string }).name)
      : "";
  if (
    name === "NotAllowedError" ||
    name === "PermissionDeniedError" ||
    name === "SecurityError"
  ) {
    return "PERMISSION_DENIED";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "DEVICE_NOT_FOUND";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "DEVICE_IN_USE";
  }
  if (name === "OverconstrainedError") {
    return "DEVICE_NOT_FOUND";
  }
  return "UNKNOWN";
}

export function buildMicrophoneConstraints(
  deviceId?: string | null,
  options?: { noiseSuppression?: boolean; autoGainControl?: boolean },
): MediaStreamConstraints {
  return {
    audio: {
      echoCancellation: true,
      noiseSuppression: options?.noiseSuppression ?? true,
      autoGainControl: options?.autoGainControl ?? true,
      channelCount: 1,
      ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
    },
    video: false,
  };
}

function defaultGetUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new MicrophoneAccessError(
      "UNKNOWN",
      "Microphone capture is not supported in this browser.",
      "Use Chrome, Edge, or Firefox on a secure (HTTPS) page.",
      false,
    );
  }
  return navigator.mediaDevices.getUserMedia(constraints);
}

export async function acquireMicrophoneStream(
  input: AcquireMicrophoneInput = {},
  deps: AcquireMicrophoneDeps = {},
): Promise<AcquireMicrophoneResult> {
  const queryPermission = deps.queryPermission ?? getMicPermissionState;
  const getUserMedia = deps.getUserMedia ?? defaultGetUserMedia;
  const enumerateDevices =
    deps.enumerateDevices ??
    (async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return [];
      return navigator.mediaDevices.enumerateDevices();
    });

  const permission = await queryPermission();
  if (permission === "denied") {
    throwForCode("PERMISSION_DENIED");
  }

  if (permission === "granted") {
    try {
      const devices = await enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      if (devices.length > 0 && inputs.length === 0) {
        throwForCode("DEVICE_NOT_FOUND");
      }
    } catch (err) {
      if (err instanceof MicrophoneAccessError) throw err;
    }
  }

  const requestStream = async (deviceId?: string | null): Promise<MediaStream> =>
    getUserMedia(buildMicrophoneConstraints(deviceId, input));

  let stream: MediaStream;
  try {
    stream = await requestStream(input.deviceId);
  } catch (err) {
    const code = classifyGetUserMediaErrorCode(err);
    if (input.deviceId && code !== "PERMISSION_DENIED") {
      try {
        stream = await requestStream(null);
      } catch (retryErr) {
        throwForCode(classifyGetUserMediaErrorCode(retryErr), retryErr);
      }
    } else {
      throwForCode(code, err);
    }
  }

  return {
    stream,
    permission,
    browserPrompted: permission === "prompt",
  };
}

export function canHydrateDeviceLabels(permission: MicPermissionState): boolean {
  return permission === "granted";
}
