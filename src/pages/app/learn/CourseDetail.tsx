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
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

type Course = {
  id: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
  unlock_mode: "sequential" | "open";
};

type ModuleRow = { id: string; title: string; sort_order: number };
type LessonRow = { id: string; module_id: string; title: string; sort_order: number; lesson_type: string };

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [certCode, setCertCode] = useState<string | null>(null);
  const [quizzes, setQuizzes] = useState<Array<{ id: string; title: string; question_ids: string[]; passing_percentage: number; is_final: boolean }>>([]);

  const load = useCallback(async () => {
    if (!courseId || !user?.id) return;
    const [{ data: courseRow }, { data: moduleRows }] = await Promise.all([
      supabase.from("learning_courses").select("*").eq("id", courseId).maybeSingle(),
      supabase.from("learning_modules").select("*").eq("course_id", courseId).order("sort_order"),
    ]);
    setCourse(courseRow as Course | null);
    setModules((moduleRows as ModuleRow[]) ?? []);
    const moduleIds = ((moduleRows as ModuleRow[]) ?? []).map((m) => m.id);
    if (moduleIds.length) {
      const { data: lessonRows } = await supabase
        .from("learning_lessons")
        .select("id,module_id,title,sort_order,lesson_type")
        .in("module_id", moduleIds)
        .order("sort_order");
      setLessons((lessonRows as LessonRow[]) ?? []);
    }
    await supabase.from("course_enrollments").upsert({
      user_id: user.id,
      course_id: courseId,
      last_accessed: new Date().toISOString(),
    });
    const { data: progress } = await supabase
      .from("lesson_progress")
      .select("lesson_id,completed_at")
      .eq("user_id", user.id);
    setCompleted(new Set((progress ?? []).filter((p) => p.completed_at).map((p) => p.lesson_id as string)));
    const { data: cert } = await supabase
      .from("course_certificates")
      .select("certificate_code")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .maybeSingle();
    setCertCode((cert?.certificate_code as string | undefined) ?? null);
    const { data: quizRows } = await supabase
      .from("learning_quizzes")
      .select("id,title,question_ids,passing_percentage,is_final")
      .eq("course_id", courseId);
    setQuizzes(
      (quizRows ?? []) as Array<{
        id: string;
        title: string;
        question_ids: string[];
        passing_percentage: number;
        is_final: boolean;
      }>,
    );
  }, [courseId, user?.id]);

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

  const views = moduleProgressViews(moduleRefs, completed, course?.unlock_mode ?? "sequential");
  const percent = coursePercentage(moduleRefs, completed);

  useEffect(() => {
    if (!user?.id || !courseId) return;
    void supabase
      .from("course_enrollments")
      .update({
        percentage: percent,
        completed_at: percent >= 100 ? new Date().toISOString() : null,
        last_accessed: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("course_id", courseId);
  }, [percent, user?.id, courseId]);

  async function issueCert() {
    if (!courseId) return;
    const { data, error } = await supabase.rpc("issue_course_certificate", { p_course_id: courseId });
    if (error) {
      toast.error(error.message);
      return;
    }
    const code = (data as { certificate_code?: string } | null)?.certificate_code;
    if (code) {
      setCertCode(code);
      toast.success(`${certificateKindLabel()} issued.`);
    }
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
        {canIssueCertificate(percent) && !certCode && (
          <Button className="mt-3" onClick={() => void issueCert()}>Issue course completion certificate</Button>
        )}
        {certCode && (
          <Link className="mt-3 inline-block text-sm text-primary underline" to={verificationPath(certCode)}>
            Verify {certCode}
          </Link>
        )}
        {quizzes.map((quiz) => (
          <Button
            key={quiz.id}
            className="mt-3 mr-2"
            variant="outline"
            onClick={() => {
              if (!user?.id) return;
              void supabase
                .from("mock_tests")
                .insert({
                  user_id: user.id,
                  test_name: quiz.title,
                  config: {
                    source: "exam_template",
                    passing_percentage: quiz.passing_percentage,
                  },
                  question_ids: quiz.question_ids,
                  status: "DRAFT",
                  time_limit_minutes: 15,
                })
                .select("id")
                .maybeSingle()
                .then(({ data, error }) => {
                  if (error || !data) toast.error(error?.message ?? "Quiz could not start.");
                  else navigate(`/app/assessments/session/${data.id}`);
                });
            }}
          >
            {quiz.is_final ? "Final assessment" : "Quiz"}: {quiz.title}
          </Button>
        ))}
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
