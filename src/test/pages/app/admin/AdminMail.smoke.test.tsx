import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiClientError } from "@/lib/api/apiClient";

const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

import AdminMail from "@/pages/app/admin/AdminMail";

function renderAdminMail() {
  return render(
    <MemoryRouter>
      <AdminMail />
    </MemoryRouter>,
  );
}

describe("AdminMail smoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a not-configured empty state when the provider is missing", async () => {
    fetchEdgeJson.mockResolvedValue({
      configured: false,
      address: "hello@trycareerpilot.com",
      quotaPercent: null,
      lastError: "HOSTINGER_MAIL_API_TOKEN is not set.",
      fetchedAt: "2026-09-02T10:00:00.000Z",
    });

    renderAdminMail();

    await waitFor(() => {
      expect(screen.getByText("Hostinger Mail is not configured")).toBeInTheDocument();
    });
    expect(screen.getByText(/Supabase Edge secret/i)).toBeInTheDocument();
    expect(screen.queryByText(/Bearer /)).not.toBeInTheDocument();
    expect(fetchEdgeJson).toHaveBeenCalledWith("hostinger-mail", { action: "status" });
    expect(fetchEdgeJson.mock.calls.every((call) => call[0] === "hostinger-mail")).toBe(true);
  });

  it("treats PROVIDER_UNAVAILABLE as a missing-provider empty state", async () => {
    fetchEdgeJson.mockRejectedValue(
      new ApiClientError({
        message: "Hostinger Mail is not configured.",
        status: 503,
        code: "PROVIDER_UNAVAILABLE",
      }),
    );

    renderAdminMail();

    await waitFor(() => {
      expect(screen.getByText("Hostinger Mail is not configured")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders mailbox status, folders, and messages when configured", async () => {
    fetchEdgeJson.mockImplementation(async (_fn: string, body?: Record<string, unknown>) => {
      const action = body?.action;
      if (action === "status") {
        return {
          configured: true,
          address: "hello@trycareerpilot.com",
          quotaPercent: 12,
          lastError: null,
          fetchedAt: "2026-09-02T10:00:00.000Z",
        };
      }
      if (action === "folders" || action === "ensure-folders") {
        return {
          folders: [
            { path: "INBOX", name: "INBOX", unreadCount: 1 },
            { path: "INBOX.Sent", name: "Sent", unreadCount: 0 },
            { path: "OTPs", name: "OTPs", unreadCount: 0 },
            { path: "Verifications", name: "Verifications", unreadCount: 0 },
          ],
          created: [],
        };
      }
      if (action === "list") {
        return {
          messages: [
            {
              uid: 42,
              subject: "Campus outreach",
              unseen: true,
              date: "2026-09-02T09:00:00.000Z",
              from: { name: "Ada", address: "ada@example.com" },
            },
          ],
        };
      }
      return {};
    });

    renderAdminMail();

    await waitFor(() => {
      expect(screen.getAllByText("Campus outreach").length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getByText("hello@trycareerpilot.com")).toBeInTheDocument();
    expect(screen.getByText("Configured")).toBeInTheDocument();
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText(/Ada <ada@example.com>/)).toBeInTheDocument();
    expect(screen.getByText("OTPs")).toBeInTheDocument();
    expect(screen.getByText("Verifications")).toBeInTheDocument();
    expect(screen.getByText("Tracking")).toBeInTheDocument();
    expect(screen.queryByText(/HOSTINGER_MAIL_API_TOKEN=/)).not.toBeInTheDocument();
  });
});
