import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  emptyStorageUsage,
  formatBytes,
  formatStorageCardSubtext,
  formatStorageCardValue,
  fetchStorageUsage,
  type StorageSegment,
} from "@/lib/settings/storageUsage";

vi.mock("@/lib/network/fetchEdge", () => ({
  fetchEdgeJson: vi.fn(),
}));

import { fetchEdgeJson } from "@/lib/network/fetchEdge";

const mockedFetchEdgeJson = vi.mocked(fetchEdgeJson);

describe("formatBytes", () => {
  it("shows 0 B for empty storage", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats non-empty sizes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("returns Unavailable for null/invalid", () => {
    expect(formatBytes(null)).toBe("Unavailable");
    expect(formatBytes(undefined)).toBe("Unavailable");
    expect(formatBytes(Number.NaN)).toBe("Unavailable");
    expect(formatBytes(-1)).toBe("Unavailable");
  });
});

describe("formatStorageCardValue / subtext", () => {
  it("empty account shows zeros, not dashes", () => {
    const empty = emptyStorageUsage();
    expect(formatStorageCardValue(empty.sessions)).toBe("0 B");
    expect(formatStorageCardSubtext(empty.sessions)).toBe("0 items");
    expect(formatStorageCardValue(empty.sessions)).not.toBe("—");
  });

  it("formats non-empty API segments", () => {
    const segment: StorageSegment = { count: 3, bytes: 2048, status: "ok" };
    expect(formatStorageCardValue(segment)).toBe("2 KB");
    expect(formatStorageCardSubtext(segment)).toBe("3 items");
  });

  it("shows Unavailable + reason when measurement fails", () => {
    const segment: StorageSegment = {
      count: 0,
      bytes: null,
      status: "unavailable",
      reason: "Storage list failed",
    };
    expect(formatStorageCardValue(segment)).toBe("Unavailable");
    expect(formatStorageCardSubtext(segment)).toBe("Storage list failed");
  });
});

describe("fetchStorageUsage", () => {
  beforeEach(() => {
    mockedFetchEdgeJson.mockReset();
  });

  it("maps empty ok segments", async () => {
    mockedFetchEdgeJson.mockResolvedValue({
      success: true,
      sessions: { count: 0, bytes: 0, status: "ok" },
      transcripts: { count: 0, bytes: 0, status: "ok" },
      documents: { count: 0, bytes: 0, status: "ok" },
      total: { count: 0, bytes: 0, status: "ok" },
      measured_at: "2026-09-04T00:00:00.000Z",
    });

    const usage = await fetchStorageUsage();
    expect(usage.sessions).toEqual({ count: 0, bytes: 0, status: "ok", reason: undefined });
    expect(formatStorageCardValue(usage.total)).toBe("0 B");
    expect(mockedFetchEdgeJson).toHaveBeenCalledWith("get-user-storage-usage", {});
  });

  it("maps non-empty and unavailable documents", async () => {
    mockedFetchEdgeJson.mockResolvedValue({
      success: true,
      sessions: { count: 2, bytes: 4096, status: "ok" },
      transcripts: { count: 10, bytes: 8192, status: "ok" },
      documents: {
        count: 0,
        bytes: null,
        status: "unavailable",
        reason: "Storage API unavailable",
      },
      total: {
        count: 12,
        bytes: null,
        status: "unavailable",
        reason: "Partial measurement",
      },
      measured_at: "2026-09-04T12:00:00.000Z",
    });

    const usage = await fetchStorageUsage();
    expect(formatStorageCardValue(usage.sessions)).toBe("4 KB");
    expect(formatStorageCardValue(usage.documents)).toBe("Unavailable");
    expect(formatStorageCardSubtext(usage.documents)).toMatch(/Storage API unavailable/i);
  });
});
