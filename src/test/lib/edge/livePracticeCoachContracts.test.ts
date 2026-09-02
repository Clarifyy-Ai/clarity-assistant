import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const functionsDir = path.join(root, "supabase/functions");

function readFunction(name: string): string {
  return fs.readFileSync(path.join(functionsDir, name, "index.ts"), "utf8");
}

function readSrc(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("Live Practice Coach — start-session contracts", () => {
  it("tags practice/rehearsal from server-side buildSessionTags", () => {
    const source = readFunction("start-session");
    expect(source).toContain("function buildSessionTags");
    expect(source).toContain('tags.push("practice")');
    expect(source).toContain('tags.push("rehearsal")');
    expect(source).toContain("const isPractice = body.is_practice || sessionType !== \"live\"");
    expect(source).toContain("p_tags: sessionTags");
  });

  it("passes idempotency key into start_owned_session RPC", () => {
    const source = readFunction("start-session");
    expect(source).toContain('req.headers.get("Idempotency-Key")');
    expect(source).toContain("p_idempotency_key: idempotencyKey");
    expect(source).toContain('"start_owned_session"');
  });

  it("cancels a fresh session when practice context consume races", () => {
    const source = readFunction("start-session");
    expect(source).toContain('"end_owned_session"');
    expect(source).toContain('p_terminal_reason: "CANCELLED"');
  });
});

describe("Live Practice Coach — AI edge session enforcement", () => {
  const aiFns = ["generate-hint", "generate-answer", "ai-coach-chat"] as const;

  it.each(aiFns)("%s enforces session ownership + practice tags via enforceAiSessionAccess", (fn) => {
    const source = readFunction(fn);
    expect(source).toContain("enforceAiSessionAccess");
    expect(source).toContain("authenticatedUserId: user.id");
    expect(source).toContain("sessionId: body.session_id");
  });

  it("generate-hint and generate-answer allow sessionless practice modes", () => {
    for (const fn of ["generate-hint", "generate-answer"] as const) {
      const source = readFunction(fn);
      expect(source).toContain("validateSessionlessAiMode");
    }
  });

  it("AI endpoints reserve credits once via hybrid execute", () => {
    for (const fn of ["generate-hint", "generate-answer", "ai-coach-chat"] as const) {
      const source = readFunction(fn);
      expect(source).toContain("executeHybridOperation");
      expect(source).toContain("idempotencyKey");
      expect(source).toContain("creditCost:");
    }
  });
});

describe("Live Practice Coach — useLiveCopilot client contracts", () => {
  it("maps live overlay to rehearsal + practice tags on start", () => {
    const source = readSrc("src/hooks/useLiveCopilot.ts");
    expect(source).toContain('sessionType === "live" ? "rehearsal" : sessionType');
    expect(source).toContain('is_practice: sessionType === "live" ? true : undefined');
    expect(source).toContain("practiceCoachStartIdempotencyKey");
  });

  it("passes sessionless AI mode derived from session type", () => {
    const source = readSrc("src/hooks/useLiveCopilot.ts");
    expect(source).toContain("aiModeForSessionType(sessionType as SessionType)");
  });

  it("cancels a fresh server session when client init fails after start", () => {
    const source = readSrc("src/hooks/useLiveCopilot.ts");
    expect(source).toContain("cancelSessionOnFailure");
    expect(source).toContain('terminal_reason: "CANCELLED"');
    expect(source).toContain("endSessionApi");
  });
});
