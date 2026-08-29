export type UnlockMode = "sequential" | "open";

export type LessonRef = { id: string; moduleId: string; sortOrder: number };
export type ModuleRef = { id: string; sortOrder: number; lessons: LessonRef[] };

export type ProgressMaps = {
  completedLessonIds: Set<string>;
  completedQuizModuleIds?: Set<string>;
};

export function lessonCompletionRatio(totalLessons: number, completed: number): number {
  if (totalLessons <= 0) return 0;
  return Math.round((Math.min(completed, totalLessons) / totalLessons) * 100);
}

export function isModuleComplete(module: ModuleRef, completedLessonIds: Set<string>): boolean {
  if (module.lessons.length === 0) return false;
  return module.lessons.every((lesson) => completedLessonIds.has(lesson.id));
}

export function modulePercent(module: ModuleRef, completedLessonIds: Set<string>): number {
  if (module.lessons.length === 0) return 0;
  const done = module.lessons.filter((lesson) => completedLessonIds.has(lesson.id)).length;
  return Math.round((done / module.lessons.length) * 100);
}

export function isModuleUnlocked(
  modules: ModuleRef[],
  moduleId: string,
  completedLessonIds: Set<string>,
  unlockMode: UnlockMode,
): boolean {
  if (unlockMode === "open") return true;
  const ordered = [...modules].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((m) => m.id === moduleId);
  if (index <= 0) return true;
  return isModuleComplete(ordered[index - 1], completedLessonIds);
}

export function coursePercentage(modules: ModuleRef[], completedLessonIds: Set<string>): number {
  const lessons = modules.flatMap((m) => m.lessons);
  const done = lessons.filter((l) => completedLessonIds.has(l.id)).length;
  return lessonCompletionRatio(lessons.length, done);
}

export function canIssueCertificate(percentage: number): boolean {
  return percentage >= 100;
}

export type ModuleProgressView = {
  id: string;
  title?: string;
  state: "complete" | "in_progress" | "locked";
  percent: number;
};

export function moduleProgressViews(
  modules: Array<ModuleRef & { title?: string }>,
  completedLessonIds: Set<string>,
  unlockMode: UnlockMode,
): ModuleProgressView[] {
  return [...modules]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((module) => {
      const unlocked = isModuleUnlocked(modules, module.id, completedLessonIds, unlockMode);
      const percent = modulePercent(module, completedLessonIds);
      if (!unlocked) return { id: module.id, title: module.title, state: "locked", percent: 0 };
      if (percent >= 100) return { id: module.id, title: module.title, state: "complete", percent };
      return { id: module.id, title: module.title, state: "in_progress", percent };
    });
}
