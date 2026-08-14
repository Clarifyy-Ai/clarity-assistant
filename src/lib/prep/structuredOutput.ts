export type StructuredSection = {
  title: string;
  body: string;
};

const MD_HEADING_RE = /^(#{2,3})\s+(.+)$/;
/** Title-case numbered headings like `1. Requirements` — not sentence list items. */
const NUMBERED_HEADING_RE = /^(\d+)\.\s+([A-Z][^.?\n]{0,70})$/;

function normalizeTitle(raw: string): string {
  return raw
    .replace(/^\d+\.\s+/, "")
    .replace(/:+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headingTitle(
  line: string,
  match: (stripped: string) => string | null,
): string | null {
  if (/^\s{4,}/.test(line)) return null;
  return match(line.replace(/^\s{0,3}/, ""));
}

function splitByHeadingLines(
  text: string,
  match: (line: string) => string | null,
): StructuredSection[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: StructuredSection[] = [];
  let current: StructuredSection | null = null;

  for (const line of lines) {
    const title = headingTitle(line, match);
    if (title) {
      if (current) {
        current.body = current.body.trim();
        sections.push(current);
      }
      current = { title, body: "" };
    } else if (current) {
      current.body += (current.body ? "\n" : "") + line;
    }
  }

  if (current) {
    current.body = current.body.trim();
    sections.push(current);
  }

  if (sections.length === 0) return [];
  const nonempty = sections.filter((s) => s.body.length > 0);
  return nonempty.length > 0 ? nonempty : sections;
}

function matchMarkdownHeading(line: string): string | null {
  const m = line.match(MD_HEADING_RE);
  return m ? normalizeTitle(m[2]) : null;
}

function matchNumberedHeading(line: string): string | null {
  const m = line.match(NUMBERED_HEADING_RE);
  return m ? normalizeTitle(m[2]) : null;
}

/**
 * Split AI / markdown breakdowns into titled sections.
 * Prefers `##` / `###` headings, then numbered headings like `1. Requirements`.
 * Falls back to a single "Breakdown" section when no headings are present.
 */
export function splitMarkdownSections(text: string): StructuredSection[] {
  const trimmed = text.trim();
  if (!trimmed) return [{ title: "Breakdown", body: "" }];

  const markdown = splitByHeadingLines(trimmed, matchMarkdownHeading);
  if (markdown.length > 0) return markdown;

  const numbered = splitByHeadingLines(trimmed, matchNumberedHeading);
  if (numbered.length > 0) return numbered;

  return [{ title: "Breakdown", body: trimmed }];
}
