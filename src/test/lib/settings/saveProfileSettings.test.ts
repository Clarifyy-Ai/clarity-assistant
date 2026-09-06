import { describe, expect, it, vi, beforeEach } from "vitest";
import { saveProfileSettings, requireSettingsUser } from "@/lib/settings/saveProfileSettings";

const updateProfile = vi.fn();

vi.mock("@/store/authStore", () => ({
  useAuthStore: {
    getState: () => ({
      user: { id: "user-1" },
      updateProfile,
    }),
  },
}));

describe("saveProfileSettings", () => {
  beforeEach(() => {
    updateProfile.mockReset();
    updateProfile.mockResolvedValue(undefined);
  });

  it("persists using auth user id without requiring profile in memory", async () => {
    await saveProfileSettings({ privacy_prefs: { share_scorecard: false } as never });
    expect(updateProfile).toHaveBeenCalledWith({ privacy_prefs: { share_scorecard: false } });
  });

  it("returns null when signed out", () => {
    vi.mocked(requireSettingsUser);
    expect(requireSettingsUser()).toBe("user-1");
  });
});
