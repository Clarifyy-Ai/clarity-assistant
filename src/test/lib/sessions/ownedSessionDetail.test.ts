import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("get_owned_session_detail", () => {
  it("is owner-scoped via auth.uid and never joins other users", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260831130000_owned_session_detail.sql"),
      "utf8",
    );
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("s.user_id = v_uid");
    expect(sql).toContain("a.user_id = v_uid");
    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).not.toMatch(/service_role/i);
  });
});
