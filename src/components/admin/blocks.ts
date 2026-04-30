// Shared block-editor types & helpers used by AdminQuestionEditor.
// Blocks let admins put images *anywhere* inside a question (or option,
// or explanation) — not just at the end.

export type BlockType = "text" | "image" | "latex";

export interface TextBlock {
  id: string;
  type: "text";
  content: string;
}
export interface ImageBlock {
  id: string;
  type: "image";
  url: string;
  alt?: string;
  width?: number; // % of container, 25-100
}
export interface LatexBlock {
  id: string;
  type: "latex";
  tex: string;
}
export type Block = TextBlock | ImageBlock | LatexBlock;

export const newId = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)) as string;

export function makeTextBlock(content = ""): TextBlock {
  return { id: newId(), type: "text", content };
}
export function makeImageBlock(url: string, alt = ""): ImageBlock {
  return { id: newId(), type: "image", url, alt, width: 60 };
}
export function makeLatexBlock(tex = ""): LatexBlock {
  return { id: newId(), type: "latex", tex };
}

/** Flatten blocks to plain text for the legacy `question_text` column. */
export function blocksToPlainText(blocks: Block[] | null | undefined): string {
  if (!blocks?.length) return "";
  return blocks
    .map((b) => {
      if (b.type === "text") return b.content;
      if (b.type === "latex") return `[formula: ${b.tex}]`;
      return `[image]`;
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

/** Best-effort: if a question has no blocks, build a single text block from its plain text. */
export function ensureBlocks(
  blocks: unknown,
  fallbackText?: string | null,
): Block[] {
  if (Array.isArray(blocks) && blocks.length) return blocks as Block[];
  if (fallbackText && fallbackText.trim()) return [makeTextBlock(fallbackText)];
  return [makeTextBlock("")];
}
