import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const getBySessionIdForUser = vi.fn();
const listBySessionIdForUser = vi.fn();
const fetchEdgeJson = vi.fn();

vi.mock("@/lib/env", () => ({
  ENV: { APP_URL: "https://app.test" },
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_PUBLISHABLE_KEY: "anon",
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: (...args: unknown[]) => fetchEdgeJson(...args),
}));

vi.mock("@/lib/supabase/database", () => ({
  scorecardsDB: {
    getBySessionIdForUser: (...args: unknown[]) => getBySessionIdForUser(...args),
    markShared: vi.fn(),
  },
  sessionAnswersDB: {
    listBySessionIdForUser: (...args: unknown[]) => listBySessionIdForUser(...args),
  },
}));

vi.mock("@/store/userStore", () => {
  const state = {
    user: { id: "u1" },
    profile: { privacy_prefs: {} },
  };
  return {
    useAuthStore: Object.assign(() => state, { getState: () => state }),
  };
});

vi.mock("@/lib/privacy/privacyPrefs", () => ({
  canShareScorecard: () => true,
}));

import { useScorecard } from "@/hooks/useScorecard";

const PERSISTED = {
  id: "sc1",
  session_id: "sess-1",
  user_id: "u1",
  overall_score: 72,
  confidence_score: 70,
  clarity_score: 71,
  structure_score: 73,
  relevance_score: 74,
  question_scores: [],
  filler_count: 0,
  filler_rate: 0,
  top_filler_words: [],
  wpm_avg: 120,
  wpm_trend: "stable",
  strengths: [],
  improvements: [],
  coach_note: "",
  star_adherence: 50,
  is_shared: false,
  share_token: null,
  pdf_url: null,
  generated_at: "2026-08-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  getBySessionIdForUser.mockResolvedValue(null);
  listBySessionIdForUser.mockResolvedValue([{ answer: "I led a migration." }]);
  fetchEdgeJson.mockResolvedValue({});
});

describe("useScorecard — persist-first, no mount AI", () => {
  it("returns a persisted scorecard without calling generate-scorecard", async () => {
    getBySessionIdForUser.mockResolvedValue(PERSISTED);

    const { result } = renderHook(() => useScorecard({ sessionId: "sess-1" }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(getBySessionIdForUser).toHaveBeenCalledWith("sess-1", "u1");
    expect(result.current.status).toBe("scored");
    expect(result.current.scorecard?.id).toBe("sc1");
    expect(fetchEdgeJson).not.toHaveBeenCalled();
  });

  it("does not auto-generate when the page mounts and no scorecard exists", async () => {
    const { result } = renderHook(() => useScorecard({ sessionId: "sess-1" }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe("not_scored");
    expect(result.current.scorecard).toBeNull();
    expect(fetchEdgeJson).not.toHaveBeenCalled();
  });

  it("generateScorecard calls Edge once and ignores a second in-flight click", async () => {
    let resolveGenerate: (() => void) | undefined;
    fetchEdgeJson.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGenerate = () => resolve({});
        }),
    );
    getBySessionIdForUser
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(PERSISTED);

    const { result } = renderHook(() => useScorecard({ sessionId: "sess-1" }));

    await waitFor(() => {
      expect(result.current.status).toBe("not_scored");
    });

    act(() => {
      void result.current.generateScorecard();
      void result.current.generateScorecard();
    });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(true);
    });

    expect(fetchEdgeJson).toHaveBeenCalledTimes(1);
      expect(fetchEdgeJson).toHaveBeenCalledWith(
      "generate-scorecard",
      { session_id: "sess-1" },
      { timeoutMs: 90_000 },
    );

    await act(async () => {
      resolveGenerate?.();
    });

    await waitFor(() => {
      expect(result.current.status).toBe("scored");
    });

    expect(result.current.isGenerating).toBe(false);
  });
});
