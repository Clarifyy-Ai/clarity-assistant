#!/usr/bin/env node
/**
 * Upload the Windows desktop installer to Supabase Storage (public bucket).
 *
 * Prerequisites:
 *   1. npm run dist:win   (or use release-new/Career Pilot Setup *.exe)
 *   2. supabase db push   (creates desktop-releases bucket)
 *   3. Set SUPABASE_SERVICE_ROLE_KEY in .env.local or env
 *
 * Usage:
 *   npm run publish:desktop-installer
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const BUCKET = "desktop-releases";
const OBJECT_NAME = "Career-Pilot-Setup.exe";

function loadEnv() {
  const merged = { ...process.env };
  for (const file of [".env.local", ".env", ".env.production"]) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const i = trimmed.indexOf("=");
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      let val = trimmed.slice(i + 1).trim().replace(/\s+#.*$/, "");
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!merged[key]) merged[key] = val;
    }
  }
  return merged;
}

function findInstaller() {
  const dirs = ["release", "release-new"];
  const preferred = [
    "Career-Pilot-Setup-1.0.0.exe",
    "Career-Pilot-Setup.exe",
    "Career Pilot Setup 1.0.0.exe",
  ];
  for (const dir of dirs) {
    for (const name of preferred) {
      const candidate = path.join(ROOT, dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  for (const dir of dirs) {
    const folder = path.join(ROOT, dir);
    if (!fs.existsSync(folder)) continue;
    const match = fs
      .readdirSync(folder)
      .find((f) => f.endsWith(".exe") && /Career.?Pilot.*Setup/i.test(f));
    if (match) return path.join(folder, match);
  }
  for (const dir of dirs) {
    const folder = path.join(ROOT, dir);
    if (!fs.existsSync(folder)) continue;
    const match = fs
      .readdirSync(folder)
      .find((f) => f.endsWith(".exe") && /setup/i.test(f));
    if (match) return path.join(folder, match);
  }
  return null;
}

async function main() {
  const env = loadEnv();
  const supabaseUrl = env.VITE_SUPABASE_URL?.replace(/\/+$/, "");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error("Missing VITE_SUPABASE_URL in .env.local");
    process.exit(1);
  }
  if (!serviceKey || serviceKey.includes("your_service_role")) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Get it from Supabase Dashboard → Project Settings → API → service_role key.\n" +
        "Add to .env.local (never commit), then re-run.",
    );
    process.exit(1);
  }

  const installerPath = findInstaller();
  if (!installerPath) {
    console.error(
      "No installer found. Run: npm run dist:win\n" +
        "Expected: release/Career-Pilot-Setup-1.0.0.exe",
    );
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(installerPath);
  const mb = (fileBuffer.length / (1024 * 1024)).toFixed(1);
  const fileSizeLimit = 524288000;
  console.log(`Raising ${BUCKET} file size limit to ${fileSizeLimit} bytes`);
  const bucketRes = await fetch(`${supabaseUrl}/storage/v1/bucket/${BUCKET}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      public: true,
      fileSizeLimit,
      allowedMimeTypes: [
        "application/octet-stream",
        "application/x-msdownload",
        "application/vnd.microsoft.portable-executable",
      ],
    }),
  });
  if (!bucketRes.ok) {
    console.error(
      `Bucket update failed (${bucketRes.status}): ${(await bucketRes.text()).slice(0, 300)}`,
    );
  } else {
    console.log("Bucket limit updated");
  }

  const projectRef = String(supabaseUrl).match(/https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
  const managementToken = String(env.SUPABASE_ACCESS_TOKEN ?? "").trim();
  if (projectRef && managementToken.startsWith("sbp_")) {
    const cfgRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/config/storage`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${managementToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fileSizeLimit }),
    });
    console.log(`Project storage limit PATCH ${cfgRes.status}`);
    if (!cfgRes.ok) {
      console.error((await cfgRes.text()).slice(0, 300));
    }
  }

  console.log(`Uploading ${path.basename(installerPath)} (${mb} MB) → ${BUCKET}/${OBJECT_NAME}`);

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET}/${OBJECT_NAME}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/octet-stream",
      "x-upsert": "true",
    },
    body: fileBuffer,
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Upload failed (${res.status}): ${body}`);
    if (res.status === 404) {
      console.error("\nRun migrations first: npx supabase db push");
    }
    process.exit(1);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${OBJECT_NAME}`;
  console.log("\n✅ Upload complete.\n");
  console.log("Public download URL:");
  console.log(publicUrl);
  console.log("\nAdd to production env and redeploy the web app:");
  console.log(`VITE_DESKTOP_DOWNLOAD_URL_WIN=${publicUrl}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
