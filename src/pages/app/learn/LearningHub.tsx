import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/common/EmptyState";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { PAGE_SHELL, STACK_GRID } from "@/lib/ui/responsivePage";

type Course = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
};

export default function LearningHubPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const navigate = useNavigate();
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoaded(false);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("learning_courses")
        .select("id,slug,title,description,duration_hours")
        .eq("publish_status", "published")
        .order("title");
      if (error) throw error;
      setCourses((data as Course[]) ?? []);
      if (!user?.id) return;
      const { data: enrolls, error: enrollError } = await supabase
        .from("course_enrollments")
        .select("course_id,percentage")
        .eq("user_id", user.id);
      if (enrollError) throw enrollError;
      const map: Record<string, number> = {};
      for (const row of enrolls ?? []) map[row.course_id as string] = Number(row.percentage ?? 0);
      setProgress(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Courses could not be loaded.");
      setCourses([]);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => { void load(); }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPreview = loaded && courses.length === 0;

  return (
    <div className={PAGE_SHELL}>
      <PageHeader
        title="Learning Hub"
        badge="Preview"
        description={
          isPreview
            ? "Preview — original Clarify courses will appear here. This is not a third-party LMS and not an official certification program."
            : "Original Clarify courses. This is not a third-party LMS and not an official certification program."
        }
      />
      {error && (
        <EmptyState title="Learning Hub unavailable" description={error} actionLabel="Retry" onAction={() => void load()} />
      )}
      {!error && isPreview ? (
        <EmptyState
          icon={BookOpen}
          title="No published courses yet"
          description="Content is unpublished. Published courses will appear here."
          actionLabel={isAdmin ? "Create a course" : undefined}
          onAction={isAdmin ? () => navigate("/app/admin/learning") : undefined}
        />
      ) : !error ? (
      <div className={STACK_GRID}>
        {courses.map((course) => (
          <Card key={course.id} className="flex min-w-0 flex-col">
            <h2 className="text-base font-semibold">{course.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{course.description}</p>
            <p className="mt-3 text-sm">Duration {course.duration_hours ?? 0} hours</p>
            <p className="text-sm font-medium">Course progress: {progress[course.id] ?? 0}%</p>
            <Link to={`/app/learn/${course.id}`} className="mt-4">
              <Button fullWidth>Open course</Button>
            </Link>
          </Card>
        ))}
      </div>
      ) : null}
    </div>
  );
}
