/**
 * Lightweight prep_projects access — avoids importing the full database.ts graph
 * into lazy-loaded Prep Lab pages.
 */
import { supabase } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase";
import type { SavedProject } from "@/lib/prep/projectBuilderStorage";

export type PrepProjectRow = Tables<"prep_projects">;

export function rowToSavedProject(row: PrepProjectRow): SavedProject {
  const stack = row.tech_stack;
  return {
    id: row.id,
    projectName: row.project_name ?? "",
    role: row.role ?? "",
    techStack: Array.isArray(stack) ? (stack as string[]) : [],
    description: row.description ?? "",
    impact: row.impact ?? "",
    githubUrl: row.github_url ?? "",
    showcase: row.showcase ?? "",
    updatedAt: row.updated_at ?? new Date().toISOString(),
  };
}

function isMissingTableError(message: string): boolean {
  return /prep_projects|schema cache|relation.*does not exist|PGRST205/i.test(message);
}

export async function listPrepProjects(userId: string): Promise<SavedProject[]> {
  const { data, error } = await supabase
    .from("prep_projects")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingTableError(error.message)) return [];
    throw error;
  }

  return (data ?? []).map(rowToSavedProject);
}

export async function upsertPrepProject(
  userId: string,
  project: Omit<SavedProject, "id" | "updatedAt"> & { id?: string },
): Promise<SavedProject> {
  const now = new Date().toISOString();
  const payload = {
    id: project.id,
    user_id: userId,
    project_name: project.projectName,
    role: project.role,
    tech_stack: project.techStack,
    description: project.description,
    impact: project.impact,
    github_url: project.githubUrl,
    showcase: project.showcase,
    updated_at: now,
  } satisfies TablesInsert<"prep_projects">;

  const { data, error } = await supabase
    .from("prep_projects")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) throw error;
  return rowToSavedProject(data);
}

export async function deletePrepProject(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("prep_projects")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
}
