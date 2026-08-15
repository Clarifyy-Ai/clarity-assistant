import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

type Lesson = {
  id: string;
  title: string;
  lesson_type: string;
  content_text: string | null;
  resource_url: string | null;
  module_id: string;
  license_type: string;
  source: string | null;
};

export default function LessonPlayerPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [lesson, setLesson] = useState<Lesson | null>(null);

  const load = useCallback(async () => {
    if (!lessonId || !user?.id) return;
    const { data, error } = await supabase.from("learning_lessons").select("*").eq("id", lessonId).maybeSingle();
    if (error) toast.error(error.message);
    setLesson(data as Lesson | null);
    if (data) {
      await supabase.from("lesson_progress").upsert({
        user_id: user.id,
        lesson_id: lessonId,
        last_accessed: new Date().toISOString(),
      });
    }
  }, [lessonId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete() {
    if (!user?.id || !lessonId) return;
    await supabase.from("lesson_progress").upsert({
      user_id: user.id,
      lesson_id: lessonId,
      last_accessed: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    });
    toast.success("Lesson marked complete.");
    navigate(`/app/learn/${courseId}`);
  }

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title={lesson?.title ?? "Lesson"}
        breadcrumbs={[
          { label: "Learning Hub", href: "/app/learn" },
          { label: "Course", href: `/app/learn/${courseId}` },
          { label: lesson?.title ?? "Lesson" },
        ]}
      />
      <Card className="min-w-0">
        <p className="text-xs text-muted-foreground">
          Type: {lesson?.lesson_type} · License: {lesson?.license_type} · Source: {lesson?.source ?? "ORIGINAL"}
        </p>
        {lesson?.lesson_type === "text" && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-6">{lesson.content_text}</p>
        )}
        {lesson?.resource_url && (lesson.lesson_type === "video_url" || lesson.lesson_type === "external") && (
          <a className="mt-4 inline-block break-all text-sm text-primary underline" href={lesson.resource_url} target="_blank" rel="noreferrer">
            Open resource
          </a>
        )}
        {lesson?.resource_url && ["pdf", "ppt", "doc"].includes(lesson.lesson_type) && (
          <a className="mt-4 inline-block break-all text-sm text-primary underline" href={lesson.resource_url} target="_blank" rel="noreferrer">
            Open document
          </a>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => void complete()}>Mark complete</Button>
          <Link to={`/app/learn/${courseId}`}>
            <Button variant="outline">Back to course</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
