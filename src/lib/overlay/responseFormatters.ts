/**
 * Lightweight coaching structure helpers — frameworks only, never fabricated stories.
 */

export type ResponseStructureMode =
  | "concise"
  | "balanced"
  | "detailed"
  | "star"
  | "technical"
  | "coding"
  | "follow_up";

export function formatStarFramework(question: string): string {
  return [
    `**STAR framework** for: ${question}`,
    "",
    "1. **Situation** — Set the scene with a real example from your experience.",
    "2. **Task** — What was your responsibility or goal?",
    "3. **Action** — What did you specifically do? Prefer “I” over “we”.",
    "4. **Result** — Outcome with a real metric if you have one (do not invent numbers).",
    "5. **Reflection** — What you learned or would do next time.",
    "",
    "_Use only verified personal evidence. If you lack an example, say so and outline how you would approach it._",
  ].join("\n");
}

export function formatTechnicalFramework(question: string): string {
  return [
    `**Technical structure** for: ${question}`,
    "",
    "1. **Definition** — Clarify the concept in one sentence.",
    "2. **Core reasoning** — How it works / why it matters.",
    "3. **Trade-offs** — Pros, cons, when to choose alternatives.",
    "4. **Practical example** — From your real work or a generic industry pattern (label clearly).",
    "5. **Risks** — Failure modes or pitfalls.",
    "6. **Follow-up areas** — What the interviewer may ask next.",
  ].join("\n");
}

export function formatCodingFramework(question: string): string {
  return [
    `**Coding approach** for: ${question}`,
    "",
    "1. **Restate** — Confirm inputs, outputs, and constraints.",
    "2. **Clarifying questions** — Edge cases, scale, mutability.",
    "3. **Approach** — Brute force → optimize; name the data structures.",
    "4. **Pseudocode** — Steps before typing code.",
    "5. **Complexity** — Time / space big-O.",
    "6. **Edge cases & tests** — Empty, duplicates, overflow, concurrency if relevant.",
  ].join("\n");
}

export function formatConciseFramework(question: string): string {
  return [
    `**Concise answer** for: ${question}`,
    "",
    "1. Direct opening (one sentence).",
    "2. Three key points.",
    "3. One real evidence reminder (no invented stories).",
    "4. Short closing.",
    "5. Likely follow-up to prepare for.",
  ].join("\n");
}

export function formatFollowUpFramework(question: string): string {
  return [
    `**Follow-up handling** for: ${question}`,
    "",
    "- Link to your previous answer briefly.",
    "- Add only the clarification requested.",
    "- Offer one concrete example or trade-off if asked “why”.",
    "- Stop; do not restart the full answer.",
  ].join("\n");
}

export function structureForMode(
  mode: ResponseStructureMode,
  question: string,
): string {
  const q = question.trim() || "the current question";
  switch (mode) {
    case "star":
      return formatStarFramework(q);
    case "technical":
      return formatTechnicalFramework(q);
    case "coding":
      return formatCodingFramework(q);
    case "follow_up":
      return formatFollowUpFramework(q);
    case "concise":
      return formatConciseFramework(q);
    case "detailed":
      return `${formatConciseFramework(q)}\n\n_Expand each point with specifics from your verified resume context._`;
    case "balanced":
    default:
      return formatConciseFramework(q);
  }
}
