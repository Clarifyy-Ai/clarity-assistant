import type {
  AudioDevice,
  AudioError,
  AudioErrorCode,
} from "@/types/audio.types";
import { useAudioStore } from "@/store/audioStore";
import { captureSystemAudioViaTabShare } from "@/lib/capture/tabAudioCapture";
import { getCachedAudioDevices } from "@/lib/audio/audioDeviceCache";

// ─────────────────────────────────────────────────────────────────
// Audio Capture Engine
// Handles mic + system audio acquisition, device enumeration,
// stream merging via AudioContext, and clean teardown.
// ─────────────────────────────────────────────────────────────────

// ── Device enumeration ────────────────────────────────────────────

export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  try {
    return await getCachedAudioDevices();
  } catch (err) {
    throw buildAudioError("PERMISSION_DENIED", err);
  }
}

/**
 * Optional: watch device changes and refresh store.
 * Returns a cleanup function.
 */
export function watchAudioDevices(onChange: () => void): () => void {
  const handler = async () => {
    try {
      await enumerateAudioDevices(); // ensure permissions path is exercised
    } catch {
      // ignore fetch errors; we only need to trigger UI refresh
    } finally {
      onChange();
    }
  };
  navigator.mediaDevices?.addEventListener?.("devicechange", handler);
  return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
}

// ── Microphone capture ────────────────────────────────────────────

export async function captureMicrophone(
  deviceId?: string | null,
  options?: { noiseSuppression?: boolean; autoGainControl?: boolean },
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: options?.noiseSuppression ?? true,
      autoGainControl: options?.autoGainControl ?? true,
      sampleRate: 16000, // Deepgram optimal
      channelCount: 1,
    },
    video: false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
  } catch (err) {
    const code = getPermissionErrorCode(err);
    throw buildAudioError(code, err);
  }
}

// ── System audio capture ──────────────────────────────────────────
// Uses getDisplayMedia — captures tab/system audio from screen share
// The video track is immediately discarded.

export async function captureSystemAudio(): Promise<MediaStream> {
  try {
    // Route through the centralised tab-share helper so privacy hints are applied
    // (guides picker to "This Tab", suppresses monitor surfaces).
    return await captureSystemAudioViaTabShare({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      sampleRate: 16000,
    } as MediaTrackConstraints);
  } catch (err) {
    const name = (err as Error)?.name;
    if (name === "NotAllowedError") {
      throw buildAudioError("PERMISSION_DENIED", err);
    }
    throw buildAudioError("SYSTEM_AUDIO_NOT_SUPPORTED", err);
  }
}

// ── Stream merging ────────────────────────────────────────────────
// Merges mic + system audio into a single MediaStream using
// AudioContext. Both channels feed into one destination node.

let _audioContext: AudioContext | null = null;
let _merger: ChannelMergerNode | null = null;
let _destination: MediaStreamAudioDestinationNode | null = null;
let _micSource: MediaStreamAudioSourceNode | null = null;
let _sysSource: MediaStreamAudioSourceNode | null = null;

export function mergeAudioStreams(
  micStream: MediaStream,
  systemStream: MediaStream
): MediaStream {
  if (!_audioContext || _audioContext.state === "closed") {
    _audioContext = new AudioContext({ sampleRate: 16000 });
  }

  _destination = _audioContext.createMediaStreamDestination();

  _micSource = _audioContext.createMediaStreamSource(micStream);
  _sysSource = _audioContext.createMediaStreamSource(systemStream);

  // Mono mix — both sources into one channel for reliable Deepgram transcription
  _micSource.connect(_destination);
  _sysSource.connect(_destination);

  return _destination.stream;
}

// ── Audio level analyser ──────────────────────────────────────────
// Returns a function that samples current RMS level (0–1).

