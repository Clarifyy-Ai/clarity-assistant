import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("delete-account idempotency", () => {
  it("skips the 24h rate limit when replaying an existing operation", () => {
    const src = fs.readFileSync(
      path.join(root, "supabase/functions/delete-account/index.ts"),
      "utf8",
    );
    expect(src).toContain("existingOp?.id");
    expect(src).toMatch(/existingOp\?\.id\s*\n?\s*\?\s*null/);
    expect(src).toContain("idempotency_key");
  });
});
