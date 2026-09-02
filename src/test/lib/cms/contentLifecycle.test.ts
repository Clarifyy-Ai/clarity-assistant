import { describe, expect, it } from "vitest";
import { formatAdminActionError } from "@/lib/admin/adminErrors";
import { isValidHelpSlug, slugifyHelpQuestion } from "@/lib/admin/helpArticleSlug";
import { validateCourseForPublish } from "@/lib/learning/publishValidation";

describe("help article slug helpers", () => {
  it("slugifies questions for new articles", () => {
    expect(slugifyHelpQuestion("How do credits work?")).toBe("how-do-credits-work");
    expect(isValidHelpSlug("how-do-credits-work")).toBe(true);
    expect(isValidHelpSlug("Bad Slug")).toBe(false);
  });
});

describe("learning publish validation", () => {
  const modules = [{ id: "m1", title: "Intro" }];

  it("blocks publish without modules or lessons", () => {
    expect(validateCourseForPublish([], [])).toMatch(/module/i);
    expect(validateCourseForPublish(modules, [])).toMatch(/lesson/i);
  });

  it("blocks text lessons without content", () => {
    expect(
      validateCourseForPublish(modules, [
        {
          module_id: "m1",
          title: "Welcome",
          lesson_type: "text",
          content_text: "",
          resource_url: null,
        },
      ]),
    ).toMatch(/text content/i);
  });

  it("allows publish when lessons are complete", () => {
    expect(
      validateCourseForPublish(modules, [
        {
          module_id: "m1",
          title: "Welcome",
          lesson_type: "text",
          content_text: "Hello learners",
          resource_url: null,
        },
      ]),
    ).toBeNull();
  });
});

describe("admin action error formatting", () => {
  it("surfaces learning publish trigger messages", () => {
    const msg = formatAdminActionError(
      new Error("Course must contain valid modules and lessons before publishing"),
    );
    expect(msg).toMatch(/cannot publish/i);
    expect(msg).not.toMatch(/unable to complete/i);
  });

  it("surfaces duplicate slug errors", () => {
    const msg = formatAdminActionError(
      new Error('duplicate key value violates unique constraint "help_articles_slug_key"'),
    );
    expect(msg).toMatch(/slug/i);
  });

  it("admin help and learning pages invalidate public caches after publish", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
    const help = readFileSync(resolve(root, "src/pages/app/admin/AdminHelpArticles.tsx"), "utf8");
    const learning = readFileSync(resolve(root, "src/pages/app/admin/AdminLearning.tsx"), "utf8");
    expect(help).toContain("invalidatePublicContentCache");
    expect(learning).toContain("invalidatePublicContentCache");
    expect(help).toContain('data-testid="help-new-article"');
    expect(help).toContain('label="Title"');
  });
});
