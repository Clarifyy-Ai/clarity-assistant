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
  evaluationModeForLanguage,
  evaluationModeLabel,
  languageLabel,
  languageOptionLabel,
} from "@/lib/coding/languages";
import {
  DEFAULT_CODING_CREATE_CASE_FIELDS,
  buildCodingCreateCasePayload,
} from "@/lib/coding/createQuestionCases";
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
  const [sampleInput, setSampleInput] = useState(DEFAULT_CODING_CREATE_CASE_FIELDS.sampleInput);
  const [sampleOutput, setSampleOutput] = useState(DEFAULT_CODING_CREATE_CASE_FIELDS.sampleOutput);
  const [visibleInput, setVisibleInput] = useState(DEFAULT_CODING_CREATE_CASE_FIELDS.visibleInput);
  const [visibleExpected, setVisibleExpected] = useState(DEFAULT_CODING_CREATE_CASE_FIELDS.visibleExpected);
  const [hiddenInput, setHiddenInput] = useState(DEFAULT_CODING_CREATE_CASE_FIELDS.hiddenInput);
  const [hiddenExpected, setHiddenExpected] = useState(DEFAULT_CODING_CREATE_CASE_FIELDS.hiddenExpected);
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
    const built = buildCodingCreateCasePayload({
      sampleInput,
      sampleOutput,
      visibleInput,
      visibleExpected,
      hiddenInput,
      hiddenExpected,
    });
    if (!built.ok) {
      toast.error(built.error);
      return;
    }
    const { payload } = built;

    const { data, error } = await supabase
      .from("coding_questions")
      .insert({
        title,
        description,
        difficulty: "EASY",
        language,
        starter_code: starter,
        sample_input: payload.sample_input,
        sample_output: payload.sample_output,
        evaluation_mode: evaluationModeForLanguage(language),
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
    await supabase.from("coding_test_cases").insert(
      payload.cases.map((c) => ({
        question_id: data.id,
        name: c.name,
        input_json: c.input_json,
        expected_json: c.expected_json,
        is_hidden: c.is_hidden,
        sort_order: c.sort_order,
      })),
    );
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
        description={
          isPreview
            ? "JS/TS practice scoring only — not a secure multi-language sandbox."
            : "JS/TS practice scoring only. Hidden tests stay server-side."
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
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="admin-coding-sample-in">Sample input</label>
            <Input
              id="admin-coding-sample-in"
              className="mt-1 font-mono text-xs"
              value={sampleInput}
              onChange={(e) => setSampleInput(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="admin-coding-sample-out">Sample output</label>
            <Input
              id="admin-coding-sample-out"
              className="mt-1 font-mono text-xs"
              value={sampleOutput}
              onChange={(e) => setSampleOutput(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="admin-coding-visible-in">Visible case input (JSON)</label>
            <Input
              id="admin-coding-visible-in"
              className="mt-1 font-mono text-xs"
              value={visibleInput}
              onChange={(e) => setVisibleInput(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="admin-coding-visible-ex">Visible case expected (JSON)</label>
            <Input
              id="admin-coding-visible-ex"
              className="mt-1 font-mono text-xs"
              value={visibleExpected}
              onChange={(e) => setVisibleExpected(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="admin-coding-hidden-in">Hidden case input (JSON)</label>
            <Input
              id="admin-coding-hidden-in"
              className="mt-1 font-mono text-xs"
              value={hiddenInput}
              onChange={(e) => setHiddenInput(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground" htmlFor="admin-coding-hidden-ex">Hidden case expected (JSON)</label>
            <Input
              id="admin-coding-hidden-ex"
              className="mt-1 font-mono text-xs"
              value={hiddenExpected}
              onChange={(e) => setHiddenExpected(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={() => void createQuestion()}>Create question</Button>
        <p className="text-xs text-muted-foreground">Admin authoring enabled. Only JavaScript is executed for scoring; other languages are not executed. Sample and case expected values must match the problem statement.</p>
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
