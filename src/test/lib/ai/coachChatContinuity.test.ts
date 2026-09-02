import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("coach chat continuity", () => {
  it("passes previous turns and a bounded timeout", () => {
    const client = read("src/lib/ai/openaiClient.ts");
    const session = read("src/lib/ai/coachChatSession.ts");
    const edge = read("supabase/functions/ai-coach-chat/index.ts");
    expect(client).toContain("previous_turns");
    expect(client).toContain("timeoutMs: opts.timeoutMs ?? 45_000");
    expect(session).toContain("previousTurns");
    expect(session).toContain("CP-10245");
    expect(session).toContain("return true");
    expect(session).toContain("return false");
    expect(edge).toContain("previous_turns");
    expect(edge).toContain("mergedHistory");
  });

  it("clears the overlay composer only after submit resolves", () => {
    const input = read("src/components/overlay/OverlayChatInput.tsx");
    expect(input).toContain("if (accepted !== false) setValue(\"\")");
    expect(input).toContain("isSubmitting");
  });
});
