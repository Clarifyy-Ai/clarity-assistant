import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import {
  APPROVED_CODING_LANGUAGES,
  evaluationModeLabel,
  languageLabel,
  languageOptionLabel,
} from "@/lib/coding/languages";
import { PAGE_SHELL, STACK_GRID } from "@/lib/ui/responsivePage";
import { EmptyState } from "@/components/common/EmptyState";
import { Code2 } from "lucide-react";

type CodingQuestion = {
  id: string;
  title: string;
  difficulty: string;
  language: string;
  evaluation_mode: string;
};

export default function CodingLabPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [questions, setQuestions] = useState<CodingQuestion[]>([]);
  const [title, setTitle] = useState("Two number sum");
  const [description, setDescription] = useState("Return the sum of a two-element array via solve(input).");
  const [starter, setStarter] = useState("function solve(input) {\n  return 0;\n}\n");
  const [language, setLanguage] = useState("javascript");
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("coding_questions")
      .select("id,title,difficulty,language,evaluation_mode")
      .eq("publish_status", "published")
      .order("title");
    if (error) toast.error(error.message);
    setQuestions((data as CodingQuestion[]) ?? []);
    setLoaded(true);
  }

  async function createQuestion() {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from("coding_questions")
      .insert({
        title,
        description,
        difficulty: "EASY",
        language,
        starter_code: starter,
        sample_input: "[2, 3]",
        sample_output: "5",
        evaluation_mode: language === "javascript" ? "javascript_solve" : "stored_review",
        created_by: user.id,
        content_owner: user.id,
        source: "ORIGINAL",
        license_type: "ORIGINAL",
        copyright_status: "ORIGINAL",
        publish_status: "published",
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      toast.error(error?.message ?? "Could not create question.");
      return;
    }
    await supabase.from("coding_test_cases").insert([
      { question_id: data.id, name: "sample", input_json: [2, 3], expected_json: 5, is_hidden: false, sort_order: 0 },
      { question_id: data.id, name: "hidden", input_json: [9, 1], expected_json: 10, is_hidden: true, sort_order: 1 },
    ]);
    toast.success("Coding question created. Hidden cases stay server-side.");
    void load();
  }

  useEffect(() => {
    void load();
  }, []);

  const isPreview = loaded && questions.length === 0;

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Coding Assessment"
        breadcrumbs={[{ label: "Dashboard", href: "/app/dashboard" }, { label: "Coding Assessment" }]}
        badge="Preview"
        description={
          isPreview
            ? "Preview — JavaScript is auto-scored on the server. TypeScript, Python, and Java are stored for review and are not executed. There is no multi-language sandbox. Hidden tests are never shown."
            : "JavaScript solve() is auto-scored on the server. Other languages are not executed — submissions are stored for pending review. There is no multi-language sandbox. Hidden tests stay server-side."
        }
      />
      {isPreview && !isAdmin ? (
        <EmptyState
          icon={Code2}
          title="No published problems yet"
          description="Content is unpublished. Published assessments will appear here."
        />
      ) : (
      <>
      {isAdmin && (
      <Card className="mb-4 space-y-3">
        <h2 className="text-sm font-semibold">Create coding question</h2>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Problem statement" />
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="admin-coding-lang">Language</label>
          <select
            id="admin-coding-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            {APPROVED_CODING_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {languageOptionLabel(lang)}
              </option>
            ))}
          </select>
        </div>
        <Textarea className="font-mono text-xs" value={starter} onChange={(e) => setStarter(e.target.value)} />
        <Button onClick={() => void createQuestion()}>Create question</Button>
        <p className="text-xs text-muted-foreground">Admin authoring enabled. Only JavaScript is executed for scoring; other languages are not executed.</p>
      </Card>
      )}
      {isPreview ? (
        <EmptyState
          icon={Code2}
          title="No published problems yet"
          description="Content is unpublished. Use the form above to create the first problem."
        />
      ) : (
      <div className={STACK_GRID}>
        {questions.map((q) => (
          <Link key={q.id} to={`/app/coding/${q.id}`}>
            <Card hover className="min-w-0">
              <h2 className="font-semibold">{q.title}</h2>
              <p className="text-sm text-muted-foreground">
                {q.difficulty} · {languageLabel(q.language)} · {evaluationModeLabel(q.evaluation_mode)}
              </p>
            </Card>
          </Link>
        ))}
      </div>
      )}
      </>
      )}
    </div>
  );
}
