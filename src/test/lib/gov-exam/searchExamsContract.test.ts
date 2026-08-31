import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildExamOrFilter,
  buildPagination,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  escapeIlikePattern,
  GOV_EXAM_FAMILIES,
  MAX_PAGE_SIZE,
  MAX_PAGE,
  normalizeSearchQuery,
  rankExamResults,
  resolveFamily,
  resolvePagination,
  SEARCH_SERVICE_UNAVAILABLE,
  SERVICE_UNAVAILABLE,
  validateSearchQuery,
} from "../../../../supabase/functions/_shared/govExamSearch";

const root = process.cwd();

function read(relativePath: string): string {
  return fs
    .readFileSync(path.join(root, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

const EDGE = read("supabase/functions/search-exams/index.ts");
const CLIENT_API = read("src/lib/gov-exam/api.ts");

describe("gov exam family allowlist", () => {
  it("accepts every family the registry uses", () => {
    for (const family of GOV_EXAM_FAMILIES) {
      expect(resolveFamily(family)).toEqual({ ok: true, family });
    }
    expect(GOV_EXAM_FAMILIES).toContain("academic");
    expect(GOV_EXAM_FAMILIES).toContain("professional");
    expect(resolveFamily("UPSC")).toEqual({ ok: true, family: "upsc" });
    expect(resolveFamily("  banking  ")).toEqual({ ok: true, family: "banking" });
    expect(resolveFamily("academic")).toEqual({ ok: true, family: "academic" });
    expect(resolveFamily("Professional")).toEqual({ ok: true, family: "professional" });
  });

  it("treats missing or empty family as all families", () => {
    expect(resolveFamily(undefined)).toEqual({ ok: true, family: null });
    expect(resolveFamily(null)).toEqual({ ok: true, family: null });
    expect(resolveFamily("")).toEqual({ ok: true, family: null });
    expect(resolveFamily("   ")).toEqual({ ok: true, family: null });
  });

  it("rejects unknown families instead of silently returning nothing", () => {
    expect(resolveFamily("not-a-family").ok).toBe(false);
    expect(resolveFamily("../../etc/passwd").ok).toBe(false);
    expect(resolveFamily(42).ok).toBe(false);
    expect(resolveFamily({}).ok).toBe(false);
  });

  it("accepts a family added by the dynamic registry", () => {
    expect(resolveFamily("medical", ["ssc", "medical"])).toEqual({
      ok: true,
      family: "medical",
    });
  });
});

describe("search pagination bounds", () => {
  it("defaults to the first page", () => {
    const page = resolvePagination({});
    expect(page.page).toBe(DEFAULT_PAGE);
    expect(page.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(page.from).toBe(0);
    expect(page.to).toBe(DEFAULT_PAGE_SIZE - 1);
  });

  it("clamps pageSize to the maximum", () => {
    expect(resolvePagination({ pageSize: 500 }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(resolvePagination({ pageSize: MAX_PAGE_SIZE }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it("falls back to defaults for junk input", () => {
    for (const bad of [0, -3, "abc", null, undefined, Number.NaN, Infinity]) {
      expect(resolvePagination({ page: bad, pageSize: bad })).toMatchObject({
        page: DEFAULT_PAGE,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    }
  });

  it("clamps unsafe and excessively large page numbers", () => {
    expect(resolvePagination({ page: 1.5 }).page).toBe(DEFAULT_PAGE);
    expect(resolvePagination({ page: Number.MAX_SAFE_INTEGER + 1 }).page).toBe(DEFAULT_PAGE);
    expect(resolvePagination({ page: 999999999 }).page).toBe(MAX_PAGE);
    expect(resolvePagination({ page: "1e100" }).page).toBe(DEFAULT_PAGE);
  });

  it("computes a contiguous range across pages", () => {
    const second = resolvePagination({ page: 2, pageSize: 20 });
    expect(second.from).toBe(20);
    expect(second.to).toBe(39);
    const third = resolvePagination({ page: 3, pageSize: 10 });
    expect(third.from).toBe(20);
    expect(third.to).toBe(29);
  });
});

describe("pagination payload", () => {
  it("reports an empty registry as zero pages, not an error", () => {
    expect(buildPagination({ page: 1, pageSize: 20 }, 0)).toEqual({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 0,
      hasMore: false,
      nextCursor: null,
    });
  });

  it("flags more pages only while they exist", () => {
    expect(buildPagination({ page: 1, pageSize: 20 }, 45).hasMore).toBe(true);
    expect(buildPagination({ page: 1, pageSize: 20 }, 45).nextCursor).toBe("p2");
    expect(buildPagination({ page: 3, pageSize: 20 }, 45).hasMore).toBe(false);
    expect(buildPagination({ page: 3, pageSize: 20 }, 45).nextCursor).toBe(null);
    expect(buildPagination({ page: 1, pageSize: 20 }, 45).totalPages).toBe(3);
  });

  it("never returns a negative or fractional total", () => {
    expect(buildPagination({ page: 1, pageSize: 20 }, -5).total).toBe(0);
    expect(buildPagination({ page: 1, pageSize: 20 }, 20.7).total).toBe(20);
  });

  it("normalizes unsafe pagination values in the response builder", () => {
    expect(buildPagination({ page: 0, pageSize: 0 }, 45)).toMatchObject({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
      hasMore: true,
    });
  });
});

describe("query filter escaping", () => {
  it("escapes PostgREST reserved characters", () => {
    expect(escapeIlikePattern("100%")).toBe("100\\%");
    expect(escapeIlikePattern("a,b")).toBe("a\\,b");
    expect(escapeIlikePattern("ssc_cgl")).toBe("ssc\\_cgl");
    expect(escapeIlikePattern("(x)")).toBe("\\(x\\)");
  });

  it("searches short_name, name, code, jurisdiction, and related columns", () => {
    const filter = buildExamOrFilter("ssc cgl");
    expect(filter).toContain('short_name.ilike."%ssc cgl%"');
    expect(filter).toContain('name.ilike."%ssc cgl%"');
    expect(filter).toContain('code.ilike."%ssc cgl%"');
    expect(filter).toContain('description.ilike."%ssc cgl%"');
    expect(filter).toContain('legacy_exam_type.ilike."%ssc cgl%"');
    expect(filter).toContain('jurisdiction.ilike."%ssc cgl%"');
    expect(filter).toContain('state_code.ilike."%ssc cgl%"');
  });
});

describe("search query normalization and validation", () => {
  it("normalizes unicode whitespace and strips controls", () => {
    expect(normalizeSearchQuery("  SSC\u0000 CGL  ")).toBe("SSC CGL");
    expect(normalizeSearchQuery("a\n\tb")).toBe("a b");
  });

  it("rejects HTML / script-ish payloads and short queries", () => {
    expect(validateSearchQuery("<script>").ok).toBe(false);
    expect(validateSearchQuery("a").ok).toBe(false);
    expect(validateSearchQuery("!!").ok).toBe(false);
    expect(validateSearchQuery("ss").ok).toBe(true);
    expect(validateSearchQuery("").ok).toBe(true);
  });
});

describe("exam search ranking", () => {
  it("ranks exact code ahead of fuzzy name matches", () => {
    const ranked = rankExamResults(
      [
        { code: "OTHER", name: "Something with ssc inside", aliases: [] },
        { code: "SSC_CGL", name: "SSC Combined Graduate Level", aliases: ["CGL"] },
        { code: "X", name: "Banking", aliases: ["ssc"] },
      ],
      "SSC_CGL",
    );
    expect(ranked[0]?.code).toBe("SSC_CGL");
  });

  it("ranks exact short_name like exact code", () => {
    const ranked = rankExamResults(
      [
        { code: "OTHER", shortName: "Other", name: "CGL somewhere", aliases: [] },
        { code: "SSC_CGL", shortName: "SSC CGL", name: "SSC Combined Graduate Level", aliases: [] },
        { code: "X", shortName: "Bank", name: "Banking", aliases: ["SSC CGL"] },
      ],
      "SSC CGL",
    );
    expect(ranked[0]?.code).toBe("SSC_CGL");
  });
});

describe("search-exams edge contract", () => {
  it("returns an empty result set as a 200 success", () => {
    const emptyBranch = EDGE.slice(
      EDGE.indexOf("if (results.length === 0)"),
      EDGE.indexOf("const readinessByExam"),
    );
    expect(emptyBranch).toContain("success: true");
    expect(emptyBranch).toContain("results: []");
    expect(emptyBranch).toContain("pagination,");
    expect(emptyBranch).not.toContain("corsError");
  });

  it("maps database failures to SERVICE_UNAVAILABLE", () => {
    expect(EDGE).toContain(`import {`);
    expect(EDGE).toContain("SERVICE_UNAVAILABLE");
    expect(SERVICE_UNAVAILABLE).toBe("SERVICE_UNAVAILABLE");
    const helper = EDGE.slice(
      EDGE.indexOf("function searchUnavailable"),
      EDGE.indexOf("function mapExam"),
    );
    expect(helper).toContain("503");
    expect(helper).toContain("SERVICE_UNAVAILABLE");
    expect(helper).toContain("SERVICE_UNAVAILABLE_MESSAGE");
  });

  it("never leaks a raw PostgREST message to the client", () => {
    const helper = EDGE.slice(
      EDGE.indexOf("function searchUnavailable"),
      EDGE.indexOf("function mapExam"),
    );
    // The detail is logged, not returned.
    expect(helper).toContain("console.error");
    expect(helper).not.toContain("detail,\n  );");
    expect(EDGE).not.toContain("error.message,\n    );");
  });

  it("rejects an unknown family with a validation error", () => {
    expect(EDGE).toContain("resolveFamily(rawFamily, allowedFamilies)");
    expect(EDGE).toContain('corsError(req, 422, "VALIDATION_ERROR", familyResult.message)');
  });

  it("pages and filters in the database rather than loading the full registry", () => {
    expect(EDGE).toContain('.select(EXAM_SELECT, { count: "exact" })');
    expect(EDGE).toContain("query = query.eq(\"family\", family)");
    expect(EDGE).toContain("rankExamResults");
    expect(EDGE).toContain("fetchSize");
  });

  it("bounds pattern enrichment to the current page", () => {
    expect(EDGE).toContain("results.map((r) =>");
    expect(EDGE).not.toContain("results.slice(0, 40)");
  });
});

describe("client search mapping", () => {
  it("keeps SERVICE_UNAVAILABLE as an alias for older deployments", () => {
    const mapper = CLIENT_API.slice(
      CLIENT_API.indexOf("export function isSearchUnavailableError"),
    );
    expect(mapper).toContain('"SEARCH_SERVICE_UNAVAILABLE"');
    expect(mapper).toContain('"SERVICE_UNAVAILABLE"');
  });

  it("requests bounded pages", () => {
    expect(CLIENT_API).toContain("page: params.page ?? 1");
    expect(CLIENT_API).toContain("pageSize: params.pageSize ?? 20");
  });

  it("always returns an array of results and a pagination block", () => {
    expect(CLIENT_API).toContain("Array.isArray(payload?.results) ? payload.results : []");
    expect(CLIENT_API).toContain("hasMore");
    expect(CLIENT_API).toContain("nextCursor");
  });
});

describe("MockTestHub search states", () => {
  const HUB = read("src/pages/app/mock-test/MockTestHub.tsx");
  const COMBO = read("src/components/gov-exam/ExamSearchCombobox.tsx");

  it("models idle, searching, success, empty, and error distinctly", () => {
    expect(HUB).toContain('"idle" | "searching" | "success" | "empty" | "error"');
    expect(HUB).toContain('ExamSearchCombobox');
    expect(HUB).toContain("onResultsChange");
    expect(HUB).toContain('setSearchState("searching")');
    expect(HUB).toContain('setSearchState("empty")');
  });

  it("guards against out-of-order responses via ExamSearchCombobox", () => {
    expect(COMBO).toContain("new AbortController()");
    expect(COMBO).toContain("abortRef.current?.abort()");
    expect(COMBO).toContain("reqId !== reqIdRef.current");
    expect(COMBO).toContain("onResultsChangeRef");
  });
});
