import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AI_MESSAGES } from "@/lib/constants/errorMessages";
import { KILL_ONLY_FLAGS, FEATURE_FLAGS } from "@/lib/constants/features";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("BYOK retired honesty", () => {
  it("keeps BYOK kill-only and does not advertise key entry in Settings Models", () => {
    expect(KILL_ONLY_FLAGS).toContain(FEATURE_FLAGS.BYOK);
    const models = fs.readFileSync(
      path.join(root, "src/pages/app/settings/SettingsModels.tsx"),
      "utf8",
    );
    expect(models).not.toMatch(/BYOK|bring your own|API key/i);
    expect(AI_MESSAGES.BYOK_INVALID).toMatch(/not supported/i);
  });

  it("hides BYOK from admin Access flag category and redirects /settings/byok", () => {
    const flags = fs.readFileSync(
      path.join(root, "src/pages/app/admin/AdminFeatureFlags.tsx"),
      "utf8",
    );
    expect(flags).toContain('"Access":');
    expect(flags).not.toMatch(/"Access":\s*\[[^\]]*"byok"/);
    expect(flags).toContain("id !== FEATURE_FLAGS.BYOK");
    const app = fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");
    expect(app).toMatch(/path:\s*"byok"/);
    expect(app).toContain('Navigate to="/app/settings/models"');
  });
});
