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
import { validateCourseForPublish } from "@/lib/learning/publishValidation";
import { invalidatePublicContentCache } from "@/lib/cms/publicContentCache";

type Course = {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  publish_status: string;
  updated_at: string;
  unlock_mode?: string;
  duration_hours?: number | null;
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
type Quiz = {
  id: string;
  course_id: string | null;
  module_id: string | null;
  title: string;
  passing_percentage: number;
  is_final: boolean;
  question_ids: string[];
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
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [moduleTitle, setModuleTitle] = useState("Module 1");
  const [lessonTitle, setLessonTitle] = useState("Lesson 1");
  const [lessonBody, setLessonBody] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");

  const [editLessonTitle, setEditLessonTitle] = useState("");
  const [editLessonType, setEditLessonType] = useState<"text" | "video_url">("text");
  const [editLessonBody, setEditLessonBody] = useState("");
  const [editResourceUrl, setEditResourceUrl] = useState("");

  const [courseSlug, setCourseSlug] = useState("");
  const [unlockMode, setUnlockMode] = useState<"sequential" | "open">("sequential");
  const [durationHours, setDurationHours] = useState("1");
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [quizModuleId, setQuizModuleId] = useState("");
  const [quizPassing, setQuizPassing] = useState("70");
  const [quizIsFinal, setQuizIsFinal] = useState(false);
  const [quizQuestionIds, setQuizQuestionIds] = useState("");

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
    setEditingLessonId(null);
    const [{ data: mods }, { data: less }, { data: courseRow }, { data: quizRows }] = await Promise.all([
      supabase
        .from("learning_modules")
        .select("id,course_id,title,sort_order")
        .eq("course_id", courseId)
        .order("sort_order"),
      supabase
        .from("learning_lessons")
        .select("id,module_id,title,content_text,resource_url,sort_order,lesson_type")
        .order("sort_order"),
      supabase
        .from("learning_courses")
        .select("id,title,slug,description,unlock_mode,duration_hours")
        .eq("id", courseId)
        .maybeSingle(),
      supabase
        .from("learning_quizzes")
        .select("id,course_id,module_id,title,passing_percentage,is_final,question_ids")
        .eq("course_id", courseId)
        .order("created_at"),
    ]);
    setModules((mods as Module[]) ?? []);
    const moduleIds = new Set(((mods as Module[]) ?? []).map((m) => m.id));
    setLessons(((less as Lesson[]) ?? []).filter((l) => moduleIds.has(l.module_id)));
    setQuizzes((quizRows as Quiz[]) ?? []);
    const course = (courseRow as Course | null) ?? courses.find((c) => c.id === courseId);
    if (course) {
      setTitle(course.title);
      setDescription(course.description ?? "");
      setCourseSlug(course.slug ?? "");
      setUnlockMode(course.unlock_mode === "open" ? "open" : "sequential");
      setDurationHours(String(course.duration_hours ?? 1));
    }
    if (mods?.[0]?.id) setQuizModuleId(mods[0].id);
  }

  function beginEditLesson(lesson: Lesson) {
    setEditingLessonId(lesson.id);
    setEditLessonTitle(lesson.title);
    setEditLessonType(lesson.lesson_type === "video_url" ? "video_url" : "text");
    setEditLessonBody(lesson.content_text ?? "");
    setEditResourceUrl(lesson.resource_url ?? "");
  }

  async function saveLesson() {
    if (!editingLessonId || !selectedId) return;
    if (!editLessonTitle.trim()) {
      toast.error("Lesson title is required");
      return;
    }
    setSaving(true);
    try {
      const { error: err } = await supabase
        .from("learning_lessons")
        .update({
          title: editLessonTitle.trim(),
          lesson_type: editLessonType,
          content_text: editLessonType === "text" ? editLessonBody : null,
          resource_url: editLessonType === "video_url" ? editResourceUrl.trim() || null : null,
        })
        .eq("id", editingLessonId);
      if (err) throw err;
      toast.success("Lesson saved");
      setEditingLessonId(null);
      await loadDetail(selectedId);
    } catch (e) {
      toast.error(adminActionFailedMessage(e, "AdminLearning.lesson"));
    } finally {
      setSaving(false);
    }
  }

  async function createCourse() {
    if (!user?.id || !title.trim()) return;
    if (!lessonBody.trim() && !resourceUrl.trim()) {
      toast.error("First lesson needs text content or a resource URL");
      return;
    }
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

      const lessonType = resourceUrl.trim() ? "video_url" : "text";
      const { error: lErr } = await supabase.from("learning_lessons").insert({
        module_id: module.id,
        title: lessonTitle || "Lesson 1",
        lesson_type: lessonType,
        content_text: lessonType === "text" ? lessonBody : null,
        resource_url: lessonType === "video_url" ? resourceUrl.trim() : null,
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
        .update({
          title: title.trim(),
          description,
          slug: courseSlug.trim() || undefined,
          unlock_mode: unlockMode,
          duration_hours: Math.max(1, Number(durationHours) || 1),
        })
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

  async function addQuiz() {
    if (!selectedId || !quizTitle.trim()) {
      toast.error("Quiz title is required");
      return;
    }
    const questionIds = quizQuestionIds
      .split(/[,\s]+/)
      .map((id) => id.trim())
      .filter(Boolean);
    if (questionIds.length === 0) {
      toast.error("Add at least one question id");
      return;
    }
    const { error: err } = await supabase.from("learning_quizzes").insert({
      course_id: selectedId,
      module_id: quizModuleId || null,
      title: quizTitle.trim(),
      passing_percentage: Math.min(100, Math.max(1, Number(quizPassing) || 70)),
      is_final: quizIsFinal,
      question_ids: questionIds,
    });
    if (err) {
      toast.error(adminActionFailedMessage(err));
      return;
    }
    toast.success("Quiz added");
    setQuizTitle("");
    setQuizQuestionIds("");
    setQuizIsFinal(false);
    await loadDetail(selectedId);
  }

  async function deleteQuiz(quizId: string) {
    if (!selectedId) return;
    const { error: err } = await supabase.from("learning_quizzes").delete().eq("id", quizId);
    if (err) toast.error(adminActionFailedMessage(err));
    else await loadDetail(selectedId);
  }

  async function setPublishStatus(status: "draft" | "published") {
    if (!selectedId) return;
    if (status === "published") {
      const validationError = validateCourseForPublish(modules, lessons);
      if (validationError) {
        toast.error(validationError);
        return;
      }
    }
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
      invalidatePublicContentCache(["learning"]);
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
      content_text: "Add lesson content before publishing.",
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
  const publishBlockReason =
    selected && selected.publish_status !== "published"
      ? validateCourseForPublish(modules, lessons)
      : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Learning Hub</h1>
        <p className="text-sm text-muted-foreground">
          Manage courses, modules, and lessons. Publish only after every lesson has content.
        </p>
      </div>

      {error && <InlineErrorRetry message={error} onRetry={() => void loadCourses()} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4 min-w-0">
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

        <Card className="space-y-3 p-4 min-w-0">
          <h2 className="font-medium">{selected ? "Edit course" : "Create course"}</h2>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" />
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
          {!selected && (
            <>
              <Input value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="First module title" />
              <Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="First lesson title" />
              <Textarea value={lessonBody} onChange={(e) => setLessonBody(e.target.value)} placeholder="Lesson text (required unless resource URL)" />
              <Input value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="Optional resource URL (video)" />
              <Button disabled={saving} onClick={() => void createCourse()}>Create draft</Button>
            </>
          )}
          {selected && (
            <div className="space-y-2">
              <Input value={courseSlug} onChange={(e) => setCourseSlug(e.target.value)} placeholder="URL slug" />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={unlockMode}
                  onChange={(e) => setUnlockMode(e.target.value as "sequential" | "open")}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="sequential">Sequential unlock</option>
                  <option value="open">Open unlock</option>
                </select>
                <Input
                  type="number"
                  min={1}
                  value={durationHours}
                  onChange={(e) => setDurationHours(e.target.value)}
                  placeholder="Duration (hours)"
                />
              </div>
              {publishBlockReason && selected.publish_status !== "published" ? (
                <p className="text-xs text-amber-600 dark:text-amber-400" role="status">
                  Before publish: {publishBlockReason}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button disabled={saving} onClick={() => void saveCourseMeta()}>Save</Button>
                {selected.publish_status === "published" ? (
                  <Button variant="outline" disabled={saving} onClick={() => void setPublishStatus("draft")}>Unpublish</Button>
                ) : (
                  <Button
                    disabled={saving || Boolean(publishBlockReason)}
                    onClick={() => void setPublishStatus("published")}
                    data-testid="learning-publish"
                  >
                    Publish
                  </Button>
                )}
                <Button variant="outline" onClick={() => void addModule()}>Add module</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {selected && (
        <Card className="space-y-4 p-4 min-w-0">
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
              <ul className="space-y-2 text-sm">
                {lessons.filter((l) => l.module_id === m.id).map((l) => {
                  const missingContent =
                    l.lesson_type === "text"
                      ? !l.content_text?.trim()
                      : !l.resource_url?.trim();
                  return (
                    <li key={l.id} className="rounded-md border border-border/60 p-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={missingContent ? "text-amber-600" : "text-muted-foreground"}>
                          {l.sort_order + 1}. {l.title}
                          {missingContent ? " (needs content)" : ""}
                        </span>
                        <Button size="xs" variant="outline" onClick={() => beginEditLesson(l)}>
                          Edit
                        </Button>
                      </div>
                      {editingLessonId === l.id && (
                        <div className="mt-2 space-y-2">
                          <Input value={editLessonTitle} onChange={(e) => setEditLessonTitle(e.target.value)} placeholder="Lesson title" />
                          <select
                            value={editLessonType}
                            onChange={(e) => setEditLessonType(e.target.value as "text" | "video_url")}
                            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                          >
                            <option value="text">Text lesson</option>
                            <option value="video_url">Video / resource URL</option>
                          </select>
                          {editLessonType === "text" ? (
                            <Textarea
                              value={editLessonBody}
                              onChange={(e) => setEditLessonBody(e.target.value)}
                              placeholder="Lesson content"
                              className="min-h-[120px]"
                            />
                          ) : (
                            <Input
                              value={editResourceUrl}
                              onChange={(e) => setEditResourceUrl(e.target.value)}
                              placeholder="https://…"
                            />
                          )}
                          <div className="flex gap-2">
                            <Button size="sm" disabled={saving} onClick={() => void saveLesson()}>Save lesson</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingLessonId(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </Card>
      )}

      {selected && (
        <Card className="space-y-3 p-4 min-w-0">
          <h2 className="font-medium">Module quizzes</h2>
          <p className="text-xs text-muted-foreground">
            Link assessment question IDs (comma-separated). Final quizzes gate certificates.
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            <Input value={quizTitle} onChange={(e) => setQuizTitle(e.target.value)} placeholder="Quiz title" />
            <select
              value={quizModuleId}
              onChange={(e) => setQuizModuleId(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
            >
              {modules.map((m) => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
            <Input value={quizPassing} onChange={(e) => setQuizPassing(e.target.value)} placeholder="Passing %" />
            <Input
              value={quizQuestionIds}
              onChange={(e) => setQuizQuestionIds(e.target.value)}
              placeholder="Question UUIDs (comma-separated)"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={quizIsFinal} onChange={(e) => setQuizIsFinal(e.target.checked)} />
            Final assessment (required for certificate)
          </label>
          <Button size="sm" onClick={() => void addQuiz()}>Add quiz</Button>
          <ul className="space-y-2 text-sm">
            {quizzes.map((quiz) => (
              <li key={quiz.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 p-2">
                <span>
                  {quiz.title}
                  {quiz.is_final ? " · final" : ""} · pass {quiz.passing_percentage}% · {quiz.question_ids.length} questions
                </span>
                <Button size="xs" variant="outline" onClick={() => void deleteQuiz(quiz.id)}>Delete</Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
