import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isSessionDetailId } from "@/lib/sessions/ownedSessionDetail";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("get_owned_session_detail", () => {
  it("is owner-scoped and never raises for not-found or invalid ids", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260901080000_owned_session_detail_hardening.sql"),
      "utf8",
    );
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("s.user_id = v_uid");
    expect(sql).toContain("a.user_id = v_uid");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).toContain("NOT_AUTHENTICATED");
    expect(sql).toContain("invalid_text_representation");
    expect(sql).not.toMatch(/RAISE EXCEPTION/);
    expect(sql).not.toMatch(/service_role/i);
  });
});

describe("isSessionDetailId", () => {
  it("rejects non-uuid session ids before they hit PostgREST", () => {
    expect(isSessionDetailId("not-a-uuid")).toBe(false);
    expect(isSessionDetailId("11111111-2222-4333-8444-555555555555")).toBe(true);
  });
});
