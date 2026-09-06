import { describe, expect, it } from "vitest";
import { extractJdFieldsFromText } from "../../../../supabase/functions/_shared/jdFieldExtract.ts";

describe("edge extractJdFieldsFromText alignment", () => {
  it("matches client location and salary heuristics", () => {
    const body = `Job Title: AI Developer
Company: Google
Location: Hyderabad / Bangalore / Remote
Salary: $150,000 – $200,000
Required skills: Python, TensorFlow
Responsibilities
Build ML systems.`;
    const fields = extractJdFieldsFromText(body);
    expect(fields.location).toBe("Hyderabad / Bangalore / Remote");
    expect(fields.salary_range).toMatch(/150/);
    expect(fields.company).toMatch(/Google/);
  });

  it("reads Job Location and Pay Range labels common in PDF exports", () => {
    const body =
      "Job Title AI engineer Company microsoft Job Location Redmond, WA (USA) Pay Range $120,000 - $160,000 Required skills Python Azure";
    const fields = extractJdFieldsFromText(body);
    expect(fields.location).toMatch(/Redmond/i);
    expect(fields.salary_range).toMatch(/120/);
  });

  it("reads compensation without strict newline boundaries", () => {
    const fields = extractJdFieldsFromText(
      "Role: Engineer Company: Acme Compensation Range ₹25–40 LPA Required skills: Go",
    );
    expect(fields.salary_range).toMatch(/25/);
  });
});
