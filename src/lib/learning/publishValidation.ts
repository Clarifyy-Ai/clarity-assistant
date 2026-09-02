/**
 * Client-side mirror of validate_learning_course_publish (DB trigger).
 * Surfaces actionable errors before a publish attempt.
 */

export type LessonForPublish = {
  module_id: string;
  title: string;
  lesson_type: string;
  content_text: string | null;
  resource_url: string | null;
};

export type ModuleForPublish = {
  id: string;
  title: string;
};

export function validateCourseForPublish(
  modules: ModuleForPublish[],
  lessons: LessonForPublish[],
): string | null {
  if (modules.length === 0) {
    return "Add at least one module before publishing.";
  }

  const moduleIds = new Set(modules.map((m) => m.id));
  const courseLessons = lessons.filter((l) => moduleIds.has(l.module_id));

  if (courseLessons.length === 0) {
    return "Add at least one lesson before publishing.";
  }

  for (const lesson of courseLessons) {
    if (!lesson.title.trim()) {
      return "Every lesson needs a title.";
    }
    if (lesson.lesson_type === "text") {
      if (!lesson.content_text?.trim()) {
        return `Lesson "${lesson.title}" needs text content before publish.`;
      }
    } else if (!lesson.resource_url?.trim()) {
      return `Lesson "${lesson.title}" needs a resource URL before publish.`;
    }
  }

  return null;
}
