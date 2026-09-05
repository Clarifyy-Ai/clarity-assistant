import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CodeHighlight } from "@/components/prep/CodeHighlight";

type Block =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "code"; language: string; code: string }
  | { kind: "paragraph"; text: string };

/** Inline **bold** without leaving raw asterisks visible. */
function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(<Fragment key={`t-${i++}`}>{text.slice(last, match.index)}</Fragment>);
    }
    nodes.push(
      <strong key={`b-${i++}`} className="font-semibold text-foreground">
        {match[1]}
      </strong>,
    );
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(<Fragment key={`t-${i++}`}>{text.slice(last)}</Fragment>);
  }

  return nodes.length > 0 ? nodes : [text];
}

function parseAiFormattedBlocks(text: string): Block[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const blocks: Block[] = [];
  const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let fenceMatch: RegExpExecArray | null;

  const pushProse = (chunk: string) => {
    const lines = chunk.split("\n");
    let listItems: string[] = [];

    const flushList = () => {
      if (listItems.length > 0) {
        blocks.push({ kind: "list", items: [...listItems] });
        listItems = [];
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        continue;
      }

      const heading = trimmed.match(/^(#{2,3})\s+(.+)$/);
      if (heading) {
        flushList();
        blocks.push({
          kind: "heading",
          level: heading[1].length as 2 | 3,
          text: heading[2].trim(),
        });
        continue;
      }

      const bullet = trimmed.match(/^[-*•]\s+(.+)$/);
      if (bullet) {
        listItems.push(bullet[1].trim());
        continue;
      }

      flushList();
      blocks.push({ kind: "paragraph", text: trimmed });
    }

    flushList();
  };

  while ((fenceMatch = fenceRegex.exec(normalized)) !== null) {
    const before = normalized.slice(cursor, fenceMatch.index);
    if (before.trim()) pushProse(before);
    blocks.push({
      kind: "code",
      language: fenceMatch[1] || "javascript",
      code: fenceMatch[2].trim(),
    });
    cursor = fenceMatch.index + fenceMatch[0].length;
  }

  const tail = normalized.slice(cursor);
  if (tail.trim()) pushProse(tail);

  return blocks.length > 0 ? blocks : [{ kind: "paragraph", text: normalized }];
}

export function AiFormattedOutput({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const blocks = useMemo(() => parseAiFormattedBlocks(text), [text]);

  return (
    <div className={cn("space-y-3", className)}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            if (block.level === 2) {
              return (
                <h3
                  key={index}
                  className="text-sm font-semibold text-foreground tracking-tight"
                >
                  {renderInlineMarkdown(block.text)}
                </h3>
              );
            }
            return (
              <h4
                key={index}
                className="text-sm font-medium text-foreground/90 tracking-tight"
              >
                {renderInlineMarkdown(block.text)}
              </h4>
            );
          case "list":
            return (
              <ul key={index} className="list-disc pl-5 space-y-1 text-sm text-foreground">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex} className="leading-relaxed">
                    {renderInlineMarkdown(item)}
                  </li>
                ))}
              </ul>
            );
          case "code":
            return (
              <CodeHighlight
                key={index}
                language={block.language}
                code={block.code}
              />
            );
          case "paragraph":
          default:
            return (
              <p
                key={index}
                className="text-sm text-foreground leading-relaxed whitespace-pre-wrap"
              >
                {renderInlineMarkdown(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
