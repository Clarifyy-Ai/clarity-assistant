import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldBlockAnswerAutosave } from "@/lib/gov-exam/attemptAnswerPersistence";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("TestSession autosave vs submit race", () => {
  it("blocks autosave while submit is in flight", () => {
    expect(
      shouldBlockAnswerAutosave({ submitting: true, answersLocked: false }),
    ).toBe(true);
  });

  it("blocks autosave after answers are terminal-locked", () => {
    expect(
      shouldBlockAnswerAutosave({ submitting: false, answersLocked: true }),
    ).toBe(true);
  });

  it("allows autosave when neither submit nor lock is active", () => {
    expect(
      shouldBlockAnswerAutosave({ submitting: false, answersLocked: false }),
    ).toBe(false);
  });

  it("saveResponses consults shared autosave guard before persisting", () => {
    const session = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/TestSession.tsx"),
      "utf8",
    );
    const saveHandler = session.slice(session.indexOf("async function saveResponses"));
    expect(saveHandler).toContain("shouldBlockAnswerAutosave");
    expect(saveHandler.indexOf("shouldBlockAnswerAutosave")).toBeLessThan(
      saveHandler.indexOf("saveTestAnswers"),
    );
  });

  it("submit sets locks only after flushing pending answers", () => {
    const session = fs.readFileSync(
      path.join(root, "src/pages/app/mock-test/TestSession.tsx"),
      "utf8",
    );
    const submitHandler = session.slice(session.indexOf("async function handleSubmit"));
    expect(submitHandler.indexOf("await saveResponses({ throwOnError: true })"))
      .toBeLessThan(submitHandler.indexOf("answersLockedRef.current = true"));
    expect(submitHandler).toContain("submittingRef.current = true");
  });
});
