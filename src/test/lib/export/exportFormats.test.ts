import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  exportFilenameForType,
  exportFormatBadge,
  exportMimeForType,
  serializeExportDownload,
  toSessionsCsv,
  toTranscriptsCsv,
} from "@/lib/export/exportFormats";

const root = resolve(process.cwd());

describe("exportFormats", () => {
  it("sessions CSV has header row, text/csv MIME, .csv filename", () => {
    const payload = {
      sessions: [
        {
          id: "s1",
          session_type: "mock",
          title: "Practice",
          created_at: "2026-09-01T00:00:00Z",
          metrics: { filler_words: 2, avg_wpm: 120 },
        },
      ],
    };
    const csv = toSessionsCsv(payload);
    expect(csv.split("\n")[0]).toMatch(/^id,session_type,title,/);
    expect(csv).toContain("s1");

    const download = serializeExportDownload("sessions", payload);
    expect(download.format).toBe("CSV");
    expect(download.mime).toMatch(/^text\/csv/);
    expect(download.filename).toMatch(/^career-pilot-sessions-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(exportFormatBadge("sessions")).toBe("CSV");
    expect(exportMimeForType("sessions")).toMatch(/^text\/csv/);
  });

  it("full export is pretty JSON with matching MIME/filename", () => {
    const payload = { exported_at: "2026-09-04T00:00:00Z", user_id: "u1", sessions: [] };
    const download = serializeExportDownload("full", payload);
    expect(download.format).toBe("JSON");
    expect(download.mime).toMatch(/^application\/json/);
    expect(download.filename).toMatch(/^career-pilot-full-\d{4}-\d{2}-\d{2}\.json$/);
    expect(download.blob).toBeInstanceOf(Blob);
    expect(download.blob.size).toBeGreaterThan(10);
    const pretty = JSON.stringify(payload, null, 2);
    expect(pretty).toContain("\n");
    expect(pretty).toContain('"user_id": "u1"');
  });

  it("filename helper uses career-pilot-{type}-{date}.{ext}", () => {
    expect(exportFilenameForType("sessions", "2026-09-04")).toBe(
      "career-pilot-sessions-2026-09-04.csv",
    );
    expect(exportFilenameForType("full", "2026-09-04")).toBe("career-pilot-full-2026-09-04.json");
  });

  it("badge format matches downloaded type", () => {
    for (const type of ["sessions", "transcripts", "answers", "interviews"] as const) {
      expect(exportFormatBadge(type)).toBe("CSV");
      expect(serializeExportDownload(type, {}).format).toBe("CSV");
    }
    expect(exportFormatBadge("full")).toBe("JSON");
    expect(serializeExportDownload("full", {}).format).toBe("JSON");
  });

  it("transcripts CSV includes human headers", () => {
    const csv = toTranscriptsCsv({
      transcripts: [{ id: "t1", session_id: "s1", content: "hello, world", speaker: "user" }],
    });
    expect(csv.startsWith("id,session_id,speaker,content")).toBe(true);
    expect(csv).toContain('"hello, world"');
  });
});

describe("mixed content / startTime / Permissions-Policy contracts", () => {
  it("Settings Data + export helpers have no startTime and no http:// download paths", () => {
    const settingsData = readFileSync(
      resolve(root, "src/pages/app/settings/SettingsData.tsx"),
      "utf8",
    );
    const exportFormats = readFileSync(resolve(root, "src/lib/export/exportFormats.ts"), "utf8");
    const storageUsage = readFileSync(resolve(root, "src/lib/settings/storageUsage.ts"), "utf8");

    for (const src of [settingsData, exportFormats, storageUsage]) {
      expect(src).not.toMatch(/\bstartTime\b/);
      expect(src).not.toMatch(/http:\/\//);
    }
    expect(exportFormats).toMatch(/blob:/);
    expect(exportFormats).toMatch(/createObjectURL/);
  });

  it("Permissions-Policy is aligned across index.html, vite, and .htaccess", () => {
    const expected =
      "camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), fullscreen=(self)";
    const indexHtml = readFileSync(resolve(root, "index.html"), "utf8");
    const viteConfig = readFileSync(resolve(root, "vite.config.ts"), "utf8");
    const htaccess = readFileSync(resolve(root, "public/.htaccess"), "utf8");

    expect(indexHtml).toContain(expected);
    expect(viteConfig).toContain(expected);
    expect(htaccess).toContain(expected);
  });
});
