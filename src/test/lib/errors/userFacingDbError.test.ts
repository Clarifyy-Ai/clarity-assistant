import { describe, expect, it } from "vitest";
import {
  answerBankEmptyTitle,
  answerBankLoadErrorMessage,
  userFacingDbError,
} from "@/lib/errors/userFacingDbError";

describe("userFacingDbError", () => {
  it("never echoes raw PostgREST messages", () => {
    const raw = new Error('column answer_bank.session_id does not exist');
    expect(userFacingDbError(raw, "load")).not.toContain("session_id");
    expect(userFacingDbError(raw, "load")).toMatch(/couldn't load/i);
  });

  it("provides Answer Bank / Knowledge Base copy helpers", () => {
    expect(answerBankLoadErrorMessage("Answer Bank")).toContain("Answer Bank");
    expect(answerBankEmptyTitle("Knowledge Base")).toContain("empty");
  });
});
