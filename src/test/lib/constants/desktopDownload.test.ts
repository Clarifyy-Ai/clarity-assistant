import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_INSTALLER_WIN_OBJECT,
  PUBLIC_WINDOWS_INSTALLER_URL,
  isGitHubDownloadHost,
  sameOriginInstallerHref,
} from "@/lib/constants/desktopDownload";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("desktop download wiring", () => {
  it("ships a same-origin Windows installer path", () => {
    expect(PUBLIC_WINDOWS_INSTALLER_URL).toBe("/download/Career-Pilot-Setup.exe");
    expect(PUBLIC_WINDOWS_INSTALLER_URL).toContain(DESKTOP_INSTALLER_WIN_OBJECT);
    expect(PUBLIC_WINDOWS_INSTALLER_URL).not.toMatch(/github\.com/i);
  });

  it("keeps production env pointed at the same-origin Windows installer", () => {
    const production = fs.readFileSync(path.join(root, ".env.production"), "utf8");
    expect(production).toContain(DESKTOP_INSTALLER_WIN_OBJECT);
    expect(production).toMatch(/VITE_DESKTOP_DOWNLOAD_URL_WIN=\/download\/Career-Pilot-Setup\.exe/);
    expect(production).not.toMatch(/VITE_DESKTOP_DOWNLOAD_URL_WIN=\s*$/m);
    expect(production).not.toMatch(/VITE_DESKTOP_DOWNLOAD_URL_WIN=https:\/\/github\.com/i);
  });

  it("falls back to the public installer path when a direct Windows URL is not set", () => {
    const source = fs.readFileSync(
      path.join(root, "src/lib/constants/desktopDownload.ts"),
      "utf8",
    );
    expect(source).toContain("PUBLIC_WINDOWS_INSTALLER_URL");
    expect(source).toContain("sanitizeProductionUrl(import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_WIN");
  });

  it("rewrites GitHub installer URLs to the same-origin proxy", () => {
    expect(
      isGitHubDownloadHost(
        "https://github.com/Clarifyy-Ai/career-pilot-releases/releases/latest/download/Career-Pilot-Setup.exe",
      ),
    ).toBe(true);
    expect(
      sameOriginInstallerHref(
        "https://github.com/Clarifyy-Ai/career-pilot-releases/releases/latest/download/Career-Pilot-Setup.exe",
        "windows",
      ),
    ).toBe("/download/Career-Pilot-Setup.exe");
    expect(sameOriginInstallerHref("/download/Career-Pilot-Setup.exe", "windows")).toBe(
      "/download/Career-Pilot-Setup.exe",
    );
  });

  it("keeps the Hostinger proxy files in public/", () => {
    expect(fs.existsSync(path.join(root, "public", "download-windows.php"))).toBe(true);
    const htaccess = fs.readFileSync(path.join(root, "public", ".htaccess"), "utf8");
    expect(htaccess).toContain("download/Career-Pilot-Setup");
    expect(htaccess).toContain("download-windows.php");
  });
});
