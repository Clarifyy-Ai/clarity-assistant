import { describe, expect, it } from "vitest";
import {
  isYoutubeUrl,
  normalizeVideoResourceUrl,
  normalizeYoutubeUrl,
  parseYoutubeVideoId,
  youtubeEmbedUrl,
} from "@/lib/learning/youtube";

describe("youtube url helpers", () => {
  it("parses watch, short, embed, and shorts urls", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=DHJaHNZBlPw")).toBe("DHJaHNZBlPw");
    expect(parseYoutubeVideoId("https://youtu.be/DHJaHNZBlPw")).toBe("DHJaHNZBlPw");
    expect(parseYoutubeVideoId("https://www.youtube.com/embed/DHJaHNZBlPw")).toBe("DHJaHNZBlPw");
    expect(parseYoutubeVideoId("https://www.youtube.com/shorts/DHJaHNZBlPw")).toBe("DHJaHNZBlPw");
  });

  it("rejects non-youtube urls", () => {
    expect(parseYoutubeVideoId("https://example.com/video")).toBeNull();
    expect(isYoutubeUrl("https://vimeo.com/123")).toBe(false);
  });

  it("normalizes to canonical watch urls", () => {
    expect(normalizeYoutubeUrl("https://youtu.be/DHJaHNZBlPw")).toBe(
      "https://www.youtube.com/watch?v=DHJaHNZBlPw",
    );
    expect(normalizeVideoResourceUrl("https://youtu.be/DHJaHNZBlPw")).toBe(
      "https://www.youtube.com/watch?v=DHJaHNZBlPw",
    );
    expect(normalizeVideoResourceUrl("https://example.com/doc.pdf")).toBe("https://example.com/doc.pdf");
  });

  it("builds privacy-friendly embed urls", () => {
    expect(youtubeEmbedUrl("DHJaHNZBlPw")).toContain("youtube-nocookie.com/embed/DHJaHNZBlPw");
  });
});
