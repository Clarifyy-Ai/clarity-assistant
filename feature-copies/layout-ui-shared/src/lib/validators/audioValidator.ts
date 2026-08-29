// ─────────────────────────────────────────────────────────────────────────────
// audioValidator.ts — Validate audio devices, permissions, stream health,
// chunk integrity, sample rates, and mic quality before live sessions.
// ─────────────────────────────────────────────────────────────────────────────

import type { ValidationResult } from "./emailValidator";

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPORTED_SAMPLE_RATES   = [8000, 16000, 22050, 44100, 48000];
const MIN_SAMPLE_RATE          = 8000;
const MAX_SAMPLE_RATE          = 48000;
const DEEPGRAM_OPTIMAL_RATE    = 16000;
const MIN_CHUNK_DURATION_MS    = 20;
const MAX_CHUNK_DURATION_MS    = 2000;
const MIN_RMS_THRESHOLD        = 0.001;  // below = silence / dead mic
const CLIPPING_THRESHOLD       = 0.98;   // above = clipping
const MAX_AUDIO_FILE_SIZE_MB   = 25;
const SUPPORTED_AUDIO_FORMATS  = ["audio/wav", "audio/mp3", "audio/mpeg",
                                   "audio/ogg", "audio/webm", "audio/mp4"];

// ─── Types ────────────────────────────────────────────────────────────────────

export type AudioPermissionState = "granted" | "denied" | "prompt" | "unavailable";

export interface DeviceValidationResult extends ValidationResult {
  deviceId?: string;
  label?:    string;
}

export interface StreamValidationResult extends ValidationResult {
  sampleRate?:  number;
  channelCount?: number;
  isOptimal?:   boolean;
  warnings?:    string[];
}

export interface AudioQualityReport {
  rms:            number;
  peak:           number;
  isClipping:     boolean;
  isSilent:       boolean;
  signalToNoise:  "good" | "fair" | "poor";
  recommendation: string | null;
}

export interface AudioDeviceInfo {
  deviceId: string;
  label:    string;
  kind:     MediaDeviceKind;
  groupId:  string;
}

// ─── Browser Support ──────────────────────────────────────────────────────────

/**
 * Check if the current browser supports the required audio APIs.
 */
export function validateBrowserAudioSupport(): ValidationResult {
  if (typeof window === "undefined") {
    return { valid: false, error: "Audio is not available in this environment." };
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return {
      valid: false,
      error: "Your browser does not support microphone access. Please use Chrome, Firefox, or Edge.",
    };
  }

  if (typeof AudioContext === "undefined" && typeof (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext === "undefined") {
    return {
      valid: false,
      error: "Web Audio API is not supported in your browser.",
    };
  }

  if (!window.MediaRecorder) {
    return {
      valid: false,
      error: "MediaRecorder API is not supported. Please update your browser.",
    };
  }

  return { valid: true };
}

/**
 * Check if the app is running in a secure context (required for mic access).
 */
export function validateSecureContext(): ValidationResult {
  if (!window.isSecureContext) {
    return {
      valid: false,
      error: "Microphone access requires a secure connection (HTTPS). Please reload on a secure URL.",
    };
  }
  return { valid: true };
}

// ─── Permissions ──────────────────────────────────────────────────────────────

/**
 * Query the current mic permission state without triggering a prompt.
 */
export async function getMicPermissionState(): Promise<AudioPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions) return "unavailable";

  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state as AudioPermissionState;
  } catch {
    return "unavailable";
  }
}

/**
 * Validate that microphone permission has been granted.
 * Does NOT trigger a browser prompt — use for pre-flight checks.
 */
export async function validateMicPermission(): Promise<ValidationResult> {
  const browserSupport = validateBrowserAudioSupport();
  if (!browserSupport.valid) return browserSupport;

  const secureContext = validateSecureContext();
  if (!secureContext.valid) return secureContext;

  const state = await getMicPermissionState();

  switch (state) {
    case "granted":
      return { valid: true };
    case "denied":
      return {
        valid: false,
        error: "Microphone permission was denied. Please allow access in your browser settings and reload.",
      };
    case "prompt":
      return {
        valid: false,
        error: "Microphone permission is required. Please allow access when prompted.",
      };
    default:
      // Permissions API is missing or does not support "microphone" (Safari/Firefox).
      // That is not a hardware failure — local getUserMedia must decide.
      return { valid: true };
  }
}

// ─── Device Validation ────────────────────────────────────────────────────────

/**
 * Enumerate available audio input devices.
 * Returns empty array if permission is not granted.
 */
export async function getAudioInputDevices(): Promise<AudioDeviceInfo[]> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label:    d.label || `Microphone ${d.deviceId.slice(0, 6)}`,
        kind:     d.kind,
        groupId:  d.groupId,
      }));
  } catch {
    return [];
  }
}

