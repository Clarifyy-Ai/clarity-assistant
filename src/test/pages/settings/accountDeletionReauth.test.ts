import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("account deletion reauth + idempotency", () => {
  it("SettingsDanger requires password reauth and reuses Idempotency-Key", () => {
    const src = fs.readFileSync(
      path.join(root, "src/pages/app/settings/SettingsDanger.tsx"),
      "utf8",
    );
    expect(src).toContain("signInWithPassword");
    expect(src).toContain("deletePassword");
    expect(src).toContain("Idempotency-Key");
    expect(src).toContain("deleteIdempotencyKey");
    expect(src).toContain('fetchEdge("delete-account"');
  });
});
