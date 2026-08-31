import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("gov exam quality + fallback contracts", () => {
  it("Python engine validates selected questions and does not refund credits", () => {
    const engine = fs.readFileSync(path.join(root, "scraper/app/gov_exams/engine.py"), "utf8");
    expect(engine).toContain("validate_question_payloads");
    expect(engine).toContain("validate_assembled_paper");
    expect(engine).toContain("EXACT_MODES");
    expect(engine).toContain("CONTENT_INSUFFICIENT");
    expect(engine).not.toMatch(/refund_credits|_compensate\(/);
  });

  it("Python worker uses process_gov_exam_job rather than a parallel factory.generate path", () => {
    const worker = fs.readFileSync(path.join(root, "scraper/app/paper_factory/worker.py"), "utf8");
    expect(worker).toContain("process_gov_exam_job");
    expect(worker).not.toMatch(/factory\.generate\(/);
    expect(worker).not.toMatch(/refund_credits/);
  });

  it("Edge assembly validates via Python and fail-closes instead of padding Official/Full Mock", () => {
    const assembly = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/govPaperAssembly.ts"),
      "utf8",
    );
    expect(assembly).toContain("pythonGovValidateQuestions");
    expect(assembly).toContain("CONTENT_INSUFFICIENT");
    const client = fs.readFileSync(
      path.join(root, "supabase/functions/_shared/pythonGovExamClient.ts"),
      "utf8",
    );
    expect(client).toContain("pythonDispatchKeepsPythonOwner");
    expect(client).toContain("accepted: true");
  });

  it("select-test-questions validates selected payloads via Python and does not pad", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/select-test-questions/index.ts"),
      "utf8",
    );
    expect(src).toContain("pythonGovValidateQuestions");
    expect(src).toContain("isPythonGovExamConfigured");
    expect(src).toContain("CONTENT_INSUFFICIENT");
    expect(src).not.toMatch(/pad.*fake|fake.*question/i);
  });

  it("extract-question-paper queues heavy PDFs and never auto-publishes", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/extract-question-paper/index.ts"),
      "utf8",
    );
    expect(src).toContain("scheduleWaitUntil");
    expect(src).toContain('status: "queued"');
    expect(src).toContain("async: true");
    expect(src).toContain("is_public: false");
    expect(src).toContain("needs_review: true");
    expect(src).toContain("auto_publish: false");
  });
});
