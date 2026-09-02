import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LEGAL_EMAIL, PRIVACY_EMAIL } from "@/lib/constants/contact";

function readRepo(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("legal mailto links — TC-PUB-007 / TC-PUB-008 triage", () => {
  it("Terms contact uses a well-formed mailto href with no app fetch", () => {
    const terms = readRepo("src/pages/marketing/Terms.tsx");

    expect(terms).toContain('href={`mailto:${LEGAL_EMAIL}`}');
    expect(terms).toContain("{LEGAL_EMAIL}");
    expect(terms).not.toMatch(/fetch\s*\(.*mailto/i);
    expect(terms).not.toMatch(/fetchEdge.*mailto/i);
    expect(terms).toMatch(/canceled.*mailto.*DevTools is normal/i);
  });

  it("Privacy contact uses a well-formed mailto href with no app fetch", () => {
    const privacy = readRepo("src/pages/marketing/Privacy.tsx");

    expect(privacy).toContain('href={`mailto:${PRIVACY_EMAIL}`}');
    expect(privacy).toContain("{PRIVACY_EMAIL}");
    expect(privacy).not.toMatch(/fetch\s*\(.*mailto/i);
    expect(privacy).not.toMatch(/fetchEdge.*mailto/i);
    expect(privacy).toMatch(/canceled.*mailto.*DevTools is normal/i);
  });

  it("contact constants resolve to a single valid mailbox", () => {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    expect(LEGAL_EMAIL).toMatch(emailPattern);
    expect(PRIVACY_EMAIL).toMatch(emailPattern);
    expect(`mailto:${LEGAL_EMAIL}`).toBe(`mailto:${PRIVACY_EMAIL}`);
  });
});
