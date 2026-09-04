import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { IndiaRegionGate } from "@/components/layout/IndiaRegionGate";

const useIndiaRegionMock = vi.fn(() => ({ isIndia: true }));

vi.mock("@/hooks/useIndiaRegion", () => ({
  useIndiaRegion: () => useIndiaRegionMock(),
}));

function renderGate(initialPath = "/app/mock-test/generate") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/app/mock-test/generate"
          element={
            <IndiaRegionGate>
              <div>Generate mock surface</div>
            </IndiaRegionGate>
          }
        />
        <Route path="/app/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("IndiaRegionGate", () => {
  it("keeps Generate Mock on the exam route instead of redirecting to Dashboard", () => {
    useIndiaRegionMock.mockReturnValue({ isIndia: true });
    renderGate();
    expect(screen.getByText("Generate mock surface")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
  });

  it("shows an in-page message when access is forced off (no silent Dashboard bounce)", () => {
    useIndiaRegionMock.mockReturnValue({ isIndia: false });
    renderGate();
    expect(screen.getByText(/Government exams unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText("Generate mock surface")).not.toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Dashboard/i })).toHaveAttribute(
      "href",
      "/app/dashboard",
    );
  });
});
