import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { SPLASH_BOOT_STATUS, SPLASH_SUPPORTING } from "@/lib/splash/splashCopy";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("HTML boot splash markup", () => {
  const html = read("index.html");
  const splashStart = html.indexOf('id="boot-splash"');
  const styleStart = html.indexOf("<style>", splashStart);
  const splashChunk = html.slice(splashStart, styleStart);
  const styleChunk = html.slice(styleStart, html.indexOf("</style>", styleStart));

  it("keeps Career Pilot brand, tagline, and generic boot status", () => {
    expect(splashStart).toBeGreaterThan(-1);
    expect(splashChunk).toContain(PRODUCT_NAMES.brand);
    expect(splashChunk).toContain(PRODUCT_NAMES.tagline);
    expect(splashChunk).toContain(SPLASH_SUPPORTING);
    expect(splashChunk).toContain(SPLASH_BOOT_STATUS);
    expect(splashChunk).toContain('alt="Career Pilot"');
    expect(splashChunk).not.toContain("Clarify AI");
  });

  it("is theme-aware and honors reduced motion", () => {
    expect(html).toContain("html.dark .boot-splash");
    expect(styleChunk).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styleChunk).not.toContain("clarify-boot-spin");
  });

  it("does not remove the splash before React commits", () => {
    const bootstrap = read("src/bootstrap.tsx");
    expect(bootstrap).not.toMatch(/getElementById\("boot-splash"\)\?\.remove\(\)/);
  });

  it("uses brand blue on the boot watchdog retry control", () => {
    const watchdog = read("public/boot-watchdog.js");
    expect(watchdog).toContain("background:#2563EB");
    expect(watchdog).not.toContain("#8b5cf6");
  });
});
