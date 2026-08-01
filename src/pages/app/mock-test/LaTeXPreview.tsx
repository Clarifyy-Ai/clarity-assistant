// src/pages/app/mock-test/LaTeXPreview.tsx
// Split out from UploadQuestions.tsx so the heavy `react-katex` + `katex` CSS
// bundle is only fetched when a user actually toggles the LaTeX preview,
// instead of blocking first paint of the Import Questions page.
import { InlineMath, BlockMath } from "react-katex";
import "katex/dist/katex.min.css";

export default function LaTeXPreview({ text }: { text: string }) {
  if (!text?.trim()) {
    return <p className="text-sm italic text-muted-foreground">Preview will appear here…</p>;
  }

  const blockRegex = /\$\$([\s\S]+?)\$\$/g;
  const inlineRegex = /\$((?:[^$\\]|\\.)+?)\$/g;

  let match: RegExpExecArray | null;
  const segments: Array<{
    start: number;
    end: number;
    type: "block" | "inline";
    math: string;
  }> = [];

  blockRegex.lastIndex = 0;
  while ((match = blockRegex.exec(text)) !== null) {
    segments.push({
      start: match.index,
      end: match.index + match[0].length,
      type: "block",
      math: match[1],
    });
  }

  inlineRegex.lastIndex = 0;
  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const overlaps = segments.some((s) => start < s.end && end > s.start);
    if (!overlaps) {
      segments.push({
        start,
        end,
        type: "inline",
        math: match[1],
      });
    }
  }

  segments.sort((a, b) => a.start - b.start);

  let cursor = 0;
  const tokens: Array<{ type: "text" | "inline" | "block"; content: string }> = [];

  for (const seg of segments) {
    if (seg.start > cursor) {
      tokens.push({ type: "text", content: text.slice(cursor, seg.start) });
    }
    tokens.push({ type: seg.type, content: seg.math });
    cursor = seg.end;
  }

  if (cursor < text.length) {
    tokens.push({ type: "text", content: text.slice(cursor) });
  }

  return (
    <div className="leading-relaxed text-sm text-foreground">
      {tokens.map((token, i) => {
        if (token.type === "block") {
          return (
            <div key={i} className="my-2 overflow-x-auto text-center">
              <BlockMath math={token.content} errorColor="#e74c3c" />
            </div>
          );
        }

        if (token.type === "inline") {
          return <InlineMath key={i} math={token.content} errorColor="#e74c3c" />;
        }

        return (
          <span key={i}>
            {token.content.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </div>
  );
}
