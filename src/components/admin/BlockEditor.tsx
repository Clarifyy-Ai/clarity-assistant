import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";
import {
  Type, Image as ImageIcon, Sigma,
  ArrowUp, ArrowDown, Trash2, Loader2, Upload,
} from "lucide-react";
import {
  type Block, makeImageBlock, makeLatexBlock, makeTextBlock,
} from "./blocks";

interface Props {
  value: Block[];
  onChange: (next: Block[]) => void;
  /** Sub-folder inside the `question-images` bucket, e.g. `question/<id>` or `option/A`. */
  uploadFolder: string;
  compact?: boolean;
}

const BUCKET = "question-images";

export default function BlockEditor({ value, onChange, uploadFolder, compact }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingIdx, setPendingIdx] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const addBlock = (b: Block) => onChange([...value, b]);
  const replaceBlock = (i: number, b: Block) =>
    onChange(value.map((x, idx) => (idx === i ? b : x)));
  const removeBlock = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  function insertImageHere(idx: number) {
    setPendingIdx(idx);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${uploadFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const block = makeImageBlock(data.publicUrl, file.name);

      // Insert AT the requested index (between blocks), not at the end.
      const insertAt = pendingIdx ?? value.length;
      const next = value.slice();
      next.splice(insertAt, 0, block);
      onChange(next);
      toast.success("Image inserted");
    } catch (err) {
      console.error(err);
      toast.error((err as Error).message ?? "Upload failed");
    } finally {
      setUploading(false);
      setPendingIdx(null);
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {value.length === 0 && (
        <div className="text-xs text-muted-foreground italic px-2 py-3 border border-dashed border-border rounded-lg">
          Empty — add a text, image, or formula block below.
        </div>
      )}

      {value.map((block, i) => (
        <div key={block.id} className="group relative">
          {/* Inline "insert image here" affordance ABOVE every block */}
          <InsertHereButton
            label="Insert image here"
            onClick={() => insertImageHere(i)}
            disabled={uploading}
          />

          <div className="rounded-xl border border-border bg-card p-2 flex gap-2">
            <div className="flex flex-col gap-1 shrink-0">
              <button
                type="button"
                onClick={() => moveBlock(i, -1)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-30"
                disabled={i === 0}
                aria-label="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveBlock(i, 1)}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent/10 disabled:opacity-30"
                disabled={i === value.length - 1}
                aria-label="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => removeBlock(i)}
                className="p-1 rounded text-destructive hover:bg-destructive/10"
                aria-label="Delete block"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              {block.type === "text" && (
                <textarea
                  value={block.content}
                  onChange={(e) =>
                    replaceBlock(i, { ...block, content: e.target.value })
                  }
                  rows={compact ? 2 : 3}
                  placeholder="Type the text for this block…"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}

              {block.type === "image" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-center bg-muted/30 rounded-lg p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={block.url}
                      alt={block.alt}
                      style={{ width: `${block.width ?? 60}%`, maxHeight: 240 }}
                      className="object-contain rounded"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={block.alt ?? ""}
                      onChange={(e) =>
                        replaceBlock(i, { ...block, alt: e.target.value })
                      }
                      placeholder="Alt text"
                    />
                    <Input
                      type="number"
                      min={20}
                      max={100}
                      value={block.width ?? 60}
                      onChange={(e) =>
                        replaceBlock(i, {
                          ...block,
                          width: Math.max(20, Math.min(100, Number(e.target.value) || 60)),
                        })
                      }
                      placeholder="Width %"
                    />
                  </div>
                </div>
              )}

              {block.type === "latex" && (
                <textarea
                  value={block.tex}
                  onChange={(e) =>
                    replaceBlock(i, { ...block, tex: e.target.value })
                  }
                  rows={2}
                  placeholder="LaTeX, e.g. \\frac{a}{b} = c"
                  className="w-full bg-background border border-border rounded-lg p-2 text-sm font-mono text-foreground"
                />
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Final "insert here" for end-of-list */}
      {value.length > 0 && (
        <InsertHereButton
          label="Insert image at end"
          onClick={() => insertImageHere(value.length)}
          disabled={uploading}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          type="button"
          size="xs"
          variant="secondary"
          leftIcon={<Type className="w-3.5 h-3.5" />}
          onClick={() => addBlock(makeTextBlock(""))}
        >
          Add text
        </Button>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          leftIcon={uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
          onClick={() => insertImageHere(value.length)}
          disabled={uploading}
        >
          {uploading ? "Uploading…" : "Add image"}
        </Button>
        <Button
          type="button"
          size="xs"
          variant="secondary"
          leftIcon={<Sigma className="w-3.5 h-3.5" />}
          onClick={() => addBlock(makeLatexBlock(""))}
        >
          Add formula
        </Button>
      </div>
    </div>
  );
}

function InsertHereButton({
  label, onClick, disabled,
}: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-center gap-1.5 py-1 text-[10px] uppercase tracking-widest text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
    >
      <Upload className="w-3 h-3" /> {label}
    </button>
  );
}
