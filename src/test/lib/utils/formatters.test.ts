// Formatters — covers UI/UX display tests across many sections
import { describe, it, expect } from "vitest";
import {
  formatNumber,
  formatDecimal,
  formatPercent,
  clamp,
  formatScore,
  formatScorePercent,
  formatCents,
  formatMonthlyPrice,
  formatDurationMs,
  formatDurationSec,
  formatDurationProse,
  formatCountdown,
  formatFileSize,
  formatWPM,
} from "@/lib/utils/formatters";

describe("number formatters", () => {
  it("formatNumber adds thousands separator", () => {
    expect(formatNumber(12345)).toBe("12,345");
  });
  it("formatDecimal strips trailing zeros", () => {
    expect(formatDecimal(1.5)).toBe("1.5");
    expect(formatDecimal(1.005, 2)).toBe("1.01");
  });
  it("formatPercent decimal mode", () => {
    expect(formatPercent(0.823)).toBe("82.3%");
  });
  it("formatPercent non-decimal mode", () => {
    expect(formatPercent(82.3, false)).toBe("82.3%");
  });
  it("clamp respects bounds", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it("formatScore", () => {
    expect(formatScore(8.5)).toBe("8.5 / 10");
  });
  it("formatScorePercent", () => {
    expect(formatScorePercent(7)).toBe("70%");
  });
});

describe("currency formatters", () => {
  it("0 cents shows Free", () => {
    expect(formatCents(0)).toBe("Free");
  });
  it("1999 cents → $19.99", () => {
    expect(formatCents(1999)).toBe("$19.99");
  });
  it("hideDecimals strips cents", () => {
    expect(formatCents(2000, true)).toBe("$20");
  });
  it("formatMonthlyPrice", () => {
    expect(formatMonthlyPrice(3900)).toBe("$39/mo");
    expect(formatMonthlyPrice(0)).toBe("Free");
  });
});

describe("duration formatters", () => {
  it("ms < 0 shows 0:00", () => {
    expect(formatDurationMs(-100)).toBe("0:00");
  });
  it("90s shows 1:30", () => {
    expect(formatDurationMs(90000)).toBe("1:30");
  });
  it("3661s shows 1:01:01", () => {
    expect(formatDurationMs(3661000)).toBe("1:01:01");
  });
  it("formatDurationSec wraps ms", () => {
    expect(formatDurationSec(90)).toBe("1:30");
  });
  it("formatDurationProse", () => {
    expect(formatDurationProse(3661000)).toBe("1h 1m 1s");
    expect(formatDurationProse(0)).toBe("0s");
  });
  it("formatCountdown clamps negatives to 0", () => {
    expect(formatCountdown(-5)).toBe("0:00");
  });
});

describe("file size + WPM", () => {
  it("0 bytes shows 0 B", () => {
    expect(formatFileSize(0)).toBe("0 B");
  });
  it("1.5 KB", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });
  it("1.0 MB", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });
  it("formatWPM rounds and adds suffix", () => {
    expect(formatWPM(143.4)).toBe("143 WPM");
  });
});
