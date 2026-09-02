import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

/**
 * DD-004..DD-011 — hub pages must fill the AppShell column (no nested max-w
 * that leaves unused side gutters). Coding editor must not hard-cap at h-64.
 */
describe("DD layout density contracts", () => {
  const root = join(process.cwd(), "src");

  function src(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
  }

  it("PAGE_SHELL fills width without nested max-w", () => {
    expect(PAGE_SHELL).toBe("w-full min-w-0 overflow-x-hidden");
    expect(PAGE_SHELL).not.toMatch(/max-w-/);
  });

  it("Coding Hints / System Design / Billing use PAGE_SHELL (not max-w-4/5xl)", () => {
    const hints = src("pages/app/prep/CodingHints.tsx");
    const design = src("pages/app/prep/SystemDesign.tsx");
    const billing = src("pages/app/settings/SettingsBilling.tsx");

    expect(hints).toMatch(/PAGE_SHELL/);
    expect(hints).not.toMatch(/className=\{?[`"'].*max-w-5xl/);
    expect(design).toMatch(/PAGE_SHELL/);
    expect(design).not.toMatch(/className=\{?[`"'].*max-w-5xl/);
    expect(billing).toMatch(/PAGE_SHELL/);
    expect(billing).not.toMatch(/max-w-4xl/);
  });

  it("Coding assessment editor fills viewport height (not fixed h-64)", () => {
    const coding = src("pages/app/coding/CodingAssessment.tsx");
    expect(coding).toMatch(/min-h-\[calc\(100vh/);
    expect(coding).toMatch(/min-h-\[min\(52vh/);
    expect(coding).not.toMatch(/className="mt-2 h-64 /);
  });

  it("AI Hub does not double-pad or nest max-w-6xl", () => {
    const hub = src("pages/app/admin/AdminAiHub.tsx");
    expect(hub).not.toMatch(/p-4 sm:p-6 max-w-6xl/);
    expect(hub).not.toMatch(/max-w-6xl mx-auto/);
  });

  it("Admin Revenue / Audit Log use compact vertical rhythm", () => {
    const revenue = src("pages/app/admin/AdminRevenue.tsx");
    const audit = src("pages/app/admin/AdminAuditLog.tsx");
    expect(revenue).toMatch(/data-testid="dd-layout-root" className="space-y-4"/);
    expect(revenue).toMatch(/revenue-detail-grid"[^>]*gap-4/);
    expect(audit).toMatch(/data-testid="dd-layout-root" className="space-y-4"/);
    expect(audit).toMatch(/CardHeader className="mb-2 flex flex-col/);
  });

  it("Verify certificate uses the public marketing shell with a readable inner cap", () => {
    const verify = src("pages/public/VerifyCertificate.tsx");
    expect(verify).toMatch(/MarketingLayout/);
    expect(verify).toMatch(/MARKETING_SHELL/);
    expect(verify).toMatch(/max-w-3xl/);
    expect(verify).not.toMatch(/PAGE_SHELL_STANDARD/);
  });

  it("Admin layout owns page padding; AI Hub does not double-pad", () => {
    const layout = src("pages/app/admin/AdminLayout.tsx");
    const hub = src("pages/app/admin/AdminAiHub.tsx");
    expect(layout).toMatch(/data-testid="admin-content-pad"/);
    expect(layout).toMatch(/p-4 md:p-6/);
    expect(layout).toMatch(/h-dvh/);
    expect(layout).toMatch(/min-w-0 min-h-0/);
    expect(hub).not.toMatch(/className="space-y-4 p-4"/);
    expect(hub).not.toMatch(/className="p-4"/);
  });
});
