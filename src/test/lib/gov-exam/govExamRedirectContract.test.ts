import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { preferredReturnToFromNavigation, pathWithReturnTo, sanitizeReturnTo } from "@/lib/auth/safeReturnTo";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("preferredReturnToFromNavigation", () => {
  it("prefers query returnTo then location.state.from", () => {
    const params = new URLSearchParams("returnTo=%2Fapp%2Fmock-test%2Fgenerate");
    expect(
      preferredReturnToFromNavigation({
        searchParams: params,
        locationState: { from: "/app/dashboard" },
      }),
    ).toBe("/app/mock-test/generate");
    expect(
      preferredReturnToFromNavigation({
        searchParams: new URLSearchParams(),
        locationState: {
          from: { pathname: "/app/mock-test/session/abc", search: "", hash: "" },
        },
      }),
    ).toBe("/app/mock-test/session/abc");
    expect(sanitizeReturnTo("//evil.example")).toBeNull();
  });
});

describe("pathWithReturnTo", () => {
  it("embeds sanitized returnTo so refresh can restore deep-links", () => {
    expect(pathWithReturnTo("/verify-email", "/app/dashboard")).toBe(
      "/verify-email?returnTo=%2Fapp%2Fdashboard",
    );
    expect(pathWithReturnTo("/onboarding", "/app/mock-test?x=1")).toBe(
      "/onboarding?returnTo=%2Fapp%2Fmock-test%3Fx%3D1",
    );
    expect(pathWithReturnTo("/onboarding", "https://evil.example")).toBe(
      "/onboarding",
    );
  });
});

describe("gov exam session/results stay on route (source contract)", () => {
  const session = read("src/pages/app/mock-test/TestSession.tsx");
  const results = read("src/pages/app/mock-test/TestResults.tsx");

  it("does not auto-navigate to hub on load not-found or temporary failure", () => {
    expect(session).toContain('kind: "not_found"');
    expect(session).toContain('kind: "temporary"');
    expect(session).toContain("setLoadFailure");
    expect(session).not.toContain('toast.error("Test not found.");\n        navigate("/app/mock-test");');
    expect(results).toContain('"processing"');
    expect(results).toContain("setLoadFailure");
    expect(results).not.toContain(
      'toast.error("Analysis is still processing. Refresh the page in a few seconds.");\n        navigate("/app/mock-test");',
    );
  });
});
