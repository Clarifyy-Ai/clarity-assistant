import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  canBrowseGovExamsBeforeProfileReady,
  canBrowseGovExamsDuringAccountRecovery,
} from "@/lib/gov-exam/govExamRoutes";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("gov exam bootstrap gates", () => {
  it("lets authenticated users browse generate while profile is still loading", () => {
    expect(
      canBrowseGovExamsBeforeProfileReady({
        pathname: "/app/mock-test/generate",
        status: "authenticated",
        accountPhase: "ACCOUNT_LOADING",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
  });

  it("keeps the generation route mounted after a recoverable profile timeout", () => {
    expect(
      canBrowseGovExamsDuringAccountRecovery({
        pathname: "/app/mock-test/generate",
        status: "error",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
    expect(
      canBrowseGovExamsBeforeProfileReady({
        pathname: "/app/mock-test/generate",
        status: "error",
        accountPhase: "RECOVERY_REQUIRED",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(true);
  });

  it("does not bypass login or MFA", () => {
    expect(
      canBrowseGovExamsDuringAccountRecovery({
        pathname: "/app/mock-test/generate",
        status: "unauthenticated",
        hasUser: false,
        mfaBlocked: false,
      }),
    ).toBe(false);
    expect(
      canBrowseGovExamsBeforeProfileReady({
        pathname: "/app/dashboard",
        status: "authenticated",
        hasUser: true,
        mfaBlocked: false,
      }),
    ).toBe(false);
  });
});

describe("Generate Mock redirect regression (TC-GOV-007)", () => {
  it("keeps mock-test/generate behind IndiaAppPage without silent Dashboard Navigate", () => {
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    const gate = fs.readFileSync(
      path.join(root, "src/components/layout/IndiaRegionGate.tsx"),
      "utf8",
    );
    const detail = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/GovExamDetail.tsx"),
      "utf8",
    );
    expect(app).toMatch(
      /path:\s*"mock-test\/generate"\s*,\s*element:\s*<IndiaAppPage\s+component=\{GenerateGovPaper\}\s*\/>/,
    );
    expect(app).toContain("function IndiaAppPage");
    expect(app).toMatch(/IndiaRegionGate>\s*\n\s*<Page component=\{Component\} \/>/);
    expect(gate).not.toMatch(/Navigate\s+to=\{fallback\}/);
    expect(gate).not.toMatch(/<Navigate[^>]*to=["']\/app\/dashboard["']/);
    expect(gate).toContain('to="/app/dashboard"');
    expect(gate).toMatch(/Back to Dashboard/);
    expect(detail).toContain("govExamGenerateNavigateTarget");
    expect(detail).toContain("goToGenerate");
    expect(detail).not.toMatch(/`\$\{generateBase\}&basis=/);
  });
});

describe("gov exam path helpers", () => {
  it("builds encoded detail and generate paths", async () => {
    const { govExamDetailPath, govExamGeneratePath } = await import(
      "@/lib/gov-exam/govExamRoutes"
    );
    expect(govExamDetailPath("")).toBeNull();
    expect(govExamDetailPath("SSC CGL")).toBe(
      `/app/mock-test/exam/${encodeURIComponent("SSC CGL")}`,
    );
    expect(govExamGeneratePath({ examId: "", code: "" })).toBeNull();
    const gen = govExamGeneratePath({
      examId: "uuid-1",
      stageId: "stage-1",
      code: "SSC_CGL",
      basis: "full_sim",
      language: "hi",
      questionCount: 100,
    });
    expect(gen).toContain("/app/mock-test/generate?");
    expect(gen).toContain("examId=uuid-1");
    expect(gen).toContain("stageId=stage-1");
    expect(gen).toContain("code=SSC_CGL");
    expect(gen).toContain("basis=full_sim");
    expect(gen).toContain("language=hi");
    expect(gen).toContain("questionCount=100");
  });

  it("builds React Router navigate targets without malformed &basis paths", async () => {
    const { govExamGenerateNavigateTarget } = await import("@/lib/gov-exam/govExamRoutes");
    const target = govExamGenerateNavigateTarget({
      examId: "uuid-1",
      stageId: "stage-1",
      code: "SSC_CGL",
      basis: "quick",
    });
    expect(target).toEqual({
      pathname: "/app/mock-test/generate",
      search: expect.stringContaining("basis=quick"),
    });
    expect(target?.search.startsWith("?")).toBe(true);
    expect(target?.search).not.toMatch(/^&/);
  });
});
