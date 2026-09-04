import { describe, expect, it } from "vitest";
import {
  extractJdFieldsFromText as edgeExtractJdFieldsFromText,
} from "../../../../supabase/functions/_shared/documentTextExtract.ts";

describe("edge extractJdFieldsFromText alignment", () => {
  it("matches client location and salary heuristics", () => {
    const body = `Job Title: AI Developer
Company: Google
Location: Hyderabad / Bangalore / Remote
Salary: $150,000 – $200,000
Required skills: Python, TensorFlow
Responsibilities
Build ML systems.`;
    const fields = edgeExtractJdFieldsFromText(body);
    expect(fields.location).toBe("Hyderabad / Bangalore / Remote");
    expect(fields.salary_range).toMatch(/150/);
    expect(fields.company).toMatch(/Google/);
  });
});
