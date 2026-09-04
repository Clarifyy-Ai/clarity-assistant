import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import {
  canIssueCertificate,
  coursePercentage,
  moduleProgressViews,
  type ModuleRef,
} from "@/lib/learning/progress";
import { certificateKindLabel, verificationPath } from "@/lib/learning/certificates";
import {
  downloadCertificatePdf,
  type CertificatePdfInput,
} from "@/lib/learning/certificatePdf";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { Download } from "lucide-react";

type Course = {
  id: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
  unlock_mode: "sequential" | "open";
  publish_status: "draft" | "published" | "archived";
};

type ModuleRow = { id: string; title: string; sort_order: number };
type LessonRow = { id: string; module_id: string; title: string; sort_order: number; lesson_type: string };

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [certCode, setCertCode] = useState<string | null>(null);
  const [certRecord, setCertRecord] = useState<CertificatePdfInput | null>(null);
  const [quizzes, setQuizzes] = useState<Array<{ id: string; title: string; question_ids: string[]; passing_percentage: number; is_final: boolean }>>([]);
  const [quizProgress, setQuizProgress] = useState<Map<string, { score: number | null; completed_at: string | null }>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!courseId || !user?.id) return;
    setError(null);
    const [{ data: courseRow, error: courseError }, { data: moduleRows, error: moduleError }] = await Promise.all([
      supabase.from("learning_courses").select("*").eq("id", courseId).maybeSingle(),
      supabase.from("learning_modules").select("*").eq("course_id", courseId).order("sort_order"),
    ]);
    if (courseError || moduleError) { setError("Course could not be loaded."); return; }
    if (!courseRow || (courseRow.publish_status !== "published" && !isAdmin)) {
      setError("This course is not currently available.");
      return;
    }
    setCourse(courseRow as Course | null);
    setModules((moduleRows as ModuleRow[]) ?? []);
    const moduleIds = ((moduleRows as ModuleRow[]) ?? []).map((m) => m.id);
    let loadedLessons: LessonRow[] = [];
    if (moduleIds.length) {
      const { data: lessonRows, error: lessonError } = await supabase
        .from("learning_lessons")
        .select("id,module_id,title,sort_order,lesson_type")
        .in("module_id", moduleIds)
        .order("sort_order");
      if (lessonError) { setError("Course lessons could not be loaded."); return; }
      loadedLessons = (lessonRows as LessonRow[]) ?? [];
      setLessons(loadedLessons);
    }
    const { error: enrollmentError } = await supabase.from("course_enrollments").upsert({
      user_id: user.id,
      course_id: courseId,
      last_accessed: new Date().toISOString(),
    });
    if (enrollmentError) { setError("Your course progress could not be loaded."); return; }
    const { data: progress, error: progressError } = await supabase
      .from("lesson_progress")
      .select("lesson_id,completed_at")
      .eq("user_id", user.id);
    if (progressError) { setError("Your lesson progress could not be loaded."); return; }
    const lessonIds = new Set(loadedLessons.map((lesson) => lesson.id));
    setCompleted(new Set((progress ?? []).filter((p) => p.completed_at && lessonIds.has(p.lesson_id as string)).map((p) => p.lesson_id as string)));
    const { data: cert } = await supabase
      .from("course_certificates")
      .select(
        "certificate_code,student_name,course_name,issued_at,course_duration_hours,completion_percentage",
      )
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();
    const code = (cert?.certificate_code as string | undefined) ?? null;
    setCertCode(code);
    if (cert && code) {
      setCertRecord({
        certificate_code: code,
        student_name: String(cert.student_name ?? profile?.full_name ?? "Learner"),
        course_name: String(cert.course_name ?? courseRow.title ?? "Course"),
        issued_at: String(cert.issued_at ?? new Date().toISOString()),
        course_duration_hours:
          cert.course_duration_hours == null ? null : Number(cert.course_duration_hours),
        completion_percentage: Number(cert.completion_percentage ?? 100),
      });
    } else {
      setCertRecord(null);
    }
    const { data: quizRows } = await supabase
      .from("learning_quizzes")
      .select("id,title,question_ids,passing_percentage,is_final")
      .eq("course_id", courseId);
    const loadedQuizzes =
      (quizRows ?? []) as Array<{
        id: string;
        title: string;
        question_ids: string[];
        passing_percentage: number;
        is_final: boolean;
      }>;
    setQuizzes(loadedQuizzes);
    if (loadedQuizzes.length > 0) {
      const { data: quizProgressRows, error: quizProgressError } = await supabase
        .from("quiz_progress")
        .select("quiz_id,score,completed_at")
        .eq("user_id", user.id)
        .in("quiz_id", loadedQuizzes.map((quiz) => quiz.id));
      if (quizProgressError) {
        setError("Your quiz progress could not be loaded.");
        return;
      }
      setQuizProgress(
        new Map(
          (quizProgressRows ?? []).map((row) => [
            row.quiz_id as string,
            {
              score: row.score == null ? null : Number(row.score),
              completed_at: (row.completed_at as string | null) ?? null,
            },
          ]),
        ),
      );
    } else {
      setQuizProgress(new Map());
    }
  }, [courseId, user?.id, isAdmin, profile?.full_name]);

  useEffect(() => {
    void load();
  }, [load]);

  const moduleRefs: Array<ModuleRef & { title: string }> = useMemo(
    () =>
      modules.map((m) => ({
        id: m.id,
        title: m.title,
        sortOrder: m.sort_order,
        lessons: lessons
          .filter((l) => l.module_id === m.id)
          .map((l) => ({ id: l.id, moduleId: l.module_id, sortOrder: l.sort_order })),
      })),
    [modules, lessons],
  );

  const quizRefs = useMemo(
    () => quizzes.map((quiz) => ({ id: quiz.id, isFinal: quiz.is_final })),
    [quizzes],
  );
  const passedQuizIds = useMemo(
    () =>
      new Set(
        [...quizProgress.entries()]
          .filter(([, progress]) => Boolean(progress.completed_at))
          .map(([quizId]) => quizId),
      ),
    [quizProgress],
  );

  const views = moduleProgressViews(moduleRefs, completed, course?.unlock_mode ?? "sequential");
  const percent = coursePercentage(moduleRefs, completed, quizRefs, passedQuizIds);

  async function startQuiz(quiz: {
    id: string;
    title: string;
    question_ids: string[];
    passing_percentage: number;
    is_final: boolean;
  }) {
    if (!user?.id || !courseId) return;
    try {
      const data = await fetchEdgeJson<{ test_id?: string; test?: { id?: string } }>("create-test", {
        test_name: quiz.title,
        question_ids: quiz.question_ids,
        time_limit_minutes: 15,
        source: "learning_quiz",
        config: {
          source: "learning_quiz",
          course_id: courseId,
          quiz_id: quiz.id,
          is_final: quiz.is_final,
          passing_percentage: quiz.passing_percentage,
        },
      });
      const testId = data?.test_id ?? data?.test?.id;
      if (!testId) throw new Error("Assessment could not start.");
      void navigate(`/app/assessments/session/${testId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Quiz could not start.");
    }
  }

  async function issueCert() {
    if (!courseId) return;
    try {
      const data = await fetchEdgeJson<{ certificate_code?: string }>("issue-course-certificate", {
        course_id: courseId,
      });
      const code = data?.certificate_code;
      if (code) {
        setCertCode(code);
        setCertRecord({
          certificate_code: code,
          student_name: profile?.full_name || "Learner",
          course_name: course?.title ?? "Course",
          issued_at: new Date().toISOString(),
          course_duration_hours: course?.duration_hours ?? null,
          completion_percentage: percent,
        });
        toast.success(`${certificateKindLabel()} issued.`);
      } else {
        toast.error("Certificate could not be issued.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Certificate could not be issued.");
    }
  }

  function downloadIssuedCertificate() {
    if (!certRecord) {
      toast.error("Certificate details are not ready yet. Refresh and try again.");
      return;
    }
    try {
      downloadCertificatePdf(certRecord);
      toast.success("Certificate PDF downloaded.");
    } catch {
      toast.error("Could not create the PDF. Please try again.");
    }
  }

  if (error) {
    return (
      <div className={PAGE_SHELL}>
        <PageHeader title="Course unavailable" breadcrumbs={[{ label: "Learning Hub", href: "/app/learn" }, { label: "Course" }]} />
        <Card>
          <p className="text-sm text-destructive">{error}</p>
          <Button className="mt-3" variant="outline" onClick={() => void load()}>Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={course?.title ?? "Course"}
        description={course?.description ?? undefined}
        breadcrumbs={[{ label: "Learning Hub", href: "/app/learn" }, { label: course?.title ?? "Course" }]}
      />
      <Card className="mb-4">
        <p className="text-lg font-semibold">Course progress: {percent}%</p>
        <p className="text-sm text-muted-foreground">Learner: {profile?.full_name || "You"}</p>
        {canIssueCertificate(percent, quizRefs, passedQuizIds) && !certCode && (
          <Button className="mt-3" onClick={() => void issueCert()}>Issue course completion certificate</Button>
        )}
        {certCode && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Link className="text-sm text-primary underline" to={verificationPath(certCode)}>
              Verify {certCode}
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Download className="h-3.5 w-3.5" aria-hidden />}
              onClick={downloadIssuedCertificate}
              data-testid="course-certificate-download-pdf"
            >
              Download PDF
            </Button>
          </div>
        )}
        <div className="mt-3 flex flex-col sm:flex-row flex-wrap gap-2">
        {quizzes.map((quiz) => {
          const progress = quizProgress.get(quiz.id);
          const passed = Boolean(progress?.completed_at);
          const attempted = progress?.score != null;
          const badge = passed
            ? `Passed (${Math.round(progress?.score ?? 0)}%)`
            : attempted
              ? `Attempted (${Math.round(progress?.score ?? 0)}%)`
              : null;
          return (
            <Button
              key={quiz.id}
              className="mr-0"
              variant={passed ? "secondary" : "outline"}
              onClick={() => void startQuiz(quiz)}
            >
              {quiz.is_final ? "Final assessment" : "Quiz"}: {quiz.title}
              {badge ? ` — ${badge}` : ""}
            </Button>
          );
        })}
        </div>
      </Card>
      <div className="space-y-3">
        {views.map((view) => {
          const moduleLessons = lessons.filter((l) => l.module_id === view.id);
          return (
            <Card key={view.id} className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {view.title} {view.state === "complete" ? "✓" : view.state === "locked" ? "Locked" : `${view.percent}%`}
                </h2>
              </div>
              {view.state === "locked" ? (
                <p className="mt-2 text-sm text-muted-foreground">Complete the previous module to unlock.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {moduleLessons.map((lesson) => (
                    <li key={lesson.id}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/app/learn/${courseId}/lesson/${lesson.id}`)}
                      >
                        {completed.has(lesson.id) ? "✓ " : ""}
                        {lesson.title}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
