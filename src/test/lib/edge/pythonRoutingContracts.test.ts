import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const sharedDir = path.join(root, "supabase/functions/_shared");
const pythonClient = fs.readFileSync(path.join(sharedDir, "pythonClient.ts"), "utf8");

/** Engine-backed ops must never map to /internal/operations scaffolds. */
const V1_PROCESS_OPS = [
  "practice_coach",
  "practice_coach_help",
  "live_answer",
  "speech_process",
  "sprint_review_transcript",
  "document_extract",
  "document_classify",
  "star_evidence",
  "system_design",
  "company_normalize",
  "mock_question_validate",
];

/** User-facing extraction must not stay on scaffold-only practice_coach_hint. */
const USER_FACING_COACH_GUARD = [
  "Never accept scaffold-only practice_coach_hint for user coach payloads",
  "isUserFacingCoachPayload",
  'dispatchV1ProcessOperation(\r\n      "practice_coach"',
];

describe("Python dual entry-point routing contracts", () => {
  it("V1_PROCESS_OPERATION keys are routed via /v1/process dispatch", () => {
    for (const op of V1_PROCESS_OPS) {
      expect(pythonClient).toContain(`${op}:`);
    }
    expect(pythonClient).toContain("callPythonProcess");
    expect(pythonClient).toContain('pythonFetch("/v1/process"');
  });

  it("document_extract maps to engine path, not internal scaffold alias only", () => {
    expect(pythonClient).toMatch(/document_extract:\s*"document_extract"/);
    expect(pythonClient).toContain("resolveV1ProcessOperation(rawOperation)");
    expect(pythonClient).toContain('pythonFetch("/internal/operations"');
  });

  it("user-facing coach payloads cannot remain on practice_coach_hint scaffold", () => {
    for (const fragment of USER_FACING_COACH_GUARD) {
      expect(pythonClient).toContain(fragment);
    }
  });

  it("internal operations map stays aligned with hybrid scaffold ids", () => {
    const scaffoldOps = [
      "star_format",
      "system_design_outline",
      "resume_structure",
      "mock_question_bank",
      "session_debrief",
      "session_scorecard",
    ];
    for (const op of scaffoldOps) {
      expect(pythonClient).toContain(op);
    }
  });

  it("unsupported V1 ops fail closed with 422", () => {
    expect(pythonClient).toContain("UNSUPPORTED_OPERATION");
    expect(pythonClient).toContain("is not routed to /v1/process");
  });
});

describe("Gov paper assembly provenance contracts", () => {
  it("Edge assembler writes assembly_source and generated_by in provenance_json", () => {
    const assembly = fs.readFileSync(path.join(sharedDir, "govPaperAssembly.ts"), "utf8");
    expect(assembly).toContain('assembly_source: "edge_assembler"');
    expect(assembly).toContain('generated_by: "edge_assembler"');
    expect(assembly).toContain("correlation_id: correlationId");
    expect(assembly).toContain("worker_id: workerId");
  });

  it("Official PYQ mode allows only official_verified sources", () => {
    const assembly = fs.readFileSync(path.join(sharedDir, "govPaperAssembly.ts"), "utf8");
    expect(assembly).toMatch(
      /OFFICIAL_MODE_ALLOWED = new Set<PaperSourceType>\(\["official_verified"\]\)/,
    );
  });
});

describe("Debrief eligibility fail-closed contracts", () => {
  it("classifyDebriefEligibility rejects incomplete sessions even when status is null", () => {
    const debriefEvidence = fs.readFileSync(
      path.join(sharedDir, "debriefEvidence.ts"),
      "utf8",
    );
    expect(debriefEvidence).not.toMatch(/input\.status != null && !complete/);
    expect(debriefEvidence).toContain("if (!complete)");
  });

  it("generate-debrief passes lifecycle fields into eligibility gate", () => {
    const debrief = fs.readFileSync(
      path.join(root, "supabase/functions/generate-debrief/index.ts"),
      "utf8",
    );
    expect(debrief).toContain("lifecycle_status: session.lifecycle_status");
    expect(debrief).toContain("terminal_reason: session.terminal_reason");
    expect(debrief).toContain("ended_at: session.ended_at");
    expect(debrief).toContain("scorableAnswerCount");
  });
});
