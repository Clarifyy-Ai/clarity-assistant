import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DESKTOP_INSTALLER_MIN_BYTES,
  DESKTOP_INSTALLER_WIN_OBJECT,
  PUBLIC_WINDOWS_INSTALLER_URL,
  SAME_ORIGIN_WINDOWS_INSTALLER_PATH,
  isGitHubDownloadHost,
  probeDesktopInstaller,
  sameOriginInstallerHref,
} from "@/lib/constants/desktopDownload";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function mockResponse(init: {
  status: number;
  contentType?: string | null;
  contentLength?: string | null;
  contentRange?: string | null;
}): Response {
  const headers = new Headers();
  if (init.contentType) headers.set("content-type", init.contentType);
  if (init.contentLength) headers.set("content-length", init.contentLength);
  if (init.contentRange) headers.set("content-range", init.contentRange);
  return new Response(null, { status: init.status, headers });
}

describe("desktop download wiring", () => {
  it("ships a same-origin Windows installer path", () => {
    expect(PUBLIC_WINDOWS_INSTALLER_URL).toBe("/download/Career-Pilot-Setup.exe");
    expect(PUBLIC_WINDOWS_INSTALLER_URL).toContain(DESKTOP_INSTALLER_WIN_OBJECT);
    expect(PUBLIC_WINDOWS_INSTALLER_URL).not.toMatch(/github\.com/i);
    expect(SAME_ORIGIN_WINDOWS_INSTALLER_PATH).toBe(PUBLIC_WINDOWS_INSTALLER_URL);
  });

  it("keeps production env pointed at the same-origin Windows installer", () => {
    const production = fs.readFileSync(path.join(root, ".env.production"), "utf8");
    expect(production).toContain(DESKTOP_INSTALLER_WIN_OBJECT);
    expect(production).toMatch(/VITE_DESKTOP_DOWNLOAD_URL_WIN=\/download\/Career-Pilot-Setup\.exe/);
    expect(production).not.toMatch(/VITE_DESKTOP_DOWNLOAD_URL_WIN=\s*$/m);
    expect(production).not.toMatch(/VITE_DESKTOP_DOWNLOAD_URL_WIN=https:\/\/github\.com/i);
  });

  it("Interview Day and Dashboard share DesktopDownloadButton — no page-local installer URL", () => {
    for (const rel of ["src/pages/app/InterviewDay.tsx", "src/pages/app/Dashboard.tsx"]) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      expect(src).toContain("DesktopDownloadButton");
      expect(src).not.toMatch(/github\.com\/.*Career-Pilot-Setup/i);
      expect(src).not.toMatch(/https?:\/\/[^"']+\.exe/);
    }
  });

  it("falls back to the public installer path when a direct Windows URL is not set", () => {
    const source = fs.readFileSync(
      path.join(root, "src/lib/constants/desktopDownload.ts"),
      "utf8",
    );
    expect(source).toContain("PUBLIC_WINDOWS_INSTALLER_URL");
    expect(source).toContain("sanitizeProductionUrl(import.meta.env.VITE_DESKTOP_DOWNLOAD_URL_WIN");
    expect(source).toContain("probeDesktopInstaller");
    expect(source).toContain("missing_length");
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

  it("keeps Hostinger .htaccess prefer-static + PHP, and static-host GitHub 302", () => {
    expect(fs.existsSync(path.join(root, "public", "download-windows.php"))).toBe(true);
    const htaccess = fs.readFileSync(path.join(root, "public", ".htaccess"), "utf8");
    expect(htaccess).toContain("download/Career-Pilot-Setup");
    expect(htaccess).toContain("download-windows.php");
    expect(htaccess).toContain("DOCUMENT_ROOT");
    const redirects = fs.readFileSync(path.join(root, "public", "_redirects"), "utf8");
    expect(redirects).toContain("/download/Career-Pilot-Setup.exe");
    expect(redirects).toMatch(/Career-Pilot-Setup\.exe\s+https:\/\/github\.com\/.+\s+302/);
    expect(redirects.indexOf("/download/Career-Pilot-Setup.exe")).toBeLessThan(
      redirects.indexOf("/*"),
    );
    const php = fs.readFileSync(path.join(root, "public", "download-windows.php"), "utf8");
    expect(php).toContain("503");
    expect(php).toContain("application/octet-stream");
    expect(php).toContain('Content-Disposition: attachment');
  });
});

describe("probeDesktopInstaller", () => {
  it("accepts a healthy octet-stream HEAD", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({
        status: 200,
        contentType: "application/octet-stream",
        contentLength: String(DESKTOP_INSTALLER_MIN_BYTES + 10),
      }),
    );
    const result = await probeDesktopInstaller("/download/Career-Pilot-Setup.exe", fetchImpl as typeof fetch);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("rejects missing path (404)", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({ status: 404, contentType: "text/plain", contentLength: "9" }),
    );
    const result = await probeDesktopInstaller("/download/Career-Pilot-Setup.exe", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("http_404");
  });

  it("rejects HTML error bodies disguised as 200", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({
        status: 200,
        contentType: "text/html; charset=utf-8",
        contentLength: String(DESKTOP_INSTALLER_MIN_BYTES + 1),
      }),
    );
    const result = await probeDesktopInstaller("/download/Career-Pilot-Setup.exe", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("bad_content_type");
  });

  it("rejects text/plain and JSON MIME types", async () => {
    for (const contentType of ["text/plain", "application/json"]) {
      const fetchImpl = vi.fn(async () =>
        mockResponse({
          status: 200,
          contentType,
          contentLength: String(DESKTOP_INSTALLER_MIN_BYTES + 1),
        }),
      );
      const result = await probeDesktopInstaller(
        "/download/Career-Pilot-Setup.exe",
        fetchImpl as typeof fetch,
      );
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("bad_content_type");
    }
  });

  it("rejects tiny payloads", async () => {
    const fetchImpl = vi.fn(async () =>
      mockResponse({
        status: 200,
        contentType: "application/octet-stream",
        contentLength: "120",
      }),
    );
    const result = await probeDesktopInstaller("/download/Career-Pilot-Setup.exe", fetchImpl as typeof fetch);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("too_small");
  });

  it("rejects missing Content-Length without Content-Range total", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return mockResponse({
          status: 200,
          contentType: "application/octet-stream",
        });
      }
      return mockResponse({
        status: 200,
        contentType: "application/octet-stream",
      });
    });
    const result = await probeDesktopInstaller(
      "/download/Career-Pilot-Setup.exe",
      fetchImpl as typeof fetch,
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_length");
  });

  it("accepts Content-Range total ≥ MIN_BYTES on Range GET", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return mockResponse({
          status: 200,
          contentType: "application/octet-stream",
        });
      }
      return mockResponse({
        status: 206,
        contentType: "application/octet-stream",
        contentLength: "1",
        contentRange: `bytes 0-0/${DESKTOP_INSTALLER_MIN_BYTES + 5}`,
      });
    });
    const result = await probeDesktopInstaller(
      "/download/Career-Pilot-Setup.exe",
      fetchImpl as typeof fetch,
    );
    expect(result.ok).toBe(true);
  });

  it("falls back to Range GET when HEAD is 405", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return mockResponse({ status: 405 });
      }
      return mockResponse({
        status: 206,
        contentType: "application/octet-stream",
        contentLength: "1",
        contentRange: `bytes 0-0/${DESKTOP_INSTALLER_MIN_BYTES + 5}`,
      });
    });
    const result = await probeDesktopInstaller(
      "/download/Career-Pilot-Setup.exe",
      fetchImpl as typeof fetch,
    );
    expect(result.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resolveAvailableWindowsInstallerHref tries PHP proxy after pretty-path 404", async () => {
    const { resolveAvailableWindowsInstallerHref } = await import("@/lib/constants/desktopDownload");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("Career-Pilot-Setup.exe")) {
        return mockResponse({ status: 404, contentType: "text/plain", contentLength: "9" });
      }
      return mockResponse({
        status: 200,
        contentType: "application/octet-stream",
        contentLength: String(DESKTOP_INSTALLER_MIN_BYTES + 10),
      });
    });
    const href = await resolveAvailableWindowsInstallerHref(
      "/download/Career-Pilot-Setup.exe",
      fetchImpl as typeof fetch,
    );
    expect(href).toBe("/download-windows.php");
  });

  it("resolveAvailableWindowsInstallerHref returns null when all candidates missing", async () => {
    const { resolveAvailableWindowsInstallerHref } = await import("@/lib/constants/desktopDownload");
    const fetchImpl = vi.fn(async () =>
      mockResponse({ status: 404, contentType: "text/plain", contentLength: "9" }),
    );
    const href = await resolveAvailableWindowsInstallerHref(null, fetchImpl as typeof fetch);
    expect(href).toBeNull();
  });
});

describe("useDesktopDownload fail-closed contract", () => {
  it("probes before toasting success and fail-closes unavailable CTA", () => {
    const hook = fs.readFileSync(path.join(root, "src/hooks/useDesktopDownload.ts"), "utf8");
    expect(hook).toContain("resolveAvailableWindowsInstallerHref");
    expect(hook).toContain("Desktop app not available yet");
    expect(hook).toMatch(
      /toast\.success[\s\S]*startSameOriginInstallerDownload|startSameOriginInstallerDownload[\s\S]*toast\.success/,
    );
    const btn = fs.readFileSync(
      path.join(root, "src/components/common/DesktopDownloadButton.tsx"),
      "utf8",
    );
    expect(btn).toContain("desktop-installer-unavailable");
    expect(btn).toContain("Desktop app not available yet");
    expect(btn).toContain("disabled={loading}");
    expect(btn).toContain('data-installer-available={url ? "true" : "false"}');
  });
});
