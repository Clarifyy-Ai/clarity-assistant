import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";

export default function AdminLearningPage() {
  const user = useAuthStore((s) => s.user);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [moduleTitle, setModuleTitle] = useState("Module 1");
  const [lessonTitle, setLessonTitle] = useState("Lesson 1");
  const [lessonBody, setLessonBody] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");

  async function createCourse() {
    if (!user?.id || !title.trim()) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { data: course, error } = await supabase
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
        publish_status: "published",
      })
      .select("id")
      .maybeSingle();
    if (error || !course) {
      toast.error(error?.message ?? "Could not create course.");
      return;
    }
    const { data: module, error: mErr } = await supabase
      .from("learning_modules")
      .insert({ course_id: course.id, title: moduleTitle || "Module 1", sort_order: 0 })
      .select("id")
      .maybeSingle();
    if (mErr || !module) {
      toast.error(mErr?.message ?? "Module failed.");
      return;
    }
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
    if (lErr) toast.error(lErr.message);
    else toast.success("Course published.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Create learning course</h1>
      <Card className="space-y-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <Input value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="Module title" />
        <Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="Lesson title" />
        <Textarea value={lessonBody} onChange={(e) => setLessonBody(e.target.value)} placeholder="Lesson text (original content you own)" />
        <Input value={resourceUrl} onChange={(e) => setResourceUrl(e.target.value)} placeholder="Optional video or resource URL you have rights to use" />
        <Button onClick={() => void createCourse()}>Create course</Button>
      </Card>
    </div>
  );
}
