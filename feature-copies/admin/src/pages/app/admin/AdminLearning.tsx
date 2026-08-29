import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { writeAdminAudit } from "@/lib/admin/writeAdminAudit";
import { adminActionFailedMessage, toAdminUserMessage } from "@/lib/admin/adminErrors";

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  publish_status: string;
  updated_at: string;
};

type Module = { id: string; course_id: string; title: string; sort_order: number };
type Lesson = {
  id: string;
  module_id: string;
  title: string;
  content_text: string | null;
  resource_url: string | null;
  sort_order: number;
  lesson_type: string;
};

export default function AdminLearningPage() {
  const user = useAuthStore((s) => s.user);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [moduleTitle, setModuleTitle] = useState("Module 1");
  const [lessonTitle, setLessonTitle] = useState("Lesson 1");
  const [lessonBody, setLessonBody] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("learning_courses")
        .select("id,title,slug,description,publish_status,updated_at")
        .order("updated_at", { ascending: false });
      if (err) throw err;
      setCourses((data as Course[]) ?? []);
    } catch (e) {
      setError(toAdminUserMessage(e, undefined, "AdminLearning.load"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  async function loadDetail(courseId: string) {
    setSelectedId(courseId);
    const [{ data: mods }, { data: less }] = await Promise.all([
      supabase
        .from("learning_modules")
        .select("id,course_id,title,sort_order")
        .eq("course_id", courseId)
        .order("sort_order"),
      supabase
        .from("learning_lessons")
        .select("id,module_id,title,content_text,resource_url,sort_order,lesson_type")
        .order("sort_order"),
    ]);
    setModules((mods as Module[]) ?? []);
    const moduleIds = new Set(((mods as Module[]) ?? []).map((m) => m.id));
    setLessons(((less as Lesson[]) ?? []).filter((l) => moduleIds.has(l.module_id)));
    const course = courses.find((c) => c.id === courseId);
    if (course) {
      setTitle(course.title);
      setDescription(course.description ?? "");
    }
  }

  async function createCourse() {
    if (!user?.id || !title.trim()) return;
    setSaving(true);
    try {
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const { data: course, error: cErr } = await supabase
        .from("learning_courses")
        .insert({
          slug: `${slug}-${Date.now().toString(36)}`,
          title: title.trim(),
          description,
          duration_hours: 1,
          created_by: user.id,
          content_owner: user.id,
          source: "ORIGINAL",
          license_type: "ORIGINAL",
          copyright_status: "ORIGINAL",
          publish_status: "draft",
        })
        .select("id")
        .maybeSingle();
      if (cErr || !course) throw cErr ?? new Error("create failed");

      const { data: module, error: mErr } = await supabase
        .from("learning_modules")
        .insert({ course_id: course.id, title: moduleTitle || "Module 1", sort_order: 0 })
        .select("id")
        .maybeSingle();
      if (mErr || !module) throw mErr ?? new Error("module failed");

      const { error: lErr } = await supabase.from("learning_lessons").insert({
        module_id: module.id,
        title: lessonTitle || "Lesson 1",
        lesson_type: resourceUrl ? "video_url" : "text",
        content_text: lessonBody,
        resource_url: resourceUrl || null,
        duration_minutes: 10,
        sort_order: 0,
        created_by: user.id,
        content_owner: user.id,
        source: "ORIGINAL",
        license_type: "ORIGINAL",
        copyright_status: "ORIGINAL",
      });
      if (lErr) throw lErr;

      await writeAdminAudit({
        action: "create",
        targetType: "learning_course",
        targetId: course.id,
        newValue: { title: title.trim(), publish_status: "draft" },
      });
      toast.success("Course created as draft");
      setTitle("");
      setDescription("");
      setLessonBody("");
      setResourceUrl("");
      await loadCourses();
      await loadDetail(course.id);
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminLearning.create"));
    } finally {
      setSaving(false);
    }
  }

  async function saveCourseMeta() {
    if (!selectedId || !title.trim()) return;
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from("learning_courses")
        .update({ title: title.trim(), description })
        .eq("id", selectedId);
      if (err) throw err;
      toast.success("Course updated");
      await loadCourses();
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminLearning.save"));
    } finally {
      setSaving(false);
    }
  }

  async function setPublishStatus(status: "draft" | "published") {
    if (!selectedId) return;
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from("learning_courses")
        .update({ publish_status: status })
        .eq("id", selectedId);
      if (err) throw err;
      await writeAdminAudit({
        action: status === "published" ? "publish" : "unpublish",
        targetType: "learning_course",
        targetId: selectedId,
        newValue: { publish_status: status },
      });
      toast.success(status === "published" ? "Course published" : "Course set to draft");
      await loadCourses();
      await loadDetail(selectedId);
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminLearning.publish"));
    } finally {
      setSaving(false);
    }
  }

  async function addModule() {
    if (!selectedId) return;
    const name = window.prompt("Module title");
    if (!name?.trim()) return;
    const sort = modules.length;
    const { error: err } = await supabase
      .from("learning_modules")
      .insert({ course_id: selectedId, title: name.trim(), sort_order: sort });
    if (err) toast.error(adminActionFailedMessage(err));
    else await loadDetail(selectedId);
  }

  async function addLesson(moduleId: string) {
    if (!user?.id) return;
    const name = window.prompt("Lesson title");
    if (!name?.trim()) return;
    const existing = lessons.filter((l) => l.module_id === moduleId).length;
    const { error: err } = await supabase.from("learning_lessons").insert({
      module_id: moduleId,
      title: name.trim(),
      lesson_type: "text",
      content_text: "",
      sort_order: existing,
      created_by: user.id,
      content_owner: user.id,
      source: "ORIGINAL",
      license_type: "ORIGINAL",
      copyright_status: "ORIGINAL",
    });
    if (err) toast.error(adminActionFailedMessage(err));
    else if (selectedId) await loadDetail(selectedId);
  }

  async function reorderModule(moduleId: string, dir: -1 | 1) {
    const idx = modules.findIndex((m) => m.id === moduleId);
    const swap = modules[idx + dir];
    if (!swap || idx < 0) return;
    await Promise.all([
      supabase.from("learning_modules").update({ sort_order: swap.sort_order }).eq("id", moduleId),
      supabase.from("learning_modules").update({ sort_order: modules[idx].sort_order }).eq("id", swap.id),
    ]);
    if (selectedId) await loadDetail(selectedId);
  }

  const selected = courses.find((c) => c.id === selectedId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Learning Hub</h1>
        <p className="text-sm text-muted-foreground">Manage courses, modules, and lessons. Publish only after save succeeds.</p>
      </div>

      {error && <InlineErrorRetry message={error} onRetry={() => void loadCourses()} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <h2 className="font-medium">Courses</h2>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : courses.length === 0 ? (
            <EmptyState title="No courses" description="Create a draft course to get started." />
          ) : (
            <ul className="space-y-2">
              {courses.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-accent/5"
                    onClick={() => void loadDetail(c.id)}
                  >
                    <span>{c.title}</span>
                    <Badge variant="secondary">{c.publish_status}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-medium">{selected ? "Edit course" : "Create course"}</h2>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          {!selected && (
            <>
              <Input value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="First module title" />
              <Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="First lesson title" />
              <Textarea value={lessonBody} onChange={(e) => setLessonBody(e.target.value)} placeholder="Lesson text" />
              <Input value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="Optional resource URL" />
              <Button disabled={saving} onClick={() => void createCourse()}>Create draft</Button>
            </>
          )}
          {selected && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={saving} onClick={() => void saveCourseMeta()}>Save</Button>
              {selected.publish_status === "published" ? (
                <Button variant="outline" disabled={saving} onClick={() => void setPublishStatus("draft")}>Unpublish</Button>
              ) : (
                <Button disabled={saving} onClick={() => void setPublishStatus("published")}>Publish</Button>
              )}
              <Button variant="outline" onClick={() => void addModule()}>Add module</Button>
            </div>
          )}
        </Card>
      </div>

      {selected && (
        <Card className="space-y-4 p-4">
          <h2 className="font-medium">Modules & lessons</h2>
          {modules.map((m) => (
            <div key={m.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-sm">{m.title}</p>
                <div className="flex gap-1">
                  <Button size="xs" variant="outline" onClick={() => void reorderModule(m.id, -1)}>Up</Button>
                  <Button size="xs" variant="outline" onClick={() => void reorderModule(m.id, 1)}>Down</Button>
                  <Button size="xs" variant="outline" onClick={() => void addLesson(m.id)}>Add lesson</Button>
                </div>
              </div>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {lessons.filter((l) => l.module_id === m.id).map((l) => (
                  <li key={l.id}>{l.sort_order + 1}. {l.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
