import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { supabase, STORAGE_BUCKETS } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { isAllowedLibraryMime } from "@/lib/library/documentRights";
import { LICENSE_TYPES, type LicenseType } from "@/lib/content/license";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Doc = {
  id: string;
  document_name: string;
  mime_type: string | null;
  storage_path: string | null;
  source: string | null;
  content_rights: string;
  rights_confirmed: boolean;
  created_at: string;
};

export default function DocumentLibraryPage() {
  const user = useAuthStore((s) => s.user);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [rights, setRights] = useState<LicenseType>("USER_OWNED");
  const [confirmed, setConfirmed] = useState(false);
  const [source, setSource] = useState("personal");

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("personal_library_documents")
      .select("*")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setDocs((data as Doc[]) ?? []);
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(file: File) {
    if (!user?.id) return;
    if (!confirmed) {
      toast.error("Confirm you have permission to use this file.");
      return;
    }
    if (!isAllowedLibraryMime(file.type) && !/\.(pdf|docx|txt|csv)$/i.test(file.name)) {
      toast.error("Allowed: PDF, DOCX, TXT, CSV.");
      return;
    }
    const path = `${user.id}/library/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).upload(path, file);
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    const { error } = await supabase.from("personal_library_documents").insert({
      owner_id: user.id,
      uploaded_by: user.id,
      document_name: file.name,
      mime_type: file.type,
      storage_path: path,
      source,
      content_rights: rights,
      rights_confirmed: confirmed,
    });
    if (error) toast.error(error.message);
    else void load();
  }

  async function download(doc: Doc) {
    if (!doc.storage_path) return;
    const { data, error } = await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) toast.error(error?.message ?? "Download failed.");
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(doc: Doc) {
    if (doc.storage_path) await supabase.storage.from(STORAGE_BUCKETS.DOCUMENTS).remove([doc.storage_path]);
    const { error } = await supabase.from("personal_library_documents").delete().eq("id", doc.id);
    if (error) toast.error(error.message);
    else void load();
  }

  async function createPracticeSet(doc: Doc) {
    if (!user?.id) return;
    if (!doc.rights_confirmed) {
      toast.error("Confirm content rights before creating a practice set.");
      return;
    }
    const { error } = await supabase.from("document_practice_sets").insert({
      document_id: doc.id,
      owner_id: user.id,
      title: `Practice from ${doc.document_name}`,
      question_ids: [],
    });
    if (error) toast.error(error.message);
    else toast.success("Practice set created. Add original questions in Question Bank, then attach them here.");
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Personal Document Library"
        description="Upload documents you own or have permission to use. Clarify does not scrape copyrighted exam papers."
      />
      <Card className="mb-4 space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I confirm I own this material or have permission to use it for personal practice.
        </label>
        <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source" />
        <Select value={rights} onValueChange={(v) => setRights(v as LicenseType)}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LICENSE_TYPES.filter((l) => l !== "UNKNOWN").map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="file"
          accept=".pdf,.docx,.txt,.csv,application/pdf,text/plain,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </Card>
      <ul className="space-y-2">
        {docs.map((doc) => (
          <li key={doc.id}>
            <Card className="min-w-0">
              <p className="font-medium break-words">{doc.document_name}</p>
              <p className="text-xs text-muted-foreground">
                {doc.content_rights} · {doc.source} · {new Date(doc.created_at).toLocaleString()}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void download(doc)}>Download</Button>
                <Button size="sm" variant="outline" onClick={() => void createPracticeSet(doc)}>Create practice set</Button>
                <Button size="sm" variant="danger" onClick={() => void remove(doc)}>Delete</Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
