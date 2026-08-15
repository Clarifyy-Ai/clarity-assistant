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
        language: "javascript",
        starter_code: starter,
        sample_input: "[2, 3]",
        sample_output: "5",
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
        description={
          isPreview
            ? "Preview — controlled JavaScript assessments with server-side scoring. Hidden tests are never shown."
            : "Controlled JavaScript assessments with server-side scoring. Hidden tests are never shown. This is not unrestricted cloud execution."
        }
      />
      {isPreview && !isAdmin ? (
        <EmptyState
          icon={Code2}
          title="Coding lab is in preview"
          description="Published assessments will appear here. This is not unrestricted cloud execution."
        />
      ) : (
      <>
      {(isAdmin || !isPreview) && (
      <Card className="mb-4 space-y-3">
        <h2 className="text-sm font-semibold">Create coding question</h2>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Problem statement" />
        <Textarea className="font-mono text-xs" value={starter} onChange={(e) => setStarter(e.target.value)} />
        <Button onClick={() => void createQuestion()}>Create question</Button>
        {isAdmin && <p className="text-xs text-muted-foreground">Admin authoring enabled.</p>}
      </Card>
      )}
      {isPreview ? (
        <EmptyState
          icon={Code2}
          title="Coding lab is in preview"
          description="Published assessments will appear here. This is not unrestricted cloud execution."
        />
      ) : (
      <div className={STACK_GRID}>
        {questions.map((q) => (
          <Link key={q.id} to={`/app/coding/${q.id}`}>
            <Card hover className="min-w-0">
              <h2 className="font-semibold">{q.title}</h2>
              <p className="text-sm text-muted-foreground">
                {q.difficulty} · {q.language} · {q.evaluation_mode === "javascript_solve" ? "JS solve()" : "Stored for review"}
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
