#!/usr/bin/env node
/**
 * Seed QA workbook test accounts into the linked Supabase project.
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local (or env).
 * Writes credentials to .env.qa.local (gitignored) — never commits passwords.
 *
 * Usage: node scripts/seed-qa-accounts.mjs
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const QA_ACCOUNTS = [
  {
    key: "FREE",
    email: "qa.free@clarify.ai.test",
    fullName: "QA Free User",
    planId: "free",
    credits: 50,
    admin: false,
    notes: "Workbook Free tier — 50 monthly credits",
  },
  {
    key: "PRO",
    email: "qa.pro@clarify.ai.test",
    fullName: "QA Pro User",
    planId: "pro",
    credits: 1400,
    admin: false,
    notes: "Workbook Pro tier — Stripe checkout path",
  },
  {
    key: "MAX",
    email: "qa.max@clarify.ai.test",
    fullName: "QA Max User",
    planId: "enterprise",
    credits: 4000,
    admin: false,
    notes: "Workbook Max/Elite → plan_id enterprise (4000 credits)",
  },
  {
    key: "ADMIN",
    email: "qa.admin@clarify.ai.test",
    fullName: "QA Admin User",
    planId: "enterprise",
    credits: 4000,
    admin: true,
    notes: "user_roles.admin + Max credits for admin QA",
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

function genPassword() {
  return `Qa!${crypto.randomBytes(12).toString("base64url")}`;
}

function escapeEnv(value) {
  if (/[\s#"']/.test(value)) return JSON.stringify(value);
  return value;
}

async function upsertAccount(admin, account, password) {
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (list.error) throw list.error;
  let user = (list.data?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === account.email.toLowerCase(),
  );

  if (user) {
    const updated = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, qa_seed: true },
    });
    if (updated.error) throw updated.error;
    user = updated.data.user;
  } else {
    const created = await admin.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, qa_seed: true },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  }

  const now = new Date().toISOString();
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: account.email,
      full_name: account.fullName,
      plan_id: account.planId,
      credits: account.credits,
      credits_used_this_month: 0,
      onboarding_completed: true,
      onboarding_step: 99,
      subscription_status: "active",
      updated_at: now,
    },
    { onConflict: "id" },
  );
  if (profileErr) throw profileErr;

  const { error: subErr } = await admin.from("subscriptions").upsert(
    {
      user_id: user.id,
      plan_id: account.planId,
      status: "active",
      monthly_credits: account.credits,
      updated_at: now,
    },
    { onConflict: "user_id" },
  );
  if (subErr) throw subErr;

  if (account.admin) {
    const { error: roleErr } = await admin.from("user_roles").upsert(
      { user_id: user.id, role: "admin" },
      { onConflict: "user_id,role" },
    );
    if (roleErr) throw roleErr;
  }

  return user.id;
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(root, ".env.production")),
    ...loadEnvFile(path.join(root, ".env.local")),
    ...process.env,
  };

  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (expected in .env.local)",
    );
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const outLines = [
    "# QA test credentials — GENERATED. Do not commit.",
    `# Generated: ${new Date().toISOString()}`,
    `# Project: ${url}`,
    "",
    "QA_BASE_URL_LOCAL=http://localhost:5173",
    "QA_BASE_URL_STAGING=https://clarify.ai.sltfinanceindia.com",
    "QA_BASE_URL_PROD=https://clarify.ai.sltfinanceindia.com",
    `QA_SUPABASE_URL=${url}`,
    `QA_SUPABASE_PROJECT_REF=${env.VITE_SUPABASE_PROJECT_ID || "qzgvjrvtkwlzxpmlddkx"}`,
    "",
    "# Stripe test card (test mode only)",
    "QA_STRIPE_TEST_CARD=4242424242424242",
    "QA_STRIPE_TEST_EXP=12/34",
    "QA_STRIPE_TEST_CVC=123",
    "",
  ];

  console.log(`Seeding ${QA_ACCOUNTS.length} QA accounts → ${url}`);

  for (const account of QA_ACCOUNTS) {
    const password = genPassword();
    const userId = await upsertAccount(admin, account, password);
    outLines.push(`QA_${account.key}_EMAIL=${account.email}`);
    outLines.push(`QA_${account.key}_PASSWORD=${escapeEnv(password)}`);
    outLines.push(`QA_${account.key}_USER_ID=${userId}`);
    outLines.push(`QA_${account.key}_PLAN=${account.planId}`);
    outLines.push(`QA_${account.key}_CREDITS=${account.credits}`);
    outLines.push(`# ${account.notes}`);
    outLines.push("");
    console.log(`OK ${account.key} ${account.email} plan=${account.planId} credits=${account.credits}${account.admin ? " admin" : ""}`);
  }

  const outPath = path.join(root, ".env.qa.local");
  fs.writeFileSync(outPath, outLines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log("Passwords are only in .env.qa.local (gitignored).");
}

main().catch((err) => {
  console.error("seed-qa-accounts failed:", err?.message || err);
  process.exit(1);
});
