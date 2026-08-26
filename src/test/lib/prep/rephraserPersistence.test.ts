import { beforeEach, describe, expect, it } from "vitest";
import {
  readPersistedRephraserState,
  rephraserStorageKey,
  writePersistedRephraserState,
} from "@/lib/prep/rephraserPersistence";

describe("rephraser persistence", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("round-trips the draft and generated alternatives per user", () => {
    const state = {
      original: "I led a migration and reduced deploy time.",
      alternatives: {
        formal: "I led a migration that reduced deployment time.",
        confident: "I successfully led a migration, cutting deployment time.",
        concise: "Led a migration that cut deployment time.",
      },
      error: null,
      offlineFallback: false,
      idempotencyKey: "prep-tool:rephrase:abc123456789",
    };

    writePersistedRephraserState("user-a", state);

    expect(readPersistedRephraserState("user-a")).toEqual(state);
    expect(readPersistedRephraserState("user-b")).toBeNull();
    expect(localStorage.getItem(rephraserStorageKey("user-a"))).toContain(
      "deployment time",
    );
  });

  it("rejects malformed generated output instead of hydrating it", () => {
    localStorage.setItem(
      rephraserStorageKey("user-a"),
      JSON.stringify({
        original: "draft",
        alternatives: { formal: "only one field" },
        error: null,
        offlineFallback: false,
        idempotencyKey: null,
      }),
    );

    expect(readPersistedRephraserState("user-a")?.alternatives).toBeNull();
  });

  it("migrates legacy sessionStorage entries into localStorage", () => {
    sessionStorage.setItem(
      rephraserStorageKey("user-a"),
      JSON.stringify({
        original: "legacy draft",
        alternatives: {
          formal: "f",
          confident: "c",
          concise: "s",
        },
        error: null,
        offlineFallback: false,
        idempotencyKey: null,
      }),
    );

    const stored = readPersistedRephraserState("user-a");
    expect(stored?.original).toBe("legacy draft");
    expect(localStorage.getItem(rephraserStorageKey("user-a"))).toContain("legacy draft");
  });
});
