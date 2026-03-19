import type { HintStyle } from "@/types/user.types";

// ─────────────────────────────────────────────────────────────────
// Overlay Compositor
// Formats AI hint text for visual display inside the overlay.
// Handles markdown-like parsing, keyword highlighting,
// hint style rendering, and accessibility sizing.
// ─────────────────────────────────────────────────────────────────

export interface ComposedHint {
  lines:         ComposedLine[];
  hasCode:       boolean;
  estimatedRows: number;
}

export interface ComposedLine {
  type:    "header" | "bullet" | "code" | "text" | "blank" | "keyword";
  content: string;
  indent:  number;
  bold:    boolean;
}

// ─────────────────────────────────────────────────────────────────
// Parse raw hint text into structured lines
// ─────────────────────────────────────────────────────────────────

export function composeHint(
  rawText: string,
  hintStyle: HintStyle
): ComposedHint {
  if (!rawText.trim()) {
    return { lines: [], hasCode: false, estimatedRows: 0 };
  }

  const rawLines = rawText
    .replace(/\r\n/g, "\n")
    .split("\n");

  const lines: ComposedLine[] = [];
  let inCodeBlock = false;
  let hasCode = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();

    // ── Code block fences ────────────────────────────────
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      hasCode = true;
      continue;
    }

    if (inCodeBlock) {
      lines.push({ type: "code", content: raw, indent: 0, bold: false });
      continue;
    }

    // ── Blank line ────────────────────────────────────────
    if (!trimmed) {
      lines.push({ type: "blank", content: "", indent: 0, bold: false });
      continue;
    }

    // ── Markdown headers ──────────────────────────────────
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      lines.push({
        type:    "header",
        content: headerMatch[2],
        indent:  0,
        bold:    true,
      });
      continue;
    }

    // ── Bullet points ─────────────────────────────────────
    const bulletMatch = raw.match(/^(\s*)[•\-\*]\s+(.+)$/);
    if (bulletMatch) {
      const indent = Math.floor((bulletMatch[1]?.length ?? 0) / 2);
      lines.push({
        type:    "bullet",
        content: bulletMatch[2],
        indent,
        bold:    false,
      });
      continue;
    }

    // ── Numbered list ─────────────────────────────────────
    const numberedMatch = raw.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      const indent = Math.floor((numberedMatch[1]?.length ?? 0) / 2);
      lines.push({
        type:    "bullet",
        content: numberedMatch[2],
        indent,
        bold:    false,
      });
      continue;
    }

    // ── Bold inline (entire line wrapped in ** **) ────────
    const isBold = /^\*\*.+\*\*$/.test(trimmed);

    // ── Keywords-only style — each non-empty line is a tag ─
    if (hintStyle === "keywords_only") {
      lines.push({
        type:    "keyword",
        content: trimmed.replace(/^\*+|\*+$/g, ""),
        indent:  0,
        bold:    false,
      });
      continue;
    }

    // ── Regular text (strip bold markers, keep content) ───
    lines.push({
      type:    "text",
      content: trimmed.replace(/\*\*(.+?)\*\*/g, "$1"),
      indent:  0,
      bold:    isBold,
    });
  }

  // Remove leading/trailing blank lines
  while (lines.length > 0 && lines[0].type === "blank") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].type === "blank") lines.pop();

  // Estimate display rows for dynamic height
  // Tweak charWidth for styles: keywords-only often uses short tags
  const charWidth = hintStyle === "keywords_only" ? 24 : 38; // approx chars per line at overlay width
  const estimatedRows = lines.reduce((sum, line) => {
    if (line.type === "blank") return sum + 0.5;
    if (line.type === "code")  return sum + 1.2;
    // Header/keyword/bullet/text – rough wrap estimate
    const len = line.content.length;
    return sum + Math.max(1, Math.ceil(len / charWidth));
  }, 0);

  return { lines, hasCode, estimatedRows };
}

// ─────────────────────────────────────────────────────────────────
// Highlight inline code spans (`code`)
// ─────────────────────────────────────────────────────────────────

export function splitInlineCode(text: string): Array<{
  text:   string;
  isCode: boolean;
}> {
  const parts: Array<{ text: string; isCode: boolean }> = [];
  const regex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isCode: false });
    }
    parts.push({ text: match[1], isCode: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isCode: false });
  }

  return parts.length > 0 ? parts : [{ text, isCode: false }];
}

// ─────────────────────────────────────────────────────────────────
// Highlight STAR components in text
// ─────────────────────────────────────────────────────────────────

export function highlightSTARComponents(text: string): string {
  return text
    .replace(/\b(Situation:?)\b/gi, "**$1**")
    .replace(/\b(Task:?)\b/gi, "**$1**")
    .replace(/\b(Action:?)\b/gi, "**$1**")
    .replace(/\b(Result:?)\b/gi, "**$1**");
}

// ─────────────────────────────────────────────────────────────────
// Truncate hint for compact display (stealth mode)
// ─────────────────────────────────────────────────────────────────

export function truncateForStealth(
  lines: ComposedLine[],
  maxLines = 4
): ComposedLine[] {
  const nonBlank = lines.filter((l) => l.type !== "blank");
  const visible = nonBlank.slice(0, maxLines);

  if (visible.length < nonBlank.length) {
    visible.push({
      type:    "text",
      content: `+${nonBlank.length - visible.length} more lines…`,
      indent:  0,
      bold:    false,
    });
  }

  return visible;
}

// ─────────────────────────────────────────────────────────────────
// Overlay size calculator
// ─────────────────────────────────────────────────────────────────

export interface OverlaySizeConfig {
  minWidth:   number;
  maxWidth:   number;
  minHeight:  number;
  maxHeight:  number;
  lineHeight: number;
  padding:    number;
}

export const DEFAULT_SIZE_CONFIG: OverlaySizeConfig = {
  minWidth:   280,
  maxWidth:   480,
  minHeight:  60,
  maxHeight:  520,
  lineHeight: 20,
  padding:    32,
};

export function calculateOverlaySize(
  estimatedRows: number,
  config: OverlaySizeConfig = DEFAULT_SIZE_CONFIG
): { width: number; height: number } {
  const height = Math.min(
    config.maxHeight,
    Math.max(
      config.minHeight,
      Math.ceil(estimatedRows * config.lineHeight) + config.padding
    )
  );
  return { width: config.maxWidth, height };
}

// ─────────────────────────────────────────────────────────────────
// Streaming text assembler
// Handles partial chunk display without layout thrash
// ─────────────────────────────────────────────────────────────────

export class StreamingTextAssembler {
  private buffer = "";
  private committed: ComposedLine[] = [];
  private hintStyle: HintStyle;

  constructor(hintStyle: HintStyle) {
    this.hintStyle = hintStyle;
  }

  appendChunk(chunk: string): ComposedHint {
    this.buffer += chunk;
    // Only compose what we have so far
    return composeHint(this.buffer, this.hintStyle);
  }

  commit(): ComposedHint {
    const result = composeHint(this.buffer, this.hintStyle);
    this.committed = result.lines;
    return result;
  }

  reset(): void {
    this.buffer = "";
    this.committed = [];
  }

  get currentBuffer(): string {
    return this.buffer;
  }
}
