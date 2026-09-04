/**
 * Normalized audio-channel health for live overlay diagnostics.
 * Metrics are non-sensitive (counts, timestamps, track flags) — never PCM or transcript text.
 */

export const SILENT_SOURCE_GRACE_MS = 10_000;
export const ENERGY_THRESHOLD = 0.01;
export const RECENT_ENERGY_MS = 5_000;
export const RECENT_TRANSCRIPT_MS = 15_000;

export type AudioChannelHealthStatus =
  | "disconnected"
  | "connecting"
  | "active"
  | "silent_source"
  | "unavailable";

export type AudioChannelMetrics = {
  /** MediaStream object present in the session. */
  hasStream: boolean;
  trackReadyState: "live" | "ended" | "none";
  trackEnabled: boolean;
  /** Browser MediaStreamTrack.muted (not app mute). */
  trackMuted: boolean;
  receivedFrameCount: number;
  transmittedFrameCount: number;
  /** Frames dropped because WebSocket was not OPEN. */
  queuedFrameCount: number;
  rmsLevel: number;
  lastEnergyAt: number | null;
  sttSocketOpen: boolean;
  sttStatus: "idle" | "connecting" | "connected" | "reconnecting" | "error" | "unavailable";
  lastKeepAliveAt: number | null;
  lastSttMessageAt: number | null;
  lastTranscriptEventAt: number | null;
  /** Wall clock when we began expecting frames on this channel. */
  monitoringStartedAt: number | null;
  connectFailed: boolean;
  fatalError: boolean;
};

export type AudioChannelHealthSnapshot = {
  status: AudioChannelHealthStatus;
  metrics: AudioChannelMetrics;
};

export const EMPTY_CHANNEL_METRICS: AudioChannelMetrics = {
  hasStream: false,
  trackReadyState: "none",
  trackEnabled: false,
  trackMuted: false,
  receivedFrameCount: 0,
  transmittedFrameCount: 0,
  queuedFrameCount: 0,
  rmsLevel: 0,
  lastEnergyAt: null,
  sttSocketOpen: false,
  sttStatus: "idle",
  lastKeepAliveAt: null,
  lastSttMessageAt: null,
  lastTranscriptEventAt: null,
  monitoringStartedAt: null,
  connectFailed: false,
  fatalError: false,
};

export function emptyChannelHealth(): AudioChannelHealthSnapshot {
  return {
    status: "disconnected",
    metrics: { ...EMPTY_CHANNEL_METRICS },
  };
}

/**
 * Derive a single UI/session health status from metrics.
 * Never returns `active` merely because a MediaStream object exists.
 */
export function deriveChannelHealth(
  m: AudioChannelMetrics,
  now: number = Date.now(),
): AudioChannelHealthStatus {
  if (m.fatalError || m.connectFailed) return "unavailable";
  if (!m.hasStream || m.trackReadyState === "ended" || m.trackReadyState === "none") {
    return "disconnected";
  }
  if (m.sttStatus === "error" || m.sttStatus === "unavailable") return "unavailable";
  if (!m.trackEnabled) return "unavailable";
  // Browser-muted tracks (capture muted) cannot produce usable interviewer audio.
  if (m.trackMuted && m.hasStream) {
    const monitorStart = m.monitoringStartedAt ?? now;
    if (now - monitorStart >= SILENT_SOURCE_GRACE_MS) return "silent_source";
  }

  if (
    m.sttStatus === "connecting" ||
    m.sttStatus === "reconnecting" ||
    (m.sttStatus !== "connected" && !m.sttSocketOpen)
  ) {
    return "connecting";
  }

  if (!m.sttSocketOpen) return "connecting";

  const framesFlowing = m.transmittedFrameCount > 0 || m.receivedFrameCount > 0;
  if (!framesFlowing) return "connecting";

  const hasRecentEnergy =
    m.rmsLevel >= ENERGY_THRESHOLD ||
    (m.lastEnergyAt != null && now - m.lastEnergyAt <= RECENT_ENERGY_MS);
  const hasRecentTranscript =
    m.lastTranscriptEventAt != null &&
    now - m.lastTranscriptEventAt <= RECENT_TRANSCRIPT_MS;

  if (hasRecentEnergy || hasRecentTranscript) return "active";

  const monitorStart = m.monitoringStartedAt ?? now;
  if (now - monitorStart < SILENT_SOURCE_GRACE_MS) {
    return "connecting";
  }

  return "silent_source";
}