export function createLevelAnalyser(
  stream: MediaStream
): {
  getLevel: () => number;
  isSpeaking: (threshold?: number) => boolean;
  disconnect: () => void;
} {
  const ctx = new AudioContext({ sampleRate: 16000 });
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.3;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);

  function getLevel(): number {
    try {
      analyser.getFloatTimeDomainData(buffer);
    } catch {
      // If context was closed or node disconnected
      return 0;
    }
    const rms = Math.sqrt(buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length);
    return Math.min(1, rms * 8); // Scale to 0–1
  }

  function isSpeaking(threshold = 0.015): boolean {
    return getLevel() > threshold;
  }

  function disconnect(): void {
    try {
      source.disconnect();
      analyser.disconnect();
    } finally {
      ctx.close().catch((err) => console.error("[audioCapture] AudioContext.close failed:", err));
    }
  }

  return { getLevel, isSpeaking, disconnect };
}

// ── Stream teardown ───────────────────────────────────────────────

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

export function teardownAudioContext(): void {
  try {
    _micSource?.disconnect();
    _sysSource?.disconnect();
    _merger?.disconnect();
    _destination = null;
    _merger = null;
    _micSource = null;
    _sysSource = null;
    if (_audioContext && _audioContext.state !== "closed") {
      _audioContext.close();
      _audioContext = null;
    }
  } catch {
    // Ignore teardown errors
  }
}

// ── Track ended listener ──────────────────────────────────────────

export function watchStreamEnded(
  stream: MediaStream,
  onEnded: () => void
): () => void {
  const tracks = stream.getTracks();
  const handleEnded = () => onEnded();
  tracks.forEach((t) => t.addEventListener("ended", handleEnded));
  return () => {
    tracks.forEach((t) => t.removeEventListener("ended", handleEnded));
  };
}

// ── System audio support check ────────────────────────────────────

export function isSystemAudioSupported(): boolean {
  return (
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    /Chrome|Edge/i.test(navigator.userAgent)
  );
}

// ── Error builders ────────────────────────────────────────────────

function getPermissionErrorCode(err: unknown): AudioErrorCode {
  const name = (err as Error)?.name ?? "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError")
    return "PERMISSION_DENIED";
  if (name === "NotFoundError" || name === "DevicesNotFoundError")
    return "DEVICE_NOT_FOUND";
  if (name === "NotReadableError" || name === "TrackStartError")
    return "DEVICE_IN_USE";
  return "UNKNOWN";
}

function buildAudioError(code: AudioErrorCode, original: unknown): AudioError {
  const suggestions: Record<AudioErrorCode, string> = {
    PERMISSION_DENIED:
      "Click the lock icon in your browser address bar and allow microphone access.",
    DEVICE_NOT_FOUND:
      "No microphone detected. Plug in a microphone and refresh.",
    DEVICE_IN_USE:
      "Your microphone is being used by another app. Close other apps and try again.",
    SYSTEM_AUDIO_NOT_SUPPORTED:
      "System audio requires Chrome or Edge. Select 'Share audio' when prompted.",
    SYSTEM_AUDIO_FAILED:
      "System audio capture failed. Make sure you selected 'Share audio' in the dialog. Try again.",
    STREAM_ENDED:
      "Your audio stream stopped unexpectedly. Click 'Reconnect' to resume.",
    DEEPGRAM_CONNECTION_FAILED:
      "Transcription service unavailable. Check your internet connection.",
    DEEPGRAM_QUOTA_EXCEEDED:
      "Transcription quota exceeded. Upgrade your plan or try again later.",
    NOISE_TOO_HIGH:
      "Background noise is too high. Move to a quieter environment.",
    UNKNOWN:
      "An unknown audio error occurred. Refresh the page and try again.",
  };

  return {
    code,
    message: (original as Error)?.message ?? code,
    recoverable: code !== "PERMISSION_DENIED" && code !== "DEVICE_NOT_FOUND",
    suggestion: suggestions[code],
  };
}

export { buildAudioError };
