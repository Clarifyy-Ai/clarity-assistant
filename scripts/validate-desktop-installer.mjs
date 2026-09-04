#!/usr/bin/env node
/**
 * Validate the configured Windows installer is reachable as a real binary.
 *
 * Usage:
 *   node scripts/validate-desktop-installer.mjs
 *   node scripts/validate-desktop-installer.mjs --base https://trycareerpilot.com
 *   node scripts/validate-desktop-installer.mjs --repo-only
 *
 * Exit 0 when at least one of pretty path / PHP proxy / Storage serves a real binary
 * (or --repo-only wiring checks pass). Exit 1 on failure.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIN_BYTES = 1_000_000;
const OBJECT = "Career-Pilot-Setup.exe";
const SAME_ORIGIN = `/download/${OBJECT}`;

function loadEnv(file) {
  const p = path.join(ROOT, file);
  const out = {};
  if (!fs.existsSync(p)) return out;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim().replace(/\s+#.*$/, "");
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return null;
  return process.argv[idx + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function contentTypeOk(type) {
  if (!type) return true;
  const t = type.toLowerCase();
  if (t.includes("text/html") || t.includes("text/plain") || t.includes("application/json")) {
    return false;
  }
  return (
    t.includes("octet-stream") ||
    t.includes("msdownload") ||
    t.includes("portable-executable") ||
    t.includes("binary") ||
    t.includes("exe")
  );
}

function resolveLength(headers) {
  const cr = headers.get("content-range");
  const total = cr?.match(/\/(\d+)/)?.[1];
  if (total) {
    const n = Number.parseInt(total, 10);
    if (Number.isFinite(n)) return n;
  }
  const n = Number.parseInt(headers.get("content-length") ?? "", 10);
  return Number.isFinite(n) ? n : null;
}

/** Real binary: 200/206, MIME ok, length ≥ 1MB (Content-Length or Content-Range total). */
async function headCheck(url, label) {
  async function evaluate(res) {
    const length = resolveLength(res.headers);
    const type = res.headers.get("content-type");
    const statusOk = res.ok || res.status === 206;
    const ok =
      statusOk && contentTypeOk(type) && length != null && length >= MIN_BYTES;
    console.log(
      `${label}: status=${res.status} type=${type ?? "-"} length=${length ?? "-"} ok=${ok}`,
    );
    return ok;
  }

  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow", cache: "no-store" });
    if (res.status !== 405 && res.status !== 501) {
      const ok = await evaluate(res);
      // Missing length on HEAD → try Range GET before failing
      if (ok) return true;
      if (res.status === 404 || res.status === 403 || res.status === 502 || res.status === 503) {
        return false;
      }
      const type = res.headers.get("content-type");
      if (!contentTypeOk(type)) return false;
      const length = resolveLength(res.headers);
      if (length != null && length < MIN_BYTES) return false;
    }

    const range = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
      redirect: "follow",
      cache: "no-store",
    });
    try {
      await range.body?.cancel();
    } catch {
      /* ignore */
    }
    return evaluate(range);
  } catch (err) {
    console.log(`${label}: network_error ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

function checkRepoWiring() {
  const htaccess = fs.readFileSync(path.join(ROOT, "public", ".htaccess"), "utf8");
  const redirects = fs.readFileSync(path.join(ROOT, "public", "_redirects"), "utf8");
  const php = fs.readFileSync(path.join(ROOT, "public", "download-windows.php"), "utf8");

  const htOk =
    htaccess.includes("download/Career-Pilot-Setup") &&
    htaccess.includes("download-windows.php") &&
    htaccess.includes("DOCUMENT_ROOT") &&
    /RewriteCond[\s\S]*!-f|DOCUMENT_ROOT\}\/download\/Career-Pilot-Setup\.exe -f/.test(
      htaccess,
    );
  const redirectRule = redirects
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("/download/Career-Pilot-Setup.exe") && !l.startsWith("#"));
  const rdOk =
    Boolean(redirectRule) &&
    redirects.includes("github.com") &&
    /\s302\s*$/.test(redirectRule ?? "");
  const phpOk =
    php.includes("application/octet-stream") &&
    php.includes('Content-Disposition: attachment') &&
    php.includes("503") &&
    php.includes("desktop-releases");

  console.log(`repo-htaccess: ok=${htOk}`);
  console.log(`repo-redirects: ok=${rdOk} (pretty path → GitHub 302 for static hosts)`);
  console.log(`repo-php-proxy: ok=${phpOk}`);
  return htOk && rdOk && phpOk;
}

async function main() {
  const env = {
    ...loadEnv(".env"),
    ...loadEnv(".env.local"),
    ...loadEnv(".env.production"),
  };

  const wiringOk = checkRepoWiring();
  if (!wiringOk) {
    console.error("\nFAIL: repo rewrite / PHP proxy wiring incomplete.");
    process.exit(1);
  }

  if (hasFlag("--repo-only")) {
    console.log("\nPASS: repo-only desktop installer wiring checks.");
    process.exit(0);
  }

  const base = (
    argValue("--base") ||
    process.env.PUBLIC_WEBSITE_URL ||
    env.VITE_PUBLIC_SITE_URL ||
    "https://trycareerpilot.com"
  ).replace(/\/+$/, "");

  const supabaseUrl = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");

  console.log(`\nValidating installer against ${base}${SAME_ORIGIN}`);
  const sameOriginOk = await headCheck(`${base}${SAME_ORIGIN}`, "same-origin");
  const phpProxyOk = await headCheck(`${base}/download-windows.php`, "php-proxy");

  let storageOk = false;
  if (supabaseUrl) {
    const storage = `${supabaseUrl}/storage/v1/object/public/desktop-releases/${OBJECT}`;
    storageOk = await headCheck(storage, "supabase-storage");
  } else {
    console.log("supabase-storage: skipped (no VITE_SUPABASE_URL)");
  }

  const anyBinary = sameOriginOk || phpProxyOk || storageOk;
  if (!anyBinary) {
    console.error(
      "\nFAIL: neither pretty path, PHP proxy, nor Storage serves a real binary (≥1MB).\n" +
        "1) npm run publish:desktop-installer (stages public/download/*.exe + Storage)\n" +
        "2) Redeploy public/.htaccess + _redirects + download-windows.php (+ static exe if staged)\n" +
        "3) Ensure GitHub Releases asset exists as PHP fallback\n",
    );
    process.exit(1);
  }

  if (!sameOriginOk && !phpProxyOk && storageOk) {
    console.warn(
      "\nWARN: same-origin paths fail but Storage is healthy — Hostinger rewrite/proxy must be redeployed.\n",
    );
  } else if (!sameOriginOk && phpProxyOk) {
    console.warn(
      "\nWARN: pretty path unhealthy — PHP proxy is healthy. Redeploy .htaccess so /download/*.exe rewrites.\n",
    );
  }

  console.log("\nPASS: Windows installer binary is reachable.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
