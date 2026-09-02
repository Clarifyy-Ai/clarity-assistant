export interface SavedProject {
  id: string;
  projectName: string;
  role: string;
  techStack: string[];
  description: string;
  impact: string;
  githubUrl: string;
  showcase: string;
  updatedAt: string;
}

const STORAGE_PREFIX = "clarify_prep_projects";

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readAll(userId: string): SavedProject[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(userId: string, projects: SavedProject[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(projects));
  } catch {
    // Ignore quota errors — caller may surface toast.
  }
}

export function listSavedProjects(userId: string): SavedProject[] {
  return readAll(userId).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getSavedProject(userId: string, id: string): SavedProject | null {
  return readAll(userId).find((p) => p.id === id) ?? null;
}

export function saveProject(
  userId: string,
  project: Omit<SavedProject, "id" | "updatedAt"> & { id?: string }
): SavedProject {
  const all = readAll(userId);
  const now = new Date().toISOString();
  const entry: SavedProject = {
    id: project.id ?? crypto.randomUUID(),
    projectName: project.projectName,
    role: project.role,
    techStack: project.techStack,
    description: project.description,
    impact: project.impact,
    githubUrl: project.githubUrl,
    showcase: project.showcase,
    updatedAt: now,
  };

  const idx = all.findIndex((p) => p.id === entry.id);
  if (idx >= 0) {
    all[idx] = entry;
  } else {
    all.unshift(entry);
  }

  writeAll(userId, all);
  return entry;
}

export function deleteSavedProject(userId: string, id: string): void {
  writeAll(
    userId,
    readAll(userId).filter((p) => p.id !== id)
  );
}

/** One-time migration helper — clears localStorage after DB import. */
export function clearSavedProjects(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}
