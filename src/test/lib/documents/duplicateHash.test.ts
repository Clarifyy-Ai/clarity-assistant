import { describe, expect, it } from "vitest";
import { sha256, sha256Buffer } from "@/lib/utils/hashUtils";

describe("file hash duplicate detection", () => {
  it("identical bytes produce the same SHA-256 (DUPLICATE_DOCUMENT key)", async () => {
    const a = new TextEncoder().encode("resume-bytes-v1").buffer;
    const b = new TextEncoder().encode("resume-bytes-v1").buffer;
    const ha = await sha256Buffer(a);
    const hb = await sha256Buffer(b);
    expect(ha).toBe(hb);
    expect(ha).toHaveLength(64);
  });

  it("different content does not collide", async () => {
    const left = await sha256("resume-bytes-v1");
    const right = await sha256("resume-bytes-v2");
    expect(left).not.toBe(right);
  });
});
