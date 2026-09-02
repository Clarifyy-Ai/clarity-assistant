import { describe, expect, it } from "vitest";

type AnswerRow = {
  id: string;
  question_text: string | null;
  answer_text: string | null;
  category: string | null;
  tags: string[] | null;
  is_favourite: boolean;
  folder_id: string | null;
};

function filterAnswers(
  answers: AnswerRow[],
  opts: {
    search: string;
    category: string;
    folderFilter: "all" | "favorites" | string;
  },
): AnswerRow[] {
  const q = opts.search.trim().toLowerCase();
  return answers.filter((a) => {
    if (opts.category !== "All" && (a.category ?? "") !== opts.category) return false;
    if (opts.folderFilter === "favorites" && !a.is_favourite) return false;
    if (
      opts.folderFilter !== "all" &&
      opts.folderFilter !== "favorites" &&
      a.folder_id !== opts.folderFilter
    ) {
      return false;
    }
    if (!q) return true;
    const tags = Array.isArray(a.tags) ? a.tags : [];
    return (
      (a.question_text ?? "").toLowerCase().includes(q) ||
      (a.answer_text ?? "").toLowerCase().includes(q) ||
      tags.some((t) => t.toLowerCase().includes(q))
    );
  });
}

describe("answer bank folder filter", () => {
  const rows: AnswerRow[] = [
    {
      id: "1",
      question_text: "Tell me about leadership",
      answer_text: "I led a team",
      category: "Leadership",
      tags: ["star"],
      is_favourite: true,
      folder_id: "folder-a",
    },
    {
      id: "2",
      question_text: "System design URL shortener",
      answer_text: "We used caching",
      category: "System Design",
      tags: ["architecture", "scale"],
      is_favourite: false,
      folder_id: null,
    },
  ];

  it("filters favorites only", () => {
    expect(filterAnswers(rows, { search: "", category: "All", folderFilter: "favorites" })).toHaveLength(1);
    expect(filterAnswers(rows, { search: "", category: "All", folderFilter: "favorites" })[0]?.id).toBe("1");
  });

  it("filters by folder id", () => {
    expect(filterAnswers(rows, { search: "", category: "All", folderFilter: "folder-a" })).toHaveLength(1);
  });

  it("searches tags", () => {
    expect(
      filterAnswers(rows, { search: "architecture", category: "All", folderFilter: "all" }),
    ).toHaveLength(1);
    expect(
      filterAnswers(rows, { search: "architecture", category: "All", folderFilter: "all" })[0]?.id,
    ).toBe("2");
  });
});
