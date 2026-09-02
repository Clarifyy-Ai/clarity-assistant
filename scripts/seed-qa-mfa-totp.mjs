#!/usr/bin/env node
/**
 * Enroll a verified TOTP factor for qa.mfa@ and persist the base32 secret in .env.qa.local.
 * Run after: npm run qa:seed-accounts
 *
 * Usage: npm run qa:seed-mfa
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const MFA_FRIENDLY_NAME = "Authenticator app";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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

function base32Decode(secret) {
  const normalized = secret.replace(/=+$/u, "").toUpperCase().replace(/\s+/gu, "");
  let bits = "";
  for (const char of normalized) {
    const val = B32.indexOf(char);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTotp(secret, step = 30, digits = 6) {
  const counter = Math.floor(Date.now() / 1000 / step);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const key = base32Decode(secret);
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits)
      .toString()
      .padStart(digits, "0");
  return code;
}

function upsertEnvLine(filePath, key, value) {
  const lines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8").split(/\r?\n/)
    : [];
  const next = lines.filter((line) => !line.startsWith(`${key}=`));
  next.push(`${key}=${JSON.stringify(value)}`);
  fs.writeFileSync(filePath, `${next.join("\n").trim()}\n`, "utf8");
}

async function clearTotpFactors(client, userId) {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  const factors = [...(data?.totp ?? []), ...(data?.all ?? [])];
  for (const factor of factors) {
    if (factor.factor_type !== "totp") continue;
    if (factor.status === "verified") {
      return factor;
    }
  }
  for (const factor of factors) {
    if (factor.factor_type !== "totp") continue;
    await client.auth.mfa.unenroll({ factorId: factor.id });
  }
  return null;
}

async function main() {
  const env = {
    ...loadEnvFile(path.join(root, ".env.local")),
    ...loadEnvFile(path.join(root, ".env.qa.local")),
    ...process.env,
  };
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY;
  const email = env.QA_MFA_EMAIL;
  const password = env.QA_MFA_PASSWORD;
  if (!url || !anon || !email || !password) {
    console.error(
      "Missing QA_MFA_EMAIL / QA_MFA_PASSWORD — run npm run qa:seed-accounts first.",
    );
    process.exit(1);
  }

  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) {
    console.error("MFA seed sign-in failed:", signedIn.error.message);
    process.exit(1);
  }

  const verified = await clearTotpFactors(client);
  if (verified) {
    const existingSecret = env.QA_MFA_TOTP_SECRET;
    if (existingSecret) {
      console.log(`OK MFA already verified for ${email}`);
      console.log(`Current OTP (30s window): ${generateTotp(existingSecret)}`);
      return;
    }
    console.warn(
      "MFA verified but QA_MFA_TOTP_SECRET missing — unenroll in Settings or use Supabase dashboard, then re-run.",
    );
    process.exit(1);
  }

  const { data: enrolled, error: enrollErr } = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: MFA_FRIENDLY_NAME,
  });
  if (enrollErr || !enrolled?.id) {
    console.error("MFA enroll failed:", enrollErr?.message ?? "no factor id");
    process.exit(1);
  }

  const secret = enrolled.totp?.secret;
  if (!secret) {
    console.error("MFA enroll returned no TOTP secret");
    process.exit(1);
  }

  const code = generateTotp(secret);
  const { data: challenge, error: chErr } = await client.auth.mfa.challenge({
    factorId: enrolled.id,
  });
  if (chErr) {
    console.error("MFA challenge failed:", chErr.message);
    process.exit(1);
  }

  const { error: verifyErr } = await client.auth.mfa.verify({
    factorId: enrolled.id,
    challengeId: challenge.id,
    code,
  });
  if (verifyErr) {
    console.error("MFA verify failed:", verifyErr.message);
    process.exit(1);
  }

  const qaPath = path.join(root, ".env.qa.local");
  upsertEnvLine(qaPath, "QA_MFA_TOTP_SECRET", secret);
  upsertEnvLine(qaPath, "QA_MFA_FACTOR_ID", enrolled.id);
  console.log(`OK enrolled verified TOTP for ${email}`);
  console.log(`Wrote QA_MFA_TOTP_SECRET to ${qaPath}`);
  console.log(`Sample OTP now: ${generateTotp(secret)}`);
  console.log("TC-AUTH-015: sign in with password, then enter OTP from QA_MFA_TOTP_SECRET.");
}

main().catch((err) => {
  console.error("qa:seed-mfa failed:", err?.message ?? err);
  process.exit(1);
});
