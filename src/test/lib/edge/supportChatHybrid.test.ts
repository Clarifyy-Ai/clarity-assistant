import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("support-chat hybrid contracts", () => {
  const source = read("supabase/functions/support-chat/index.ts");
  const fetchEdge = read("src/lib/network/fetchEdge.ts");
  const eventsSql = read("supabase/migrations/20260901140000_hybrid_support_live_chat.sql");

  it("bootstraps without calling AI", () => {
    expect(source).toContain('if (action === "bootstrap")');
    const bootstrapStart = source.indexOf('if (action === "bootstrap")');
    const bootstrapEnd = source.indexOf('if (action === "list_threads")');
    const bootstrap = source.slice(bootstrapStart, bootstrapEnd);
    expect(bootstrap).not.toContain("produceReply");
    expect(bootstrap).not.toContain("generateWithFallback");
  });

  it("sends with client_message_id and returns existing row on unique conflict", () => {
    expect(source).toContain("client_message_id");
    expect(source).toMatch(/duplicate\|unique/);
    expect(source).toContain("reused: true");
  });

  it("rejects foreign thread access with 403", () => {
    expect(source).toContain("forbidden");
    expect(source).toContain('code: "FORBIDDEN"');
    expect(source).toContain("403");
  });

  it("never deducts practice credits", () => {
    expect(source).not.toMatch(/deduct[-_]?credits/i);
    expect(source).not.toContain("deduct_credits");
    expect(fetchEdge).toMatch(/CREDIT_REFRESH_SKIP[\s\S]*?"support-chat"/);
  });

  it("passes action support_chat when AI is used", () => {
    expect(source).toContain('action: "support_chat"');
    expect(source).toContain("generateWithFallback({");
  });

  it("escalates to waiting_agent and stores internal notes off the user message list", () => {
    expect(source).toContain('mode: "waiting_agent"');
    expect(source).toContain('event_type: "internal_note"');
    expect(source).toContain('visibility: "internal"');
    expect(source).toContain(".from(\"support_messages\")");
    const loadMessages = source.slice(
      source.indexOf("async function loadMessages"),
      source.indexOf("async function insertEvent"),
    );
    expect(loadMessages).not.toContain("support_events");
  });

  it("keeps user RLS from reading internal support_events", () => {
    expect(eventsSql).toContain("visibility = 'user'");
    expect(eventsSql).toContain("support_events_user_select");
  });
});
