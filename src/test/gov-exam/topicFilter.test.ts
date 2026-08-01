import { describe, expect, it } from "vitest";
import {
  filterQuestionsByTopics,
  flattenSyllabusTopicLabels,
  normalizeTopicList,
  questionMatchesTopics,
} from "@/lib/gov-exam/topicFilter";

describe("topicFilter", () => {
  it("normalizes topic tokens and lists", () => {
    expect(normalizeTopicList(["  Analogy ", "analogy", "coding_decoding", ""])).toEqual([
      "analogy",
      "coding decoding",
    ]);
  });

  it("matches subject OR topic columns", () => {
    expect(
      questionMatchesTopics({ subject: "Quant", topic: "Percentages" }, ["percentages"]),
    ).toBe(true);
    expect(
      questionMatchesTopics({ subject: "Reasoning", topic: "series" }, ["reasoning"]),
    ).toBe(true);
    expect(
      questionMatchesTopics({ subject: "English", topic: "RC" }, ["quant"]),
    ).toBe(false);
  });

  it("filters bank rows by requested topics", () => {
    const rows = [
      { id: "1", subject: "quant", topic: "algebra" },
      { id: "2", subject: "reasoning", topic: "syllogism" },
      { id: "3", subject: "awareness", topic: "polity" },
    ];
    expect(filterQuestionsByTopics(rows, ["algebra", "polity"]).map((r) => r.id)).toEqual([
      "1",
      "3",
    ]);
  });

  it("flattens syllabus topics_json sections", () => {
    const labels = flattenSyllabusTopicLabels([
      { section: "quant", topics: ["arithmetic", "algebra"] },
      { section: "reasoning", topics: ["syllogism"] },
    ]);
    expect(labels).toEqual(["arithmetic", "algebra", "syllogism"]);
  });
});
