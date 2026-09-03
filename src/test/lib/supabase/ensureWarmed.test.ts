import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  ensureSupabaseWarmed,
  resetSupabaseWarmForTests,
} from "@/lib/supabase/ensureWarmed";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";

describe("ensureSupabaseWarmed", () => {
  beforeEach(() => {
    resetSupabaseWarmForTests();
    vi.mocked(supabase.auth.getSession).mockClear();
  });

  it("dedupes concurrent warm calls into one getSession", async () => {
    const [a, b] = await Promise.all([
      ensureSupabaseWarmed(),
      ensureSupabaseWarmed(),
    ]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(supabase.auth.getSession).toHaveBeenCalledTimes(1);
  });
});