export function buildChannelHealth(
  metrics: AudioChannelMetrics,
  now: number = Date.now(),
): AudioChannelHealthSnapshot {
  return {
    status: deriveChannelHealth(metrics, now),
    metrics,
  };
}

/** Green "Active" / "Tab audio" — real flow only. */
export function isChannelUiActive(status: AudioChannelHealthStatus): boolean {
  return status === "active";
}

/** Stream is expected / present (including connecting or silent). */
export function isChannelPresent(status: AudioChannelHealthStatus): boolean {
  return status === "active" || status === "connecting" || status === "silent_source";
}

/** Toolbar toggle "ON" — share acquired and not failed/disconnected. */
export function isSystemAudioToggleOn(status: AudioChannelHealthStatus): boolean {
  return isChannelPresent(status);
}

export const TAB_AUDIO_STATUS_COPY: Record<AudioChannelHealthStatus, string> = {
  disconnected: "Mic only",
  connecting: "Tab audio connecting",
  active: "Tab audio",
  silent_source: "Tab audio silent",
  unavailable: "Tab audio unavailable",
};

export const SYSTEM_AUDIO_AUDIT_COPY: Record<AudioChannelHealthStatus, string> = {
  disconnected: "Off",
  connecting: "Connecting",
  active: "Active",
  silent_source: "Silent source",
  unavailable: "Unavailable",
};

export function tabAudioTitle(status: AudioChannelHealthStatus): string {
  switch (status) {
    case "active":
      return "Interviewer tab audio flowing — frames and energy/transcripts detected";
    case "connecting":
      return "Tab audio acquired — waiting for STT frames or speech";
    case "silent_source":
      return "Tab share is connected but no audible interviewer audio — check Share tab audio, meeting mute, or shared surface";
    case "unavailable":
      return "Interviewer tab audio failed or track disabled";
    default:
      return "Mic only — share tab audio to capture interviewer";
  }
}

/** When system audio is enabled, transcription chip uses the worse of mic vs interviewer. */
export function worstTranscriptionHealth(
  mic: AudioChannelHealthStatus,
  interviewer: AudioChannelHealthStatus,
  systemAudioExpected: boolean,
): AudioChannelHealthStatus {
  if (!systemAudioExpected) return mic;
  const rank: Record<AudioChannelHealthStatus, number> = {
    active: 4,
    connecting: 3,
    silent_source: 2,
    unavailable: 1,
    disconnected: 0,
  };
  return rank[interviewer] <= rank[mic] ? interviewer : mic;
}

export function readTrackFlags(stream: MediaStream | null | undefined): Pick<
  AudioChannelMetrics,
  "hasStream" | "trackReadyState" | "trackEnabled" | "trackMuted"
> {
  if (!stream) {
    return {
      hasStream: false,
      trackReadyState: "none",
      trackEnabled: false,
      trackMuted: false,
    };
  }
  const track = stream.getAudioTracks()[0];
  if (!track) {
    return {
      hasStream: true,
      trackReadyState: "none",
      trackEnabled: false,
      trackMuted: false,
    };
  }
  return {
    hasStream: true,
    trackReadyState: track.readyState === "live" ? "live" : "ended",
    trackEnabled: track.enabled !== false,
    trackMuted: track.muted === true,
  };
}

export type DeepgramFrameHealthSnapshot = {
  receivedFrameCount: number;
  transmittedFrameCount: number;
  queuedFrameCount: number;
  sttSocketOpen: boolean;
  lastKeepAliveAt: number | null;
  lastSttMessageAt: number | null;
};

export function mergeFrameHealth(
  base: AudioChannelMetrics,
  frames: DeepgramFrameHealthSnapshot | null,
): AudioChannelMetrics {
  if (!frames) return base;
  return {
    ...base,
    receivedFrameCount: frames.receivedFrameCount,
    transmittedFrameCount: frames.transmittedFrameCount,
    queuedFrameCount: frames.queuedFrameCount,
    sttSocketOpen: frames.sttSocketOpen,
    lastKeepAliveAt: frames.lastKeepAliveAt,
    lastSttMessageAt: frames.lastSttMessageAt,
  };
}
