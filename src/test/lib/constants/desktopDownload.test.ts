import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_INSTALLER_WIN_OBJECT,
  PUBLIC_WINDOWS_INSTALLER_URL,
} from "@/lib/constants/desktopDownload";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("desktop download wiring", () => {
  it("ships a public Windows installer URL", () => {
    expect(PUBLIC_WINDOWS_INSTALLER_URL).toContain(DESKTOP_INSTALLER_WIN_OBJECT);
    expect(PUBLIC_WINDOWS_INSTALLER_URL).toMatch(/^https:\/\/github\.com\/Clarifyy-Ai\/career-pilot-releases\//);
    expect(PUBLIC_WINDOWS_INSTALLER_URL).toContain("/releases/latest/download/");
  });

  it("keeps production env pointed at the public Windows installer", () => {
    const production = fs.readFileSync(path.join(root, ".env.production"), "utf8");
    expect(production).toContain(DESKTOP_INSTALLER_WIN_OBJECT);
    expect(production).toContain("career-pilot-releases");
    expect(production).not.toMatch(/VITE_DESKTOP_DOWNLOAD_URL_WIN=\s*$/m);
  });

  it("falls back to the public GitHub installer when a direct Windows URL is not set", () => {
    const source = fs.readFileSync(
      path.join(root, "src/lib/constants/desktopDownload.ts"),
      "utf8",
    );
    expect(source).toContain("PUBLIC_WINDOWS_INSTALLER_URL");
    expect(source).toContain("sanitizeProductionUrl(import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_WIN");
  });
});
