import { useState } from "react";
import { Eye, Pencil, Trash2, Mail, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  buildCoverLetterPreviewSections,
  buildPortfolioPreviewSections,
  type DocumentPreviewSection,
} from "@/lib/documents/documentPreviewFormat";
import { documentsDB } from "@/lib/supabase/database";
import { clearSessionAiContext } from "@/lib/ai/sessionAiContext";
import { cn } from "@/lib/utils";

export type DocumentTextVariant = "cover_letter" | "portfolio";

type DocumentTextPanelProps = {
  variant: DocumentTextVariant;
  title: string;
  documentId: string;
  rawText: string | null;
  statusBadge?: { label: string; variant: "emerald" | "amber" | "gray" };
  footerNote?: string;
  onUpdated?: () => void;
  onDelete?: () => void;
  deleteLabel?: string;
  extraActions?: React.ReactNode;
};

const VARIANT_META: Record<
  DocumentTextVariant,
  {
    label: string;
    icon: typeof Mail;
    accent: string;
    iconBg: string;
    buildSections: (text: string) => DocumentPreviewSection[];
  }
> = {
  cover_letter: {
    label: "Cover letter",
    icon: Mail,
    accent: "border-violet-500/30 bg-violet-500/5",
    iconBg: "bg-violet-500/10 text-violet-500",
    buildSections: buildCoverLetterPreviewSections,
  },
  portfolio: {
    label: "Portfolio",
    icon: Briefcase,
    accent: "border-amber-500/30 bg-amber-500/5",
    iconBg: "bg-amber-500/10 text-amber-600",
    buildSections: buildPortfolioPreviewSections,
  },
};

function DocumentSectionPreview({
  sections,
  compact,
}: {
  sections: DocumentPreviewSection[];
  compact?: boolean;
}) {
  if (sections.length === 0) return null;
  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-secondary/40 p-3 space-y-3",
        compact && "space-y-2",
      )}
    >
      {sections.map((section) => (
        <div key={section.heading} className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {section.heading}
          </p>
          <p
            className={cn(
              "text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap",
              compact && "line-clamp-3",
            )}
          >
            {compact && section.body.length > 220
              ? `${section.body.slice(0, 220).trim()}…`
              : section.body}
          </p>
        </div>
      ))}
    </div>
  );
}

export function DocumentTextPanel({
  variant,
  title,
  documentId,
  rawText,
  statusBadge,
  footerNote,
  onUpdated,
  onDelete,
  deleteLabel = "Delete",
  extraActions,
}: DocumentTextPanelProps) {
  const meta = VARIANT_META[variant];
  const Icon = meta.icon;
  const text = (rawText ?? "").trim();
  const sections = text ? meta.buildSections(text) : [];

  const [viewOpen, setViewOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDraft, setEditDraft] = useState(text);
  const [saving, setSaving] = useState(false);

  function openEdit() {
    setEditDraft(text);
    setEditOpen(true);
  }

  async function handleSaveEdit() {
    const next = editDraft.trim();
    if (!next) {
      toast.error("Content cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      await documentsDB.update(documentId, {
        content: next,
        parsed_summary: next.slice(0, 500),
      });
      clearSessionAiContext();
      toast.success("Document saved.");
      setEditOpen(false);
      onUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Card padding="sm" className={cn("space-y-3", meta.accent)}>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
              meta.iconBg,
            )}
          >
            <Icon className="w-4 h-4" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground truncate">{title}</p>
              <Badge variant="gray" size="sm">
                {meta.label}
              </Badge>
              {statusBadge && (
                <Badge variant={statusBadge.variant} size="sm">
                  {statusBadge.label}
                </Badge>
              )}
            </div>
            {footerNote && (
              <p className="text-[10px] text-muted-foreground mt-1">{footerNote}</p>
            )}
          </div>
        </div>

        {sections.length > 0 ? (
          <DocumentSectionPreview sections={sections} compact />
        ) : (
          <p className="text-xs text-muted-foreground">
            No extracted text yet. Upload a file or edit manually.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Eye className="w-3.5 h-3.5" />}
            disabled={!text}
            onClick={() => setViewOpen(true)}
          >
            View full
          </Button>
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<Pencil className="w-3.5 h-3.5" />}
            onClick={openEdit}
          >
            Edit
          </Button>
          {extraActions}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={onDelete}
            >
              {deleteLabel}
            </Button>
          )}
        </div>
      </Card>

      <Modal open={viewOpen} onClose={() => setViewOpen(false)} title={title} size="xl">
        <div className="max-h-[28rem] overflow-y-auto space-y-3">
          {text ? (
            <DocumentSectionPreview sections={sections} />
          ) : (
            <p className="text-sm text-muted-foreground">No content to display.</p>
          )}
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setViewOpen(false)}>
            Close
          </Button>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<Pencil className="w-3.5 h-3.5" />}
            onClick={() => {
              setViewOpen(false);
              openEdit();
            }}
          >
            Edit
          </Button>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit ${meta.label.toLowerCase()}`} size="xl">
        <p className="text-xs text-muted-foreground mb-3">
          Changes are saved to your account and used in AI interview context.
        </p>
        <textarea
          value={editDraft}
          onChange={(e) => setEditDraft(e.target.value)}
          rows={16}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
          placeholder={`Paste or edit your ${meta.label.toLowerCase()} text here…`}
        />
        <div className="mt-4 flex gap-3">
          <Button variant="secondary" size="sm" fullWidth onClick={() => setEditOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            loading={saving}
            onClick={() => void handleSaveEdit()}
          >
            Save
          </Button>
        </div>
      </Modal>
    </>
  );
}

/** Compact preview for lists — variant-specific section layout. */
export function DocumentTextPreview({
  variant,
  rawText,
  compact = true,
}: {
  variant: DocumentTextVariant;
  rawText: string | null;
  compact?: boolean;
}) {
  const text = (rawText ?? "").trim();
  if (!text) return null;
  const sections = VARIANT_META[variant].buildSections(text);
  return <DocumentSectionPreview sections={sections} compact={compact} />;
}
