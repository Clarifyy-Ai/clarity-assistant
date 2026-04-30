import type { Block } from "./blocks";

/**
 * Read-only renderer that mirrors what students will see.
 * Plain text is rendered with whitespace preserved; LaTeX is shown as styled
 * code (full KaTeX rendering can be wired in later without touching callers).
 */
export default function BlockRenderer({ blocks }: { blocks: Block[] }) {
  if (!blocks?.length) {
    return <p className="text-xs text-muted-foreground italic">Nothing to preview</p>;
  }
  return (
    <div className="space-y-3">
      {blocks.map((b) => {
        if (b.type === "text") {
          return (
            <p key={b.id} className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {b.content}
            </p>
          );
        }
        if (b.type === "image") {
          return (
            <div key={b.id} className="flex justify-center">
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <img
                src={b.url}
                alt={b.alt ?? ""}
                style={{ width: `${b.width ?? 60}%`, maxHeight: 320 }}
                className="object-contain rounded-lg border border-border"
              />
            </div>
          );
        }
        return (
          <pre
            key={b.id}
            className="px-3 py-2 rounded-lg bg-muted/40 border border-border text-sm font-mono text-foreground overflow-x-auto"
          >
            {b.tex}
          </pre>
        );
      })}
    </div>
  );
}
