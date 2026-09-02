import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdvisoryBanner } from "@/components/common/AdvisoryBanner";
import { CommandDialog, CommandInput } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  contrastRatio,
  THEME_CONTRAST_PAIRS,
  WCAG_AA_NORMAL_TEXT,
} from "@/lib/a11y/contrast";
import { AlertTriangle } from "lucide-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

describe("AdvisoryBanner accessibility", () => {
  it("renders with note semantics and readable copy", () => {
    render(
      <AdvisoryBanner icon={AlertTriangle} title="Visible on screen share.">
        The overlay stays visible during screen share.
      </AdvisoryBanner>,
    );
    expect(screen.getByRole("note")).toHaveTextContent("Visible on screen share.");
    expect(screen.getByText(/stays visible during screen share/i)).toBeInTheDocument();
  });

  it("uses theme-aware contrast classes (light + dark)", () => {
    const source = read("src/components/common/AdvisoryBanner.tsx");
    expect(source).toContain("bg-brand-50 text-brand-900");
    expect(source).toContain("dark:bg-indigo-950/55 dark:text-indigo-50");
    expect(source).not.toContain("text-indigo-100");
  });

  it("meets WCAG AA contrast for light and dark advisory palettes", () => {
    expect(contrastRatio("#0B1220", "#EFF6FF")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(contrastRatio("#EEF2FF", "#1E1B4B")).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});

describe("CommandDialog accessibility (global search)", () => {
  it("exposes DialogTitle and DialogDescription for assistive tech", () => {
    render(
      <CommandDialog open onOpenChange={() => {}}>
        <CommandInput placeholder="Search pages" />
      </CommandDialog>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Global search")).toBeInTheDocument();
    expect(screen.getByText(/Use arrow keys to navigate results/i)).toBeInTheDocument();
  });

  it("does not emit Radix DialogTitle warnings when opened", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <CommandDialog open onOpenChange={() => {}}>
        <CommandInput placeholder="Search pages" />
      </CommandDialog>,
    );
    const radixWarnings = warn.mock.calls
      .flat()
      .filter((msg) => typeof msg === "string" && msg.includes("DialogContent"));
    expect(radixWarnings).toHaveLength(0);
    warn.mockRestore();
  });
});

describe("CommandDialog source contracts", () => {
  it("composes DialogHeader with hidden title and description", () => {
    const command = read("src/components/ui/command.tsx");
    expect(command).toContain('<DialogHeader className="sr-only">');
    expect(command).toContain("<DialogTitle>");
    expect(command).toContain("<DialogDescription");
    expect(command).toContain("Global search");
  });
});

describe("theme token contrast", () => {
  it("keeps muted and body text at WCAG AA on light and dark backgrounds", () => {
    for (const pair of Object.values(THEME_CONTRAST_PAIRS)) {
      expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });

  it("does not use washed-out ghost or muted-foreground/50 tokens", () => {
    const css = read("src/index.css");
    expect(css).toContain("--muted-foreground:   215 16% 38%;");
    expect(css).toContain("--muted-foreground:   215 16% 72%;");
    const button = read("src/components/ui/Button.tsx");
    expect(button).toContain("text-foreground border-transparent");
    expect(button).not.toContain("text-muted-foreground hover:text-foreground");
  });
});

describe("DialogContent accessible name fallback", () => {
  it("injects a title when callers omit DialogTitle", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>Untitled body</DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Dialog")).toBeInTheDocument();
    const radixWarnings = warn.mock.calls
      .flat()
      .filter((msg) => typeof msg === "string" && msg.includes("DialogContent"));
    expect(radixWarnings).toHaveLength(0);
    warn.mockRestore();
  });
});

describe("Guide banner source contracts (BUG-010)", () => {
  it("replaces washed-out indigo advisory styles in guide panel", () => {
    const guide = read("src/components/overlay/OverlaySetupGuidePanel.tsx");
    expect(guide).toContain("AdvisoryBanner");
    expect(guide).not.toContain("text-indigo-100");
    expect(guide).not.toContain("bg-indigo-500/8");
  });
});

describe("Question Bank filter alignment", () => {
  it("vertically aligns the filter icon with the filter selects", () => {
    const bank = read("src/pages/app/question-bank/QuestionBank.tsx");
    expect(bank).toContain("sm:items-center");
    expect(bank).toContain("leftIcon={<Search");
    expect(bank).not.toMatch(/<Filter className="hidden h-4 w-4 sm:block" \/>/);
  });
});
