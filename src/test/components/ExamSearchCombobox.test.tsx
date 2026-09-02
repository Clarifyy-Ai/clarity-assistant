import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { ExamSearchCombobox, resetGovSearchLifecycleForTests } from "@/components/gov-exam/ExamSearchCombobox";
import { ApiClientError } from "@/lib/api/apiClient";
import type { GovExamSearchResult } from "@/lib/gov-exam/api";

const searchGovExams = vi.fn();

vi.mock("@/lib/gov-exam/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gov-exam/api")>(
    "@/lib/gov-exam/api",
  );
  return {
    ...actual,
    searchGovExams: (...args: unknown[]) => searchGovExams(...args),
  };
});

const EXAM: GovExamSearchResult = {
  resultType: "official_exam",
  examId: "exam-1",
  code: "SSC_CGL",
  name: "SSC Combined Graduate Level",
  family: "ssc",
  description: null,
  legacyExamType: null,
  recruitingBody: null,
  aliases: [],
  stages: [],
  pattern: null,
  languages: [],
  lastVerified: null,
  primaryActions: [],
};

async function typeQuery(value: string) {
  const input = screen.getByLabelText("Search government exams");
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(280);
  });
}

describe("ExamSearchCombobox request lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    searchGovExams.mockReset();
    resetGovSearchLifecycleForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetGovSearchLifecycleForTests();
  });

  it("shows empty results as no matches, not an error", async () => {
    searchGovExams.mockResolvedValue({ results: [] });
    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty={false} />,
    );
    await typeQuery("zzz-nonexistent");

    expect(screen.getByText("No exams found.")).toBeInTheDocument();
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("shows a retryable error on 401 and clears Searching…", async () => {
    searchGovExams.mockRejectedValue(
      new ApiClientError({
        message: "Sign in to continue.",
        status: 401,
        code: "AUTH_REQUIRED",
      }),
    );
    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty={false} />,
    );
    await typeQuery("ssc");

    expect(screen.getByRole("alert")).toHaveTextContent("Sign in to search exams.");
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("shows a retryable error on 5xx and clears Searching…", async () => {
    searchGovExams.mockRejectedValue(
      new ApiClientError({
        message: "Exam search failed. Please try again.",
        status: 500,
        code: "SEARCH_FAILED",
      }),
    );
    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty={false} />,
    );
    await typeQuery("ssc");

    expect(screen.getByRole("alert")).toHaveTextContent("Exam search failed. Please try again.");
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("clears Searching… with a timeout error when the profile/search request hangs", async () => {
    searchGovExams.mockReturnValue(new Promise(() => {}));
    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty={false} />,
    );
    await typeQuery("ssc");

    expect(screen.getByText("Searching…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Search timed out. Please try again.");
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("shows rate-limit error immediately without leaving Searching…", async () => {
    searchGovExams.mockRejectedValue(
      new ApiClientError({
        message: "Too many searches.",
        status: 429,
        code: "RATE_LIMITED",
      }),
    );
    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty={false} />,
    );
    await typeQuery("ssc");

    expect(screen.getByRole("alert")).toHaveTextContent(
      /too many searches/i,
    );
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("settles empty browse without an infinite spinner", async () => {
    searchGovExams.mockResolvedValue({ results: [] });
    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty />,
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(280);
    });

    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    expect(searchGovExams).toHaveBeenCalledWith(
      expect.objectContaining({ q: "" }),
      expect.any(Object),
    );
  });

  it("does not spin forever when parent onResultsChange triggers re-renders", async () => {
    searchGovExams.mockResolvedValue({ results: [EXAM] });
    const Parent = () => {
      const [, setTick] = useState(0);
      return (
        <ExamSearchCombobox
          value=""
          onSelect={vi.fn()}
          browseWhenEmpty={false}
          onResultsChange={() => setTick((n) => n + 1)}
        />
      );
    };
    render(<Parent />);
    await typeQuery("ssc");

    expect(screen.getByText(EXAM.name)).toBeInTheDocument();
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
  });

  it("shows registry aliases in each result", async () => {
    searchGovExams.mockResolvedValue({
      results: [{ ...EXAM, aliases: ["CGL", "Combined Graduate Level Exam"] }],
    });
    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty={false} />,
    );
    await typeQuery("ssc");

    expect(
      screen.getByText("Also known as: CGL, Combined Graduate Level Exam"),
    ).toBeInTheDocument();
  });

  it("keeps only the latest query when the user types rapidly", async () => {
    searchGovExams.mockImplementation(
      (
        params: { q?: string },
        options?: { signal?: AbortSignal },
      ) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            resolve({
              results: params.q === "abc" ? [EXAM] : [],
            });
          }, 40);
          options?.signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    render(
      <ExamSearchCombobox value="" onSelect={vi.fn()} browseWhenEmpty={false} />,
    );

    await typeQuery("aa");
    await typeQuery("abc");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(40);
    });

    expect(screen.getByText(EXAM.name)).toBeInTheDocument();
    expect(screen.queryByText("Searching…")).not.toBeInTheDocument();
    expect(screen.queryByText("No exams found.")).not.toBeInTheDocument();
  });
});
