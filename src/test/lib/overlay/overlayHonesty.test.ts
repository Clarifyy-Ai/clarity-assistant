import { beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CAPTURE_EXCLUSION_DISCLAIMER,
  CAPTURE_EXCLUSION_STATUS_LABEL,
  enableContentProtection,
  getCaptureExclusionStatus,
  getSupportInfo,
} from "@/lib/overlay/screenCaptureEvasion";
import { useOverlayStore } from "@/store/overlayStore";
import { useSessionStore } from "@/store/sessionStore";
import { useAudioStore } from "@/store/audioStore";
import {
  getSystemAudioAvailability,
  isSystemAudioFullyAvailable,
} from "@/lib/platform/electronRoutes";
import {
  handleSessionStartError,
  isSessionStartConflictError,
  sessionStartConflictMessage,
  SESSION_START_CONFLICT_MESSAGES,
} from "@/lib/billing/sessionStartErrors";
import { ApiClientError } from "@/lib/api/apiClient";

describe("overlay capture-exclusion honesty", () => {
  it("enableContentProtection never claims success", async () => {
    await expect(enableContentProtection()).resolves.toBe(false);
  });

  it("exposes Supported / Unsupported / Not Verified / Not Guaranteed labels", () => {
    expect(CAPTURE_EXCLUSION_STATUS_LABEL.supported).toBe("Supported");
    expect(CAPTURE_EXCLUSION_STATUS_LABEL.unsupported).toBe("Unsupported");
    expect(CAPTURE_EXCLUSION_STATUS_LABEL.not_verified).toBe("Not Verified");
    expect(CAPTURE_EXCLUSION_STATUS_LABEL.not_guaranteed).toBe("Not Guaranteed");
  });

  it("getSupportInfo never reports Supported while protection is disabled", async () => {
    await enableContentProtection();
    const info = getSupportInfo();
    expect(info.exclusionEnabled).toBe(false);
    expect(info.status).not.toBe("supported");
    expect(info.level).toBe(info.status);
    expect(info.label).toBe(CAPTURE_EXCLUSION_STATUS_LABEL[info.status]);
    expect(info.disclaimerRequired).toBe(true);
    expect(info.disclaimer).toBe(CAPTURE_EXCLUSION_DISCLAIMER);
    expect(info.defeats).toEqual([]);
    expect(getCaptureExclusionStatus()).toBe(info.status);
  });

  it("browser reports Unsupported (not Supported)", () => {
    const info = getSupportInfo();
    expect(info.status).toBe("unsupported");
    expect(info.label).toBe("Unsupported");
  });

  it("requires the screen-share disclaimer before any exclusion claim", () => {
    expect(CAPTURE_EXCLUSION_DISCLAIMER).toMatch(/cannot guarantee/i);
    expect(CAPTURE_EXCLUSION_DISCLAIMER).toMatch(/Test the configuration/i);
    expect(getSupportInfo().disclaimer).toContain("operating system");
  });
});

describe("minimize / hide must not end session or wipe state", () => {
  beforeEach(() => {
    useOverlayStore.getState().resetSessionState();
    useSessionStore.getState().resetSession();
    useAudioStore.getState().resetAudio();
  });

  it("minimizeOverlay only toggles visibility — keeps hint/transcript session fields", () => {
    useOverlayStore.setState({
      is_visible: true,
      current_question: "Tell me about a conflict",
      current_hint: "Use STAR",
      hint_history: [
        {
          question: "Tell me about a conflict",
          hint: "Use STAR",
          timestamp: Date.now(),
        },
      ],
      session_start_time: 1_700_000_000_000,
    });
    useSessionStore.setState({
      session_id: "sess-keep",
      status: "active",
    } as never);
    useAudioStore.setState({
      transcript: {
        ...useAudioStore.getState().transcript,
        full_transcript: "Interviewer: hello",
      },
    });

    useOverlayStore.getState().minimizeOverlay();

    const overlay = useOverlayStore.getState();
    expect(overlay.is_visible).toBe(false);
    expect(overlay.is_peek_active).toBe(true);
    expect(overlay.current_question).toBe("Tell me about a conflict");
    expect(overlay.current_hint).toBe("Use STAR");
    expect(overlay.hint_history).toHaveLength(1);
    expect(overlay.session_start_time).toBe(1_700_000_000_000);

    expect(useSessionStore.getState().session_id).toBe("sess-keep");
    expect(useSessionStore.getState().status).toBe("active");
    expect(useAudioStore.getState().transcript.full_transcript).toBe("Interviewer: hello");
  });

  it("hideOverlay does not clear transcripts or change session status", () => {
    useOverlayStore.setState({
      is_visible: true,
      current_question: "Q",
      hint_history: [{ question: "Q", hint: "A", timestamp: 1 }],
    });
    useSessionStore.setState({ session_id: "sess-2", status: "active" } as never);
    useAudioStore.setState({
      transcript: {
        ...useAudioStore.getState().transcript,
        full_transcript: "keep me",
      },
    });

    useOverlayStore.getState().hideOverlay();

    expect(useOverlayStore.getState().is_visible).toBe(false);
    expect(useOverlayStore.getState().current_question).toBe("Q");
    expect(useOverlayStore.getState().hint_history).toHaveLength(1);
    expect(useSessionStore.getState().status).toBe("active");
    expect(useAudioStore.getState().transcript.full_transcript).toBe("keep me");
  });
});

describe("browser must not claim full system audio", () => {
  it("reports limited or unavailable outside Electron", () => {
    expect(isSystemAudioFullyAvailable()).toBe(false);
    expect(getSystemAudioAvailability()).not.toBe("desktop_full");
  });
});

describe("session-start conflict surfacing", () => {
  it("maps conflict codes to actionable messages", () => {
    const err = new ApiClientError({
      message: "conflict",
      status: 409,
      code: "SESSION_STATE_CONFLICT",
    });
    expect(isSessionStartConflictError(err)).toBe(true);
    expect(sessionStartConflictMessage(err)).toBe(
      SESSION_START_CONFLICT_MESSAGES.SESSION_STATE_CONFLICT,
    );
    expect(sessionStartConflictMessage(err)).toMatch(/active Live Copilot session/i);
  });

  it("handleSessionStartError toasts conflict codes", () => {
    const handled = handleSessionStartError(
      new ApiClientError({
        message: "gone",
        status: 409,
        code: "SESSION_NOT_AVAILABLE",
      }),
    );
    expect(handled).toBe(true);
  });

  it("useLiveCopilot surfaces conflicts via handleSessionStartError (contract)", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/hooks/useLiveCopilot.ts"),
      "utf8",
    );
    expect(source).toContain('from "@/lib/billing/sessionStartErrors"');
    expect(source).toContain("handleSessionStartError(normalized)");
    expect(source).toContain("cancelSessionOnFailure");
    expect(source).toContain('terminal_reason: "CANCELLED"');
  });
});
