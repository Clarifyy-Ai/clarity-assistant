import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionHistoryItemIsDeletable } from "@/lib/session/sessionHistoryTypes";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("sessionHistoryItemIsDeletable", () => {
  it("allows interview rows with a session id", () => {
    expect(
      sessionHistoryItemIsDeletable({
        sourceKind: "interview",
        sessionId: "11111111-2222-4333-8444-555555555555",
        sourceId: "11111111-2222-4333-8444-555555555555",
      }),
    ).toBe(true);
  });

  it("rejects non-interview source kinds", () => {
    for (const sourceKind of [
      "mock_test",
      "practice_workspace",
      "coding_submission",
    ] as const) {
      expect(
        sessionHistoryItemIsDeletable({
          sourceKind,
          sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          sourceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        }),
      ).toBe(false);
    }
  });
});

describe("Session History Delete actions contract", () => {
  const page = fs.readFileSync(
    path.join(root, "src/pages/app/sessions/CallSessions.tsx"),
    "utf8",
  );

  it("exposes Delete for interview rows with a11y label and non-clipping action cluster", () => {
    expect(page).toContain('aria-label="Delete session"');
    expect(page).toContain("sessionHistoryItemIsDeletable");
    expect(page).toContain("session-history-actions");
    expect(page).toContain("shrink-0 flex flex-wrap");
    expect(page).toContain("min-h-11 min-w-11");
    expect(page).toContain("stopPropagation");
    expect(page).toContain("sessionsDB.delete");
    expect(page).toContain("ConfirmDialog");
    expect(page).toContain("Delete this session?");
  });

  it("does not use the clipped 80px Actions grid as the sole actions container", () => {
    expect(page).not.toContain("grid-cols-[2fr_1fr_1fr_1fr_1fr_80px]");
    // Actions cluster must not sit inside overflow-hidden that clips Delete.
    expect(page).not.toMatch(
      /overflow-hidden[\s\S]{0,220}grid-cols-\[2fr_1fr_1fr_1fr_1fr_80px\]/,
    );
    expect(page).not.toMatch(
      /grid-cols-\[2fr_1fr_1fr_1fr_1fr_80px\][\s\S]{0,220}overflow-hidden/,
    );
  });
});
