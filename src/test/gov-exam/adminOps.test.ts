import { describe, expect, it } from "vitest";
import {
  buildVerificationRunway,
  canSetPaperReviewState,
  canSetRegistryReviewState,
  canSetSourceReviewState,
  deriveQuestionQueueStatus,
  govLicenseTypeFromMetadata,
  mapExtractQuestionPaperInvokeError,
  questionPatchForStatus,
  questionPatchForVerifyAction,
  summarizeBlueprint,
  verificationRunwayNeeded,
} from "@/lib/gov-exam/adminOps";

describe("gov exam adminOps helpers", () => {
  it("maps FunctionsFetchError / Failed to send to actionable extract copy", () => {
    expect(
      mapExtractQuestionPaperInvokeError({
        name: "FunctionsFetchError",
        message: "Failed to send a request to the Edge Function",
      }),
    ).toMatch(/Couldn't reach the extract service/i);
    expect(
      mapExtractQuestionPaperInvokeError(
        new Error("Failed to send a request to the Edge Function"),
      ),
    ).toMatch(/Edge Function may be unreachable/i);
    expect(mapExtractQuestionPaperInvokeError(new Error("PARSER_FAILED"))).toBe(
      "PARSER_FAILED",
    );
  });

  it("validates review state enums", () => {
    expect(canSetSourceReviewState("approved")).toBe(true);
    expect(canSetSourceReviewState("bogus")).toBe(false);
    expect(canSetRegistryReviewState("retired")).toBe(true);
    expect(canSetRegistryReviewState("rejected")).toBe(false);
    expect(canSetPaperReviewState("machine_validated")).toBe(true);
    expect(canSetPaperReviewState("draft")).toBe(true);
  });

  it("derives question queue status from is_verified / is_public", () => {
    expect(deriveQuestionQueueStatus({ is_verified: false, is_public: true })).toBe("pending");
    expect(deriveQuestionQueueStatus({ is_verified: true, is_public: true })).toBe("approved");
    expect(deriveQuestionQueueStatus({ is_verified: false, is_public: false })).toBe("rejected");
    expect(deriveQuestionQueueStatus({ is_verified: true, is_public: false })).toBe("retired");
  });

  it("maps gov license_class metadata to publishable license_type", () => {
    expect(govLicenseTypeFromMetadata({ license_class: "official_public" })).toBe("PUBLIC_DOMAIN");
    expect(govLicenseTypeFromMetadata({ license_class: "licensed" })).toBe("LICENSED");
    expect(govLicenseTypeFromMetadata({ provenance: "pdf_extract" })).toBe("PUBLIC_DOMAIN");
    expect(govLicenseTypeFromMetadata(null, "ORIGINAL")).toBe("ORIGINAL");
  });

  it("maps review actions to question patches", () => {
    expect(questionPatchForStatus("approved", { needs_review: true })).toEqual({
      publish_status: "published",
      is_public: true,
      review_status: "approved",
      is_verified: true,
      validation_status: "valid",
      license_type: "PUBLIC_DOMAIN",
      approval_mode: "MANUAL",
      metadata: { needs_review: false },
    });
    expect(questionPatchForStatus("rejected")).toEqual({
      is_verified: false,
      is_public: false,
      publish_status: "draft",
      review_status: "rejected",
      metadata: { needs_review: false },
    });
    expect(questionPatchForStatus("retired")).toEqual({
      is_verified: true,
      is_public: false,
      publish_status: "draft",
      metadata: { needs_review: false },
    });
  });

  it("treats OCR needs_review as pending even when is_public=false", () => {
    expect(
      deriveQuestionQueueStatus({
        is_verified: false,
        is_public: false,
        metadata: { needs_review: true },
      }),
    ).toBe("pending");
  });

  it("summarizes blueprint json for ops tables", () => {
    expect(summarizeBlueprint(null)).toBe("—");
    expect(
      summarizeBlueprint({
        totalQuestions: 100,
        mode: "generated_mock",
        sections: [{ question_count: 25 }, { question_count: 25 }],
      }),
    ).toBe("100 Q · 2 sections · generated_mock");
    expect(summarizeBlueprint({ sections: [] })).toBe("blueprint present");
  });

  it("computes verification runway needed without inventing questions", () => {
    expect(verificationRunwayNeeded(20, 100)).toBe(80);
    expect(verificationRunwayNeeded(100, 100)).toBe(0);
    expect(verificationRunwayNeeded(120, 100)).toBe(0);
    expect(verificationRunwayNeeded(0, 150)).toBe(150);
  });

  it("maps verify / unpublish patches (explicit admin actions only)", () => {
    expect(questionPatchForVerifyAction("verify", { metadata: { needs_review: true } })).toEqual({
      publish_status: "published",
      is_public: true,
      review_status: "approved",
      is_verified: true,
      validation_status: "valid",
      license_type: "PUBLIC_DOMAIN",
      approval_mode: "MANUAL",
      metadata: { needs_review: false },
    });
    expect(
      questionPatchForVerifyAction("unpublish", {
        is_verified: false,
        is_public: true,
        metadata: { source: "pyq" },
      }),
    ).toEqual({
      is_public: false,
      publish_status: "draft",
      metadata: { source: "pyq", unpublished_via: "admin_verify_queue" },
    });
  });

  it("builds runway rows from readiness + unverified counts", () => {
    const rows = buildVerificationRunway(
      [
        {
          exam_id: "1",
          exam_code: "SSC_CGL",
          exam_name: "SSC CGL",
          family: "ssc",
          legacy_exam_type: "SSC_CGL",
          stage_id: null,
          stage_code: null,
          pattern_version_id: null,
          pattern_version: null,
          required_questions: 100,
          approved_public_count: 20,
          public_count: 111,
          status: "partial",
          full_simulation_available: false,
        },
      ],
      { SSC_CGL: 91 },
    );
    expect(rows[0].verifies_needed).toBe(80);
    expect(rows[0].unverified_public_count).toBe(91);
  });
});
