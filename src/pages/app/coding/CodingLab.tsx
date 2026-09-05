import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Code2, Loader2, Sparkles, UserCircle2 } from "lucide-react";
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
  languageOptionLabel,
} from "@/lib/coding/languages";
import {
  DEFAULT_CODING_CREATE_CASE_FIELDS,
  buildCodingCreateCasePayload,
} from "@/lib/coding/createQuestionCases";
import {
  buildCatalogSummary,
  buildPersonalizedCatalog,
  type CodingQuestionRow,
  type CodingSubmissionSummary,
} from "@/lib/coding/catalog";
import { CodingQuestionCard } from "@/components/coding/CodingQuestionCard";
import { PAGE_SHELL, STACK_GRID } from "@/lib/ui/responsivePage";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";

export default function CodingLabPage() {
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [questions, setQuestions] = useState<CodingQuestionRow[]>([]);
  const [submissions, setSubmissions] = useState<CodingSubmissionSummary[]>([]);
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("coding_questions")
      .select("id,title,description,difficulty,language,evaluation_mode,created_at")
      .eq("publish_status", "published")
      .order("title");
    if (error) {
      const message = error.message;
      setLoadError(message);
      toast.error(message);
      setQuestions([]);
    } else {
      setQuestions((data as CodingQuestionRow[]) ?? []);
    }

    if (user?.id) {
      const { data: subs, error: subsError } = await supabase
        .from("coding_submissions")
        .select("question_id,score,status,execution_status")
        .eq("user_id", user.id);
      if (subsError) {
        toast.error(subsError.message);
        setSubmissions([]);
      } else {
        setSubmissions((subs as CodingSubmissionSummary[]) ?? []);
      }
    } else {
      setSubmissions([]);
    }

    setLoaded(true);
    setLoading(false);
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
      toast.error((built as { error: string }).error);
      return;
    }
    const { payload } = built as Extract<typeof built, { ok: true }>;

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
      })) as any,
    );
    toast.success("Coding question created. Hidden cases stay server-side.");
    void load();
  }

  useEffect(() => {
    void load();
  }, [user?.id]);

  const catalog = useMemo(() => {
    const byQuestion = new Map<string, CodingSubmissionSummary[]>();
    for (const row of submissions) {
      const bucket = byQuestion.get(row.question_id) ?? [];
      bucket.push(row);
      byQuestion.set(row.question_id, bucket);
    }
    return buildPersonalizedCatalog(questions, byQuestion, profile);
  }, [questions, submissions, profile]);

  const recommendedIds = useMemo(
    () => new Set(catalog.recommended.map((q) => q.id)),
    [catalog.recommended],
  );
  const remainingProblems = useMemo(
    () => catalog.all.filter((q) => !recommendedIds.has(q.id)),
    [catalog.all, recommendedIds],
  );

  const isPreview = loaded && catalog.all.length === 0;
  const passedCount = catalog.all.filter((q) => q.progress.status === "passed").length;

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

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading problems…
        </div>
      )}

      {!loading && loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void load()} />
      )}

      {!loading && !loadError && (
        <>
          {!isPreview && (
            <Card className="mb-4 space-y-3 border-primary/20 bg-primary/[0.03]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    {catalog.context.personalized ? (
                      <Sparkles className="h-4 w-4 text-primary shrink-0" aria-hidden="true" />
                    ) : (
                      <UserCircle2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    )}
                    {catalog.context.personalized ? "Personalized for your profile" : "General practice catalog"}
                  </div>
                  <p className="text-sm text-muted-foreground">{buildCatalogSummary(catalog.context)}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                    {catalog.all.length} problem{catalog.all.length === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-muted-foreground">
                    {passedCount} passed
                  </span>
                </div>
              </div>
              {!catalog.context.personalized && (
                <Link
                  to="/app/settings/profile"
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary transition-colors"
                >
                  Complete profile for recommendations
                </Link>
              )}
            </Card>
          )}

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
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Problem statement"
                  />
                  <div>
                    <label className="text-xs text-muted-foreground" htmlFor="admin-coding-lang">
                      Language
                    </label>
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
                  <Textarea
                    className="font-mono text-xs"
                    value={starter}
                    onChange={(e) => setStarter(e.target.value)}
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="admin-coding-sample-in">
                        Sample input
                      </label>
                      <Input
                        id="admin-coding-sample-in"
                        className="mt-1 font-mono text-xs"
                        value={sampleInput}
                        onChange={(e) => setSampleInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="admin-coding-sample-out">
                        Sample output
                      </label>
                      <Input
                        id="admin-coding-sample-out"
                        className="mt-1 font-mono text-xs"
                        value={sampleOutput}
                        onChange={(e) => setSampleOutput(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="admin-coding-visible-in">
                        Visible case input (JSON)
                      </label>
                      <Input
                        id="admin-coding-visible-in"
                        className="mt-1 font-mono text-xs"
                        value={visibleInput}
                        onChange={(e) => setVisibleInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="admin-coding-visible-ex">
                        Visible case expected (JSON)
                      </label>
                      <Input
                        id="admin-coding-visible-ex"
                        className="mt-1 font-mono text-xs"
                        value={visibleExpected}
                        onChange={(e) => setVisibleExpected(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="admin-coding-hidden-in">
                        Hidden case input (JSON)
                      </label>
                      <Input
                        id="admin-coding-hidden-in"
                        className="mt-1 font-mono text-xs"
                        value={hiddenInput}
                        onChange={(e) => setHiddenInput(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="admin-coding-hidden-ex">
                        Hidden case expected (JSON)
                      </label>
                      <Input
                        id="admin-coding-hidden-ex"
                        className="mt-1 font-mono text-xs"
                        value={hiddenExpected}
                        onChange={(e) => setHiddenExpected(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={() => void createQuestion()}>Create question</Button>
                  <p className="text-xs text-muted-foreground">
                    Admin authoring enabled. Only JavaScript is executed for scoring; other languages are not
                    executed. Sample and case expected values must match the problem statement.
                  </p>
                </Card>
              )}

              {isPreview ? (
                <EmptyState
                  icon={Code2}
                  title="No published problems yet"
                  description="Content is unpublished. Use the form above to create the first problem."
                />
              ) : (
                <div className="space-y-6">
                  {catalog.recommended.length > 0 && (
                    <section aria-labelledby="coding-recommended-heading">
                      <h2 id="coding-recommended-heading" className="mb-3 text-sm font-semibold">
                        Recommended for you
                      </h2>
                      <div className={STACK_GRID}>
                        {catalog.recommended.map((q) => (
                          <CodingQuestionCard key={q.id} question={q} />
                        ))}
                      </div>
                    </section>
                  )}

                  <section aria-labelledby="coding-all-heading">
                    <h2 id="coding-all-heading" className="mb-3 text-sm font-semibold">
                      {catalog.recommended.length > 0 ? "More problems" : "Problems"}
                    </h2>
                    <div className={STACK_GRID}>
                      {(catalog.recommended.length > 0 ? remainingProblems : catalog.all).map((q) => (
                        <CodingQuestionCard key={q.id} question={q} />
                      ))}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
