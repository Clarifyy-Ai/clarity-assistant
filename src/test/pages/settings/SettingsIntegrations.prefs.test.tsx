import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const updateProfile = vi.fn();
const authState = {
  user: { id: "user-1" },
  profile: {
    notification_prefs: {
      session_complete: true,
      integrations: { calendar_auto_create: true, calendar_auto_import: true },
    },
  } as Record<string, unknown>,
  updateProfile,
};

vi.mock("@/store/userStore", () => ({
  useAuthStore: () => authState,
}));

vi.mock("@/hooks/useCalendarSync", () => ({
  useCalendarSync: () => ({
    connectGoogle: vi.fn(),
    syncNow: vi.fn(),
    disconnect: vi.fn(),
    isSyncing: false,
    isDisconnecting: false,
    isConnecting: false,
    isCheckingConnection: false,
    isProbingSync: false,
    isConnected: false,
    reauthRequired: false,
    connectionStatus: "not_configured",
    googleEmail: null,
    syncAvailable: false,
    lastSynced: null,
    importedCount: null,
    error: "Google Calendar sync is not configured on this environment.",
  }),
}));

vi.mock("@/components/layout/PlanGate", () => ({
  FeatureKillGate: ({ children }: { children: unknown }) => children,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

import SettingsIntegrations from "@/pages/app/settings/SettingsIntegrations";

describe("SettingsIntegrations persistable calendar prefs", () => {
  beforeEach(() => {
    updateProfile.mockReset();
    updateProfile.mockImplementation(async (updates: Record<string, unknown>) => {
      authState.profile = { ...authState.profile, ...updates };
    });
    authState.profile = {
      notification_prefs: {
        session_complete: true,
        integrations: { calendar_auto_create: true, calendar_auto_import: true },
      },
    };
  });

  it("saves a toggle into notification_prefs.integrations without dropping other keys", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SettingsIntegrations />
      </MemoryRouter>,
    );

    const autoCreate = screen.getByTestId("calendar-pref-auto-create");
    expect(autoCreate).toHaveAttribute("data-state", "checked");

    await user.click(autoCreate);
    expect(autoCreate).toHaveAttribute("data-state", "unchecked");

    await user.click(screen.getByTestId("integrations-save"));

    expect(updateProfile).toHaveBeenCalledTimes(1);
    const payload = updateProfile.mock.calls[0][0] as {
      notification_prefs: {
        session_complete: boolean;
        integrations: { calendar_auto_create: boolean; calendar_auto_import: boolean };
      };
    };
    expect(payload.notification_prefs.session_complete).toBe(true);
    expect(payload.notification_prefs.integrations.calendar_auto_create).toBe(false);
    expect(payload.notification_prefs.integrations.calendar_auto_import).toBe(true);
  });
});
