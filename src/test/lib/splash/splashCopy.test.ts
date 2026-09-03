import { describe, expect, it } from "vitest";
import {
  resolveSplashMessage,
  SPLASH_MESSAGES,
  SPLASH_SUPPORTING,
} from "@/lib/splash/splashCopy";

describe("resolveSplashMessage", () => {
  it("lets offline win over electron, route, and returning user", () => {
    expect(
      resolveSplashMessage({
        pathname: "/app/documents",
        isElectron: true,
        hasUser: true,
        offline: true,
      }),
    ).toBe(SPLASH_MESSAGES.offline);
  });

  it("lets electron win over route copy", () => {
    expect(
      resolveSplashMessage({
        pathname: "/app/documents",
        isElectron: true,
        hasUser: true,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.electron);
  });

  it("uses Practice Coach copy on the practice workspace", () => {
    expect(
      resolveSplashMessage({
        pathname: "/app/practice-workspace",
        isElectron: false,
        hasUser: false,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.practiceCoach);
  });

  it("uses live/audio copy for Live Copilot and overlay", () => {
    expect(
      resolveSplashMessage({
        pathname: "/app/live",
        isElectron: false,
        hasUser: true,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.live);
    expect(
      resolveSplashMessage({
        pathname: "/app/live/overlay",
        isElectron: false,
        hasUser: true,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.live);
  });

  it("treats mock-test as exam prep before mock interview", () => {
    expect(
      resolveSplashMessage({
        pathname: "/app/mock-test/configure",
        isElectron: false,
        hasUser: true,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.govExams);
    expect(
      resolveSplashMessage({
        pathname: "/app/mock/session/abc",
        isElectron: false,
        hasUser: true,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.mock);
  });

  it("uses documents and analytics route copy", () => {
    expect(
      resolveSplashMessage({
        pathname: "/app/documents/resume/1",
        isElectron: false,
        hasUser: false,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.documents);
    expect(
      resolveSplashMessage({
        pathname: "/app/analytics",
        isElectron: false,
        hasUser: false,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.analytics);
  });

  it("welcomes returning users when no route-specific line applies", () => {
    expect(
      resolveSplashMessage({
        pathname: "/app/dashboard",
        isElectron: false,
        hasUser: true,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.returning);
  });

  it("uses first-visit copy for logged-out users", () => {
    expect(
      resolveSplashMessage({
        pathname: "/",
        isElectron: false,
        hasUser: false,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.firstVisit);
    expect(
      resolveSplashMessage({
        pathname: "/login",
        isElectron: false,
        hasUser: false,
        offline: false,
      }),
    ).toBe(SPLASH_MESSAGES.firstVisit);
  });

  it("never interpolates private user or document content", () => {
    const message = resolveSplashMessage({
      pathname: "/app/documents/resume/secret-id",
      isElectron: false,
      hasUser: true,
      offline: false,
    });
    expect(message).not.toMatch(/@/);
    expect(message).not.toContain("secret-id");
    expect(message).not.toContain("resume/");
    expect(SPLASH_SUPPORTING).not.toMatch(/@/);
  });
});
