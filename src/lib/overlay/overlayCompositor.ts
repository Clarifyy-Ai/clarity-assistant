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
  /** Optional rich segments (no HTML). Prefer over raw content for rendering. */
  parts?:  InlinePart[];
}

export interface InlinePart {
  text: string;
  isCode?: boolean;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Strip Markdown emphasis markers while preserving inner text.
 * Handles **bold**, __bold__, *italic*, _italic_. Protects `inline code`.
 */
export function stripMarkdownEmphasis(text: string): string {
  if (!text) return "";

  const codes: string[] = [];
  let out = text.replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });

  out = out
    .replace(/\*\*([^*]+?)\*\*/g, "$1")
    .replace(/__([^_]+?)__/g, "$1")
    .replace(/(^|[\s([{])\*([^*\n]+?)\*(?=[\s)\]}.,!?:;]|$)/g, "$1$2")
    .replace(/(^|[\s([{])_([^_\n]+?)_(?=[\s)\]}.,!?:;]|$)/g, "$1$2");

  // Drop any leftover emphasis delimiters (malformed ** / _)
  out = out.replace(/\*\*/g, "").replace(/__/g, "");

  return out.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => {
    const code = codes[Number(idx)] ?? "";
    return `\`${code}\``;
  });
}

function normalizeLineContent(content: string): {
  content: string;
  whollyBold: boolean;
  parts: InlinePart[];
} {
  const trimmed = content.trim();
  const whollyBold =
    /^\*\*.+\*\*$/.test(trimmed) ||
    /^__.+__$/.test(trimmed);
  const parts = splitInlineRich(content).map((part) =>
    part.isCode
      ? part
      : {
          ...part,
          text: stripMarkdownEmphasis(part.text),
        },
  );
  return {
    content: parts
      .map((p) => (p.isCode ? `\`${p.text}\`` : p.text))
      .join(""),
    whollyBold,
    parts,
  };
}

// ─────────────────────────────────────────────────────────────────
// Parse raw hint text into structured lines
// ─────────────────────────────────────────────────────────────────

