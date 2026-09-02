import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";

const fetchEdgeJson = vi.fn();

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

vi.mock("@/store/userStore", () => ({
  useAuthStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({
      user: null,
      profile: null,
      status: "anonymous",
    }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    channel: () => ({
      on() {
        return this;
      },
      subscribe() {
        return "SUBSCRIBED";
      },
    }),
    removeChannel: () => Promise.resolve(),
    storage: {
      from: () => ({
        uploadToSignedUrl: vi.fn(),
      }),
    },
  },
}));

describe("SupportChatWidget", () => {
  beforeEach(() => {
    fetchEdgeJson.mockReset();
    fetchEdgeJson.mockResolvedValue({ thread_id: null, messages: [], mode: "ai" });
    localStorage.clear();
  });

  it("opens with greeting chips and only bootstraps (no AI send)", async () => {
    render(
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <SupportChatWidget />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Contact support" }));

    await waitFor(() => {
      expect(screen.getByText("Hi! How can we help you today?", { exact: false })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Interview Help" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to Support" })).toBeInTheDocument();

    await waitFor(() => expect(fetchEdgeJson).toHaveBeenCalled());
    const actions = fetchEdgeJson.mock.calls.map((c) => (c[1] as { action?: string }).action);
    expect(actions).toEqual(["bootstrap"]);
    expect(actions).not.toContain("send");
    expect(actions).not.toContain("start");
  });

  it("retries a failed send with the same client_message_id", async () => {
    fetchEdgeJson.mockImplementation(async (_fn: string, body: { action?: string }) => {
      if (body.action === "bootstrap") return { thread_id: null, messages: [] };
      throw new Error("network down");
    });

    render(
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <SupportChatWidget />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Contact support" }));
    await screen.findByPlaceholderText("Your name");

    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Ada" } });
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Write a message…"), { target: { value: "Need help" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    await screen.findByText(/Could not send/i);
    const firstSend = fetchEdgeJson.mock.calls.find((c) => (c[1] as { action?: string }).action === "start");
    const clientId = (firstSend?.[1] as { client_message_id?: string }).client_message_id;
    expect(clientId).toBeTruthy();

    fetchEdgeJson.mockImplementation(async (_fn: string, body: { action?: string }) => {
      if (body.action === "bootstrap") return { thread_id: null, messages: [] };
      return {
        thread_id: "t1",
        messages: [{ id: "m1", thread_id: "t1", sender_role: "user", body: "Need help", created_at: new Date().toISOString() }],
        mode: "ai",
      };
    });

    fireEvent.click(screen.getByText(/Could not send/i));
    await waitFor(() => {
      const retry = fetchEdgeJson.mock.calls.filter((c) =>
        ["start", "send"].includes(String((c[1] as { action?: string }).action)),
      );
      expect(retry.length).toBeGreaterThanOrEqual(2);
      expect((retry[retry.length - 1][1] as { client_message_id?: string }).client_message_id).toBe(clientId);
    });
  });

  it("hides the floating widget on onboarding so it cannot cover Continue", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <SupportChatWidget />
      </MemoryRouter>,
    );
    expect(container.querySelector("[aria-label='Contact support']")).toBeNull();
    expect(screen.queryByRole("button", { name: "Contact support" })).not.toBeInTheDocument();
  });

  it("hides the floating widget on signup and auth callback", () => {
    for (const path of ["/signup", "/auth/callback"]) {
      const { container, unmount } = render(
        <MemoryRouter initialEntries={[path]}>
          <SupportChatWidget />
        </MemoryRouter>,
      );
      expect(container.querySelector("[aria-label='Contact support']")).toBeNull();
      unmount();
    }
  });

  it("shows urgent waiting label when escalated with urgent priority", async () => {
    fetchEdgeJson.mockResolvedValue({
      thread_id: "t-urgent",
      public_ref: "CP-URGENT1",
      mode: "waiting_agent",
      priority: "urgent",
      messages: [
        {
          id: "m1",
          thread_id: "t-urgent",
          sender_role: "system",
          body: "This looks urgent",
          created_at: new Date().toISOString(),
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <SupportChatWidget />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Contact support" }));

    await waitFor(() => {
      expect(screen.getByText(/Urgent — agent assigned soon/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Ticket CP-URGENT1 is open/i)).toBeInTheDocument();
  });

  it("shows queued label for low-priority waiting threads", async () => {
    fetchEdgeJson.mockResolvedValue({
      thread_id: "t-low",
      public_ref: "CP-LOW1",
      mode: "waiting_agent",
      priority: "low",
      messages: [],
    });

    render(
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <SupportChatWidget />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Contact support" }));

    await waitFor(() => {
      expect(
        screen.getByText(/Queued — agent will reply when available/i),
      ).toBeInTheDocument();
    });
  });
});
