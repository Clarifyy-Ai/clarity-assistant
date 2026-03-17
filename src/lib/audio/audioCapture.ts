import type {
  AudioDevice,
  AudioError,
  AudioErrorCode,
} from "@/types/audio.types";
import { useAudioStore } from "@/store/audioStore";

// ─────────────────────────────────────────────────────────────────
// Audio Capture Engine
// Handles mic + system audio acquisition, device enumeration,
// stream merging via AudioContext, and clean teardown.
// ─────────────────────────────────────────────────────────────────

// ── Device enumeration ────────────────────────────────────────────

export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  try {
    // Request mic permission first so labels are populated
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach((t) => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({
        deviceId: d.deviceId,
        label:    d.label || `Microphone ${i + 1}`,
        kind:     "audioinput" as const,
        isDefault: d.deviceId === "default" || i === 0,
      }));
  } catch (err) {
    throw buildAudioError("PERMISSION_DENIED", err);
  }
}

// ── Microphone capture ────────────────────────────────────────────

export async function captureMicrophone(
  deviceId?: string | null
): Promise<MediaStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId:           deviceId ? { exact: deviceId } : undefined,
      echoCancellation:   true,
      noiseSuppression:   true,
      autoGainControl:    true,
      sampleRate:         16000,   // Deepgram optimal
      channelCount:       1,
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
  if (!navigator.mediaDevices.getDisplayMedia) {
    throw buildAudioError(
      "SYSTEM_AUDIO_NOT_SUPPORTED",
      new Error("getDisplayMedia not supported in this browser")
    );
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: {
        echoCancellation:  false,
        noiseSuppression:  false,
        autoGainControl:   false,
        sampleRate:        16000,
      },
      video: {
        width:  { ideal: 1 },  // Minimal video — user just shares the tab
        height: { ideal: 1 },
      },
    });

    // Stop video tracks immediately — we only need audio
    stream.getVideoTracks().forEach((t) => t.stop());

    if (stream.getAudioTracks().length === 0) {
      throw buildAudioError(
        "SYSTEM_AUDIO_NOT_SUPPORTED",
        new Error("No audio track in display media stream. Ensure 'Share audio' was checked.")
      );
    }

    return stream;
  } catch (err) {
    if ((err as Error).name === "NotAllowedError") {
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
  // Reuse existing AudioContext if available
  if (!_audioContext || _audioContext.state === "closed") {
    _audioContext = new AudioContext({ sampleRate: 16000 });
  }

  _destination = _audioContext.createMediaStreamDestination();
  _merger = _audioContext.createChannelMerger(2);

  _micSource = _audioContext.createMediaStreamSource(micStream);
  _sysSource = _audioContext.createMediaStreamSource(systemStream);

  // Connect both to merger, merger to destination
  _micSource.connect(_merger, 0, 0);
  _sysSource.connect(_merger, 0, 1);
  _merger.connect(_destination);

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
    analyser.getFloatTimeDomainData(buffer);
    const rms = Math.sqrt(
      buffer.reduce((sum, v) => sum + v * v, 0) / buffer.length
    );
    return Math.min(1, rms * 8); // Scale to 0–1
  }

  function isSpeaking(threshold = 0.015): boolean {
    return getLevel() > threshold;
  }

  function disconnect(): void {
    source.disconnect();
    analyser.disconnect();
    ctx.close().catch(() => {});
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
    suggestion:  suggestions[code],
  };
}

export { buildAudioError };
