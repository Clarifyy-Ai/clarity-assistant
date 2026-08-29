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
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!lessonId || !user?.id) return;
    const { data, error } = await supabase
      .from("learning_lessons")
      .select("id,title,lesson_type,content_text,resource_url,module_id,license_type,source")
      .eq("id", lessonId)
      .maybeSingle();
    if (error) { toast.error("Lesson could not be loaded."); return; }
    setLesson(data as Lesson | null);
    if (data) {
      const { error: progressError } = await supabase.from("lesson_progress").upsert({
        user_id: user.id,
        lesson_id: lessonId,
        last_accessed: new Date().toISOString(),
      });
      if (progressError) toast.error("Your lesson access could not be saved.");
    }
  }, [lessonId, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function complete() {
    if (!user?.id || !lessonId) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("complete_learning_lesson", { p_lesson_id: lessonId });
      if (error || !data) throw error ?? new Error("Completion was not persisted.");
      toast.success("Lesson marked complete.");
      void navigate(`/app/learn/${courseId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lesson completion could not be saved.");
    } finally {
      setSaving(false);
    }
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
          <Button loading={saving} disabled={saving || !lesson} onClick={() => void complete()}>Mark complete</Button>
          <Link to={`/app/learn/${courseId}`}>
            <Button variant="outline">Back to course</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