/**
 * Validate that a specific device ID is available and accessible.
 */
export async function validateAudioDevice(deviceId: string): Promise<DeviceValidationResult> {
  if (!deviceId) {
    return { valid: false, error: "No audio device specified." };
  }

  const devices = await getAudioInputDevices();

  if (devices.length === 0) {
    return {
      valid: false,
      error: "No microphone devices found. Please connect a microphone and try again.",
    };
  }

  const device = devices.find((d) => d.deviceId === deviceId);

  if (!device) {
    // Default device may still be usable
    const defaultDevice = devices.find((d) => d.deviceId === "default") ?? devices[0];
    return {
      valid:    true,
      deviceId: defaultDevice.deviceId,
      label:    defaultDevice.label,
      warnings: [`Device "${deviceId}" not found. Using "${defaultDevice.label}" instead.`],
    };
  }

  return { valid: true, deviceId: device.deviceId, label: device.label };
}

/**
 * Check that at least one audio input device is available.
 */
export async function validateAudioDevicesAvailable(): Promise<ValidationResult> {
  const devices = await getAudioInputDevices();

  if (devices.length === 0) {
    return {
      valid: false,
      error: "No microphone found. Please connect a microphone to continue.",
    };
  }

  return { valid: true };
}

// ─── Stream Validation ────────────────────────────────────────────────────────

/**
 * Validate a live MediaStream for audio readiness.
 * Checks track status, sample rate, and channel configuration.
 */
export function validateAudioStream(stream: MediaStream): StreamValidationResult {
  const tracks = stream.getAudioTracks();

  if (tracks.length === 0) {
    return { valid: false, error: "MediaStream has no audio tracks." };
  }

  const track = tracks[0];

  if (track.readyState === "ended") {
    return { valid: false, error: "Audio track has ended. The microphone may have been disconnected." };
  }

  if (!track.enabled) {
    return { valid: false, error: "Audio track is disabled (muted at the hardware level)." };
  }

  const settings    = track.getSettings();
  const sampleRate  = settings.sampleRate ?? 0;
  const channelCount = settings.channelCount ?? 1;
  const warnings: string[] = [];

  if (sampleRate && !SUPPORTED_SAMPLE_RATES.includes(sampleRate)) {
    warnings.push(`Unusual sample rate detected (${sampleRate}Hz). Audio quality may be affected.`);
  }

  if (sampleRate && sampleRate < DEEPGRAM_OPTIMAL_RATE) {
    warnings.push(`Sample rate ${sampleRate}Hz is below optimal (${DEEPGRAM_OPTIMAL_RATE}Hz). Transcription accuracy may be reduced.`);
  }

  if (channelCount > 2) {
    warnings.push(`${channelCount} channels detected. Audio will be downmixed to mono.`);
  }

  return {
    valid:        true,
    sampleRate:   sampleRate || undefined,
    channelCount: channelCount,
    isOptimal:    sampleRate === DEEPGRAM_OPTIMAL_RATE && channelCount === 1,
    warnings:     warnings.length ? warnings : undefined,
  };
}

/**
 * Validate MediaStream constraints before calling getUserMedia.
 */
export function validateAudioConstraints(
  constraints: MediaStreamConstraints
): ValidationResult {
  const audio = constraints.audio;
  if (!audio) {
    return { valid: false, error: "Audio must be included in constraints." };
  }

  if (typeof audio === "object") {
    const { sampleRate } = audio as MediaTrackConstraints;

    if (sampleRate !== undefined) {
      const rate = typeof sampleRate === "number"
        ? sampleRate
        : (sampleRate as ConstrainULongRange).ideal ?? 0;

      if (rate < MIN_SAMPLE_RATE || rate > MAX_SAMPLE_RATE) {
        return {
          valid: false,
          error: `Sample rate ${rate}Hz is out of supported range (${MIN_SAMPLE_RATE}–${MAX_SAMPLE_RATE}Hz).`,
        };
      }
    }
  }

  return { valid: true };
}

// ─── Audio Chunk Validation ───────────────────────────────────────────────────

/**
 * Validate a raw audio chunk before it is sent to Deepgram or processed.
 */
