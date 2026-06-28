/** Extract copy-paste ready code from markdown fences in an AI answer. */
export function extractCodeFromAnswer(text: string): string {
  const blocks: string[] = [];
  const fenceRegex = /```[\w+-]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(text)) !== null) {
    const block = (match[1] ?? "").trim();
    if (block) blocks.push(block);
  }
  return blocks.join("\n\n");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}