export function composeHint(
  rawText: string,
  hintStyle: HintStyle,
): ComposedHint {
  if (!rawText.trim()) {
    return { lines: [], hasCode: false, estimatedRows: 0 };
  }

  const rawLines = rawText.replace(/\r\n/g, "\n").split("\n");

  const lines: ComposedLine[] = [];
  let inCodeBlock = false;
  let hasCode     = false;

  for (const raw of rawLines) {
    const trimmed = raw.trim();

    // ── Code block fences ─────────────────────────────────────
    if (trimmed.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      hasCode = true;
      const lang = trimmed.slice(3).trim();
      if (inCodeBlock && lang && !lang.includes("`")) {
        lines.push({ type: "header", content: lang.toUpperCase(), indent: 0, bold: true });
      }
      continue;
    }

    if (inCodeBlock) {
      lines.push({ type: "code", content: raw, indent: 0, bold: false });
      continue;
    }

    // ── Blank line ────────────────────────────────────────────
    if (!trimmed) {
      lines.push({ type: "blank", content: "", indent: 0, bold: false });
      continue;
    }

    // ── Markdown headers ──────────────────────────────────────
    const headerMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const normalized = normalizeLineContent(headerMatch[2] ?? "");
      lines.push({
        type:    "header",
        content: normalized.content,
        indent:  0,
        bold:    true,
        parts:   normalized.parts,
      });
      continue;
    }

    // ── Bullet points ─────────────────────────────────────────
    const bulletMatch = raw.match(/^(\s*)[•\-*]\s+(.+)$/);
    if (bulletMatch) {
      const indentStr = bulletMatch[1] ?? "";
      const normalized = normalizeLineContent(bulletMatch[2] ?? "");
      lines.push({
        type:    "bullet",
        content: normalized.content,
        indent:  Math.floor(indentStr.length / 2),
        bold:    normalized.whollyBold,
        parts:   normalized.parts,
      });
      continue;
    }

    // ── Numbered list ─────────────────────────────────────────
    const numberedMatch = raw.match(/^(\s*)\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      const indentStr = numberedMatch[1] ?? "";
      const normalized = normalizeLineContent(numberedMatch[2] ?? "");
      lines.push({
        type:    "bullet",
        content: normalized.content,
        indent:  Math.floor(indentStr.length / 2),
        bold:    normalized.whollyBold,
        parts:   normalized.parts,
      });
      continue;
    }

    // ── Keywords-only style ───────────────────────────────────
    if (hintStyle === "keywords_only") {
      const normalized = normalizeLineContent(trimmed.replace(/^\*+|\*+$/g, ""));
      lines.push({
        type:    "keyword",
        content: normalized.content,
        indent:  0,
        bold:    false,
        parts:   normalized.parts,
      });
      continue;
    }

    // ── Regular text ──────────────────────────────────────────
    const normalized = normalizeLineContent(trimmed);
    lines.push({
      type:    "text",
      content: normalized.content,
      indent:  0,
      bold:    normalized.whollyBold,
      parts:   normalized.parts,
    });
  }

  // Remove leading/trailing blank lines
  while (lines.length > 0 && lines[0].type === "blank")              lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].type === "blank") lines.pop();

  // Estimate display rows for dynamic height calculation
  const charWidth     = hintStyle === "keywords_only" ? 24 : 38;
  const estimatedRows = lines.reduce((sum, line) => {
    if (line.type === "blank") return sum + 0.5;
    if (line.type === "code")  return sum + 1.2;
    return sum + Math.max(1, Math.ceil(line.content.length / charWidth));
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
  const regex   = /`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isCode: false });
    }
    parts.push({ text: match[1] ?? "", isCode: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isCode: false });
  }

  return parts.length > 0 ? parts : [{ text, isCode: false }];
}

/**
 * Split text into code / bold / italic / plain segments for React text children.
 * Does not emit HTML — callers render spans with font-semibold / italic.
 */
export function splitInlineRich(text: string): InlinePart[] {
  if (!text) return [{ text: "" }];

  const codeParts = splitInlineCode(text);
  const out: InlinePart[] = [];

  for (const part of codeParts) {
    if (part.isCode) {
      out.push({ text: part.text, isCode: true });
      continue;
    }
    out.push(...splitEmphasisSegments(part.text));
  }

  return out.length > 0 ? out : [{ text }];
}

function splitEmphasisSegments(text: string): InlinePart[] {
  if (!text) return [];
  const parts: InlinePart[] = [];
  const re = /\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\n]+?)\*|_([^_\n]+?)_/g;
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ text: text.slice(last, match.index) });
    }
    if (match[1] != null) {
      parts.push({ text: match[1], bold: true });
    } else if (match[2] != null) {
      parts.push({ text: match[2], bold: true });
    } else if (match[3] != null) {
      parts.push({ text: match[3], italic: true });
    } else if (match[4] != null) {
      parts.push({ text: match[4], italic: true });
    }
    last = re.lastIndex;
  }

  if (last < text.length) {
    parts.push({ text: text.slice(last) });
  }

  return parts.length > 0 ? parts : [{ text }];
}

// ─────────────────────────────────────────────────────────────────
// Highlight STAR components in text
// ─────────────────────────────────────────────────────────────────

export function highlightSTARComponents(text: string): string {
  return text
    .replace(/\b(Situation:?)\b/gi, "**$1**")
    .replace(/\b(Task:?)\b/gi,      "**$1**")
    .replace(/\b(Action:?)\b/gi,    "**$1**")
    .replace(/\b(Result:?)\b/gi,    "**$1**");
}

// ─────────────────────────────────────────────────────────────────
// Truncate hint for compact/stealth display
// ─────────────────────────────────────────────────────────────────

export function truncateForStealth(
  lines: ComposedLine[],
  maxLines = 4,
): ComposedLine[] {
  const nonBlank = lines.filter((l) => l.type !== "blank");
  const visible  = nonBlank.slice(0, maxLines);

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
  config: OverlaySizeConfig = DEFAULT_SIZE_CONFIG,
): { width: number; height: number } {
  const height = Math.min(
    config.maxHeight,
    Math.max(
      config.minHeight,
      Math.ceil(estimatedRows * config.lineHeight) + config.padding,
    ),
  );
  return { width: config.maxWidth, height };
}

// ─────────────────────────────────────────────────────────────────
// Streaming text assembler
// Handles partial chunk display without layout thrash.
// ─────────────────────────────────────────────────────────────────

export class StreamingTextAssembler {
  private buffer:    string;
  private hintStyle: HintStyle;
  /** Last result returned by commit() — null until first commit */
  private lastCommitted: ComposedHint | null;

  constructor(hintStyle: HintStyle) {
    this.hintStyle     = hintStyle;
    this.buffer        = "";
    this.lastCommitted = null;
  }

  /** Append a streaming chunk and return the current (partial) composed result. */
  appendChunk(chunk: string): ComposedHint {
    this.buffer += chunk;
    return composeHint(this.buffer, this.hintStyle);
  }

  /**
   * Finalise the current buffer.
   * Returns the composed result and stores it in `lastCommitted`.
   */
  commit(): ComposedHint {
    const result       = composeHint(this.buffer, this.hintStyle);
    this.lastCommitted = result;
    return result;
  }

  /** Returns the last committed result, or null if commit() hasn't been called. */
  getCommitted(): ComposedHint | null {
    return this.lastCommitted;
  }

  /** Reset the assembler for a new stream. */
  reset(): void {
    this.buffer        = "";
    this.lastCommitted = null;
  }

  get currentBuffer(): string {
    return this.buffer;
  }
}
