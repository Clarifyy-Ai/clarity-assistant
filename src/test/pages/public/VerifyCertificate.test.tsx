import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import VerifyCertificatePage from "@/pages/public/VerifyCertificate";

const rpc = vi.fn();
const downloadPdf = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock("@/lib/learning/certificatePdf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/learning/certificatePdf")>(
    "@/lib/learning/certificatePdf",
  );
  return {
    ...actual,
    downloadCertificatePdf: (...args: unknown[]) => downloadPdf(...args),
  };
});

vi.mock("@/components/layout/MarketingLayout", () => ({
  MarketingLayout: ({ children }: { children: ReactNode }) => (
    <div data-testid="marketing-layout">{children}</div>
  ),
}));

vi.mock("@/hooks/usePageMeta", () => ({
  usePageMeta: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderVerifyRoute(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/verify-certificate" element={<VerifyCertificatePage />} />
        <Route path="/verify-certificate/:certificateId" element={<VerifyCertificatePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const VALID_CODE = "CLR-2026-AB12CD34";

describe("TC-PUB-011 VerifyCertificate route states", () => {
  beforeEach(() => {
    rpc.mockReset();
    downloadPdf.mockReset();
  });

  it("renders branded landing form when certificate id is missing", () => {
    renderVerifyRoute("/verify-certificate");

    expect(screen.getByTestId("marketing-layout")).toBeInTheDocument();
    expect(screen.getByTestId("certificate-verify-form")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Course Completion Certificate/i })).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
    expect(screen.queryByTestId("certificate-download-pdf")).not.toBeInTheDocument();
  });

  it("renders valid certificate details with Download PDF and Print", async () => {
    rpc.mockResolvedValue({
      data: {
        valid: true,
        certificate_code: VALID_CODE,
        student_name: "QA Audit",
        course_name: "Interview Foundations",
        issued_at: "2026-01-15T00:00:00.000Z",
        course_duration_hours: 12,
        completion_percentage: 100,
        kind: "Course Completion Certificate",
      },
      error: null,
    });

    renderVerifyRoute(`/verify-certificate/${VALID_CODE}`);

    await waitFor(() => {
      expect(screen.getByTestId("certificate-card")).toBeInTheDocument();
    });
    expect(screen.getByText("QA Audit")).toBeInTheDocument();
    expect(screen.getByText("Interview Foundations")).toBeInTheDocument();
    expect(screen.getByText(VALID_CODE)).toBeInTheDocument();
    expect(screen.getByTestId("certificate-download-pdf")).toBeInTheDocument();
    expect(screen.getByTestId("certificate-print")).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith("verify_course_certificate", { p_code: VALID_CODE });

    await userEvent.click(screen.getByTestId("certificate-download-pdf"));
    expect(downloadPdf).toHaveBeenCalledWith(
      expect.objectContaining({
        certificate_code: VALID_CODE,
        student_name: "QA Audit",
        course_name: "Interview Foundations",
      }),
    );
  });

  it("print control calls window.print", async () => {
    rpc.mockResolvedValue({
      data: {
        valid: true,
        certificate_code: VALID_CODE,
        student_name: "QA Audit",
        course_name: "Interview Foundations",
        issued_at: "2026-01-15T00:00:00.000Z",
        course_duration_hours: 12,
        completion_percentage: 100,
        kind: "Course Completion Certificate",
      },
      error: null,
    });
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);

    renderVerifyRoute(`/verify-certificate/${VALID_CODE}`);
    await waitFor(() => {
      expect(screen.getByTestId("certificate-print")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("certificate-print"));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("renders branded not-found state for invalid certificate ids", async () => {
    rpc.mockResolvedValue({
      data: { valid: false },
      error: null,
    });

    renderVerifyRoute(`/verify-certificate/${VALID_CODE}`);

    await waitFor(() => {
      expect(screen.getByTestId("certificate-verify-invalid")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Certificate not found/i })).toBeInTheDocument();
    expect(screen.queryByTestId("certificate-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("certificate-download-pdf")).not.toBeInTheDocument();
    expect(screen.queryByText(/QA Audit/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Learner names, course titles, and completion details are not shown/i),
    ).toBeInTheDocument();
  });

  it("renders branded malformed state without calling verify RPC", async () => {
    renderVerifyRoute("/verify-certificate/not-a-real-code");

    await waitFor(() => {
      expect(screen.getByTestId("certificate-verify-malformed")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Invalid certificate code/i })).toBeInTheDocument();
    expect(screen.getByText(/CLR-YYYY-XXXXXXXX/i)).toBeInTheDocument();
    expect(screen.queryByTestId("certificate-download-pdf")).not.toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("renders safe unauthorized/error state without leaking RPC internals", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        message: "permission denied for function verify_course_certificate",
      },
    });

    renderVerifyRoute(`/verify-certificate/${VALID_CODE}`);

    await waitFor(() => {
      expect(screen.getByTestId("certificate-verify-error")).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: /Verification unavailable/i })).toBeInTheDocument();
    expect(
      screen.getByText(/We could not verify this certificate right now/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/permission denied for function verify_course_certificate/i),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
    expect(screen.queryByTestId("certificate-download-pdf")).not.toBeInTheDocument();
  });
});
