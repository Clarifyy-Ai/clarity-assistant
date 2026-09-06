import { describe, expect, it } from "vitest";
import { rowToSavedProject } from "@/lib/prep/prepProjectsRepository";

describe("rowToSavedProject", () => {
  it("normalizes database rows for the Project Builder UI", () => {
    const project = rowToSavedProject({
      id: "p1",
      user_id: "u1",
      project_name: "Analytics Dashboard",
      role: "Backend Engineer",
      tech_stack: ["Node.js", "Redis"],
      description: "Built streaming pipeline",
      impact: "Cut latency 40%",
      github_url: "https://github.com/example/app",
      showcase: "Overview text",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });

    expect(project.projectName).toBe("Analytics Dashboard");
    expect(project.techStack).toEqual(["Node.js", "Redis"]);
    expect(project.githubUrl).toBe("https://github.com/example/app");
  });

  it("treats non-array tech_stack as empty", () => {
    const project = rowToSavedProject({
      id: "p2",
      user_id: "u1",
      project_name: "App",
      role: "Engineer",
      tech_stack: null as unknown as string[],
      description: "",
      impact: "",
      github_url: "",
      showcase: "",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    });

    expect(project.techStack).toEqual([]);
  });
});
