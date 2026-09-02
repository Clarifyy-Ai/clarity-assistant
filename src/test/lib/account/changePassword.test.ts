import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("changeAccountPassword contracts", () => {
  const helper = fs.readFileSync(path.join(root, "src/lib/account/changePassword.ts"), "utf8");
  const security = fs.readFileSync(
    path.join(root, "src/pages/app/settings/SettingsSecurity.tsx"),
    "utf8",
  );

  it("uses GoTrue POST helpers, never query strings", () => {
    expect(helper).toContain("signInWithPassword");
    expect(helper).toContain("updateUser");
    expect(helper).not.toMatch(/[?&]password=/);
    expect(helper).not.toMatch(/\blocalStorage\./);
    expect(helper).not.toMatch(/\banalyticsDB\b/);
    expect(helper).not.toMatch(/\bconsole\.(log|debug|info|warn)\b/);
  });

  it("SettingsSecurity delegates to changeAccountPassword", () => {
    expect(security).toContain("changeAccountPassword");
    expect(security).not.toMatch(/updateUser\(\s*\{\s*password:/);
  });
});
