import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("referral type parity", () => {
  const types = fs.readFileSync(
    path.join(root, "src/integrations/supabase/types.ts"),
    "utf8",
  );
  const recordReferral = fs.readFileSync(
    path.join(root, "supabase/functions/record-referral/index.ts"),
    "utf8",
  );

  it("generated types include referral programme tables", () => {
    expect(types).toContain("referral_programmes:");
    expect(types).toContain("referral_rewards:");
    expect(types).toContain("referrals:");
    expect(types).toContain("referral_events:");
  });

  it("record-referral edge uses record_referral_reward RPC", () => {
    expect(recordReferral).toContain("record_referral_reward");
    expect(recordReferral).toContain("referral_code");
  });
});
