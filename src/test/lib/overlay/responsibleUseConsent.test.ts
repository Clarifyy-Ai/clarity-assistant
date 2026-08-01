import { describe, it, expect, beforeEach } from "vitest";
import {
  RESPONSIBLE_USE_NOTICE,
  acceptResponsibleUseConsent,
  canStartCoachingSession,
  clearResponsibleUseConsent,
  hasResponsibleUseConsent,
} from "@/lib/overlay/responsibleUseConsent";
import {
  canTransition,
  overlayStateLabel,
  overlayStateRecovery,
  transitionOverlayState,
} from "@/lib/overlay/overlaySessionStates";

describe("responsibleUseConsent", () => {
  beforeEach(() => {
    clearResponsibleUseConsent();
  });

  it("includes permitted-use notice text", () => {
    expect(RESPONSIBLE_USE_NOTICE).toMatch(/permitted/i);
    expect(RESPONSIBLE_USE_NOTICE).toMatch(/consent/i);
  });

  it("persists acceptance", () => {
    expect(hasResponsibleUseConsent()).toBe(false);
    acceptResponsibleUseConsent();
    expect(hasResponsibleUseConsent()).toBe(true);
  });

  it("blocks start without acknowledgments", () => {
    expect(
      canStartCoachingSession({
        visibilityAcknowledged: false,
        responsibleUseAcknowledged: true,
        micGranted: true,
      }).ok,
    ).toBe(false);
    expect(
      canStartCoachingSession({
        visibilityAcknowledged: true,
        responsibleUseAcknowledged: false,
        micGranted: true,
      }).ok,
    ).toBe(false);
    expect(
      canStartCoachingSession({
        visibilityAcknowledged: true,
        responsibleUseAcknowledged: true,
        micGranted: false,
      }).ok,
    ).toBe(false);
  });

  it("allows start when mic + both acks are present", () => {
    expect(
      canStartCoachingSession({
        visibilityAcknowledged: true,
        responsibleUseAcknowledged: true,
        micGranted: true,
      }),
    ).toEqual({ ok: true });
  });
});

describe("overlaySessionStates", () => {
  it("allows listening → speech_detected → transcribing", () => {
    expect(canTransition("listening", "speech_detected")).toBe(true);
    expect(canTransition("speech_detected", "transcribing")).toBe(true);
    expect(canTransition("transcribing", "question_detected")).toBe(true);
  });

  it("rejects illegal jumps", () => {
    expect(canTransition("idle", "guidance_ready")).toBe(false);
    expect(transitionOverlayState("idle", "guidance_ready")).toBe("idle");
  });

  it("provides accessible labels and recovery text", () => {
    expect(overlayStateLabel("insufficient_credits")).toMatch(/credit/i);
    expect(overlayStateRecovery("permission_denied")).toMatch(/microphone/i);
  });
});
