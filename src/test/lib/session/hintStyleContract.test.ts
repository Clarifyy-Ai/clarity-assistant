import { describe, expect, it } from "vitest";
import {
  hintStyleForStartSession,
  hintStyleFromStartSession,
} from "@/lib/session/hintStyleContract";

describe("hintStyleContract", () => {
  it("maps overlay HintStyle to start-session canonical values", () => {
    expect(hintStyleForStartSession("short_hints")).toBe("minimal");
    expect(hintStyleForStartSession("keywords_only")).toBe("balanced");
    expect(hintStyleForStartSession("full_answer")).toBe("detailed");
  });

  it("maps server values back to overlay HintStyle", () => {
    expect(hintStyleFromStartSession("minimal")).toBe("short_hints");
    expect(hintStyleFromStartSession("balanced")).toBe("keywords_only");
    expect(hintStyleFromStartSession("detailed")).toBe("full_answer");
  });
});
