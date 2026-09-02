#!/usr/bin/env node
/**
 * Reset QA fixture state that drifts during manual testing.
 * - NEW_USER_01 / qa.onboarding@ → onboarding incomplete
 * - LOW_CREDIT_01 / EXACT_CREDIT_01 / ZERO_CREDIT_01 → canonical credit balances
 *
 * Usage: npm run qa:reset-fixtures
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const FIXTURE_RESETS = [
  {
    label: "NEW_USER_01 (onboarding)",
    emailKey: "QA_ONBOARDING_EMAIL",
    profile: {
      onboarding_completed: false,
      onboarding_step: 1,
      target_role: null,
      role_type: null,
      industry: null,
      interview_date: null,
      improvement_goals: [],
    },
  },
  {
    label: "LOW_CREDIT_01",
    emailKey: "QA_LOW_CREDIT_EMAIL",
    profile: { credits: 5, onboarding_completed: true, onboarding_step: 99 },
  },
  {
    label: "EXACT_CREDIT_01",
    emailKey: "QA_EXACT_CREDIT_EMAIL",
    profile: { credits: 3, onboarding_completed: true, onboarding_step: 99 },
  },
  {
    label: "ZERO_CREDIT_01",
    emailKey: "QA_ZERO_CREDIT_EMAIL",
    profile: { credits: 0, onboarding_completed: true, onboarding_step: 99 },
  },
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(root, ".env.local")),
    ...loadEnvFile(path.join(root, ".env.qa.local")),
    ...process.env,
  };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const fixture of FIXTURE_RESETS) {
    const email = env[fixture.emailKey];
    if (!email) {
      console.warn(`SKIP ${fixture.label}: ${fixture.emailKey} missing — run npm run qa:seed-accounts`);
      continue;
    }
    const { data: profile, error: findErr } = await admin
      .from("profiles")
      .select("id,email")
      .eq("email", email)
      .maybeSingle();
    if (findErr || !profile?.id) {
      console.warn(`SKIP ${fixture.label}: profile not found for ${email}`);
      continue;
    }
    const { error } = await admin
      .from("profiles")
      .update({ ...fixture.profile, updated_at: new Date().toISOString() })
      .eq("id", profile.id);
    if (error) {
      console.error(`FAIL ${fixture.label}:`, error.message);
      process.exitCode = 1;
      continue;
    }
    console.log(`OK ${fixture.label} → ${email}`);
  }

  console.log("Done. Re-run onboarding/credit boundary cases after this reset.");
}

main().catch((err) => {
  console.error("qa:reset-fixtures failed:", err?.message ?? err);
  process.exit(1);
});
