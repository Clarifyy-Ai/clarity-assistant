import { supabase } from "@/lib/supabase/client";
import { getOrLoadPublicContent } from "@/lib/cms/publicContentCache";

export type PublishedLearningCourse = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  duration_hours: number | null;
};

export async function listPublishedLearningCourses(): Promise<PublishedLearningCourse[]> {
  return getOrLoadPublicContent("learning:listPublished", async () => {
    const { data, error } = await supabase
      .from("learning_courses")
      .select("id,slug,title,description,duration_hours")
      .eq("publish_status", "published")
      .order("title");
    if (error) throw error;
    return (data as PublishedLearningCourse[]) ?? [];
  });
}
