import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("questions answer-key security migration", () => {
  it("tightens questions_select to admin and owner only", () => {
    const sql = fs.readFileSync(
      path.resolve(
        "supabase/migrations/20260905210000_questions_select_tighten_and_review_rpc.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/uploaded_by = auth\.uid\(\)/);
    expect(sql).not.toMatch(/is_public = true[\s\S]*publish_status = 'published'/);
  });

  it("defines owned mock test review RPC", () => {
    const sql = fs.readFileSync(
      path.resolve(
        "supabase/migrations/20260905210000_questions_select_tighten_and_review_rpc.sql",
      ),
      "utf8",
    );
    expect(sql).toContain("get_owned_mock_test_question_review");
    expect(sql).toMatch(/mt\.user_id = auth\.uid\(\)/);
    expect(sql).toMatch(/COMPLETED/);
  });

  it("TestResults uses review RPC not direct questions select", () => {
    const src = fs.readFileSync(
      path.resolve("src/pages/app/mock-test/TestResults.tsx"),
      "utf8",
    );
    expect(src).toContain("get_owned_mock_test_question_review");
    expect(src).not.toMatch(/\.from\("questions"\)[\s\S]{0,120}correct_answer/);
  });
});
