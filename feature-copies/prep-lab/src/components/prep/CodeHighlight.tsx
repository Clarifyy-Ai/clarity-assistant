import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SupportedLang = "javascript" | "typescript" | "python" | "java" | "cpp" | "go" | "rust" | "sql";

const KEYWORDS: Record<SupportedLang, string[]> = {
  javascript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "new", "async", "await", "import", "from", "export", "default", "true", "false", "null", "undefined"],
  typescript: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "new", "async", "await", "import", "from", "export", "default", "interface", "type", "true", "false", "null", "undefined"],
  python: ["def", "return", "if", "elif", "else", "for", "while", "class", "import", "from", "as", "True", "False", "None", "in", "and", "or", "not", "with", "lambda"],
  java: ["public", "private", "class", "void", "int", "return", "if", "else", "for", "while", "new", "static", "final", "true", "false", "null"],
  cpp: ["int", "void", "return", "if", "else", "for", "while", "class", "public", "private", "true", "false", "nullptr", "const", "auto"],
  go: ["func", "return", "if", "else", "for", "var", "const", "package", "import", "type", "struct", "true", "false", "nil"],
  rust: ["fn", "let", "mut", "return", "if", "else", "for", "while", "struct", "impl", "pub", "use", "true", "false", "None", "Some"],
  sql: ["SELECT", "FROM", "WHERE", "INSERT", "INTO", "UPDATE", "DELETE", "JOIN", "ON", "GROUP", "BY", "ORDER", "LIMIT", "CREATE", "TABLE", "AND", "OR", "NULL"],
};

function normalizeLang(lang: string): SupportedLang {
  const l = lang.toLowerCase();
  if (l === "js") return "javascript";
  if (l === "ts") return "typescript";
  if (l === "py") return "python";
  if (l in KEYWORDS) return l as SupportedLang;
  return "javascript";
}

function highlightLine(line: string, lang: SupportedLang): ReactNode[] {
  const keywordSet = new Set(KEYWORDS[lang]);
  const parts: ReactNode[] = [];
  const tokenRegex =
    /(\/\/.*$|#.*$|--.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_]\w*\b|\s+|[^\s\w]+)/g;

  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = tokenRegex.exec(line)) !== null) {
    const token = match[0];
    const key = `t-${i++}`;

    if (/^(\/\/|#|--)/.test(token)) {
      parts.push(<span key={key} className="text-muted-foreground/70">{token}</span>);
    } else if (/^["'`]/.test(token)) {
      parts.push(<span key={key} className="text-emerald-400">{token}</span>);
    } else if (/^\d/.test(token)) {
      parts.push(<span key={key} className="text-amber-300">{token}</span>);
    } else if (keywordSet.has(token) || keywordSet.has(token.toUpperCase())) {
      parts.push(<span key={key} className="text-primary font-medium">{token}</span>);
    } else if (/^[A-Z]\w*$/.test(token)) {
      parts.push(<span key={key} className="text-sky-300">{token}</span>);
    } else {
      parts.push(<span key={key}>{token}</span>);
    }
  }

  return parts;
}

interface CodeHighlightProps {
  code: string;
  language?: string;
  className?: string;
}

export function CodeHighlight({ code, language = "javascript", className }: CodeHighlightProps) {
  const lang = normalizeLang(language);
  const lines = useMemo(() => code.replace(/\r\n/g, "\n").split("\n"), [code]);

  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-xl bg-muted/50 border border-border p-4 font-mono text-xs leading-6 text-foreground",
        className
      )}
    >
      {lines.map((line, idx) => (
        <div key={idx} className="table-row">
          <span className="table-cell select-none pr-4 text-right text-muted-foreground/50 w-8">
            {idx + 1}
          </span>
          <code className="table-cell whitespace-pre">{highlightLine(line, lang)}</code>
        </div>
      ))}
    </pre>
  );
}

/** Split markdown-style text into prose + fenced code blocks. */
export function renderTextWithCodeBlocks(text: string): ReactNode[] {
  const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let blockIdx = 0;

  while ((match = fenceRegex.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    if (before.trim()) {
      nodes.push(
        <p key={`p-${blockIdx}`} className="text-sm text-foreground leading-relaxed whitespace-pre-wrap mb-3">
          {before.trim()}
        </p>
      );
    }
    nodes.push(
      <CodeHighlight key={`c-${blockIdx}`} language={match[1] || "javascript"} code={match[2].trim()} />
    );
    lastIndex = match.index + match[0].length;
    blockIdx++;
  }

  const tail = text.slice(lastIndex);
  if (tail.trim()) {
    nodes.push(
      <p key="tail" className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
        {tail.trim()}
      </p>
    );
  }

  return nodes.length > 0 ? nodes : [
    <p key="plain" className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{text}</p>,
  ];
}
