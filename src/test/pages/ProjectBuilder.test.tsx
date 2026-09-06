import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProjectBuilder from "@/pages/app/prep/ProjectBuilder";

vi.mock("@/store/userStore", () => ({
  useAuthStore: () => ({
    user: { id: "user-1" },
    profile: { credits: 100 },
  }),
}));

vi.mock("@/hooks/useCredits", () => ({
  useCredits: () => ({
    balance: 100,
    costs: { project_build: 12 },
    canAfford: () => true,
    isLow: false,
    isEmpty: false,
  }),
}));

vi.mock("@/lib/prep/prepProjectsRepository", () => ({
  listPrepProjects: vi.fn().mockResolvedValue([]),
  upsertPrepProject: vi.fn(),
  deletePrepProject: vi.fn(),
}));

vi.mock("@/lib/supabase/database", () => ({
  answerBankDB: {
    create: vi.fn(),
  },
}));

describe("ProjectBuilder page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing", async () => {
    render(
      <MemoryRouter>
        <ProjectBuilder />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Project Builder" }),
      ).toBeInTheDocument();
    });
  });
});