export function validateAudioChunk(
  data: Float32Array | Int16Array | ArrayBuffer,
  sampleRate: number,
  durationMs?: number
): ValidationResult {
  let length: number;

  if (data instanceof ArrayBuffer) {
    length = data.byteLength;
  } else {
    length = data.length;
  }

  if (length === 0) {
    return { valid: false, error: "Audio chunk is empty." };
  }

  if (!SUPPORTED_SAMPLE_RATES.includes(sampleRate)) {
    return {
      valid: false,
      error: `Unsupported sample rate: ${sampleRate}Hz. Supported: ${SUPPORTED_SAMPLE_RATES.join(", ")}.`,
    };
  }

  if (durationMs !== undefined) {
    if (durationMs < MIN_CHUNK_DURATION_MS) {
      return {
        valid: false,
        error: `Chunk duration ${durationMs}ms is too short. Minimum is ${MIN_CHUNK_DURATION_MS}ms.`,
      };
    }
    if (durationMs > MAX_CHUNK_DURATION_MS) {
      return {
        valid: false,
        error: `Chunk duration ${durationMs}ms exceeds maximum ${MAX_CHUNK_DURATION_MS}ms.`,
      };
    }
  }

  return { valid: true };
}

// ─── Audio Quality Analysis ───────────────────────────────────────────────────

/**
 * Analyse a Float32Array audio buffer and return a quality report.
 * Used to detect dead mics, clipping, and poor signal.
 *
 * @example
 * const report = analyseAudioQuality(float32Buffer);
 * if (report.isClipping) toast.warn("Microphone volume is too high.");
 * if (report.isSilent)   toast.warn("No audio detected. Check your mic.");
 */
export function analyseAudioQuality(samples: Float32Array): AudioQualityReport {
  let sumSquares = 0;
  let peak       = 0;
  let clippingCount = 0;

  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    sumSquares += samples[i] * samples[i];
    if (abs > peak) peak = abs;
    if (abs >= CLIPPING_THRESHOLD) clippingCount++;
  }

  const rms        = Math.sqrt(sumSquares / samples.length);
  const isSilent   = rms < MIN_RMS_THRESHOLD;
  const isClipping = clippingCount / samples.length > 0.01; // >1% clipping

  let signalToNoise: AudioQualityReport["signalToNoise"];
  if (rms > 0.1)       signalToNoise = "good";
  else if (rms > 0.01) signalToNoise = "fair";
  else                 signalToNoise = "poor";

  let recommendation: string | null = null;
  if (isClipping)  recommendation = "Lower your microphone input volume to avoid distortion.";
  else if (isSilent) recommendation = "No audio detected. Check that your microphone is connected and unmuted.";
  else if (signalToNoise === "poor") recommendation = "Microphone signal is weak. Move closer to the mic or increase input volume.";

  return { rms, peak, isClipping, isSilent, signalToNoise, recommendation };
}

// ─── Sample Rate ──────────────────────────────────────────────────────────────

export function validateSampleRate(rate: number): ValidationResult {
  if (!rate || rate <= 0) {
    return { valid: false, error: "Sample rate must be a positive number." };
  }
  if (!SUPPORTED_SAMPLE_RATES.includes(rate)) {
    return {
      valid:    false,
      error:    `Sample rate ${rate}Hz is not supported.`,
      warnings: [`Supported rates: ${SUPPORTED_SAMPLE_RATES.join(", ")}Hz`],
    };
  }
  return { valid: true };
}

export function isOptimalForDeepgram(sampleRate: number): boolean {
  return sampleRate === DEEPGRAM_OPTIMAL_RATE;
}

// ─── Audio File ───────────────────────────────────────────────────────────────

/**
 * Validate an audio file before upload or processing.
 */
export function validateAudioFile(file: File): ValidationResult {
  if (!file) {
    return { valid: false, error: "No file provided." };
  }

  const maxBytes = MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `Audio file is too large. Maximum size is ${MAX_AUDIO_FILE_SIZE_MB}MB. Your file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: "Audio file is empty." };
  }

  if (!SUPPORTED_AUDIO_FORMATS.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported audio format: "${file.type}". Supported formats: WAV, MP3, OGG, WebM, MP4.`,
    };
  }

  return { valid: true };
}

// ─── Pre-Session Preflight ────────────────────────────────────────────────────

export interface PreflightReport {
  ready:    boolean;
  errors:   string[];
  warnings: string[];
}

/**
 * Run all audio checks before starting a live session.
 * Returns a consolidated readiness report.
 *
 * @example
 * const report = await runAudioPreflight();
 * if (!report.ready) showErrors(report.errors);
 */
export async function runAudioPreflight(): Promise<PreflightReport> {
  const errors:   string[] = [];
  const warnings: string[] = [];

  // 1. Browser support
  const browser = validateBrowserAudioSupport();
  if (!browser.valid) errors.push(browser.error!);

  // 2. Secure context
  const secure = validateSecureContext();
  if (!secure.valid) errors.push(secure.error!);

  // 3. Permission state
  const perm = await validateMicPermission();
  if (!perm.valid) errors.push(perm.error!);

  // 4. Devices available
  if (perm.valid) {
    const devices = await validateAudioDevicesAvailable();
    if (!devices.valid) errors.push(devices.error!);
  }

  return {
    ready:    errors.length === 0,
    errors,
    warnings,
  };
}
