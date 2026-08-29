import { describe, expect, it } from "vitest";
import {
  classifySource,
  isOfficialExamUrlAllowed,
  isOfficialDocumentUrlAllowed,
  isRestrictedCoachingDomain,
  assertOfficialExamUrl,
  SOURCE_CLASSIFICATIONS,
  RESTRICTED_COACHING_DOMAINS,
} from "@/lib/gov-exam/officialDomainAllowlist";
import {
  addDomainAllowlistEntry,
  classifySourceDoc,
  fetchActiveAllowedDomains,
  linkQuestionProvenance,
  recordCollectionAttempt,
  registerGovSource,
  type RegisterSourceInput,
} from "@/lib/gov-exam/sourceRegistry";

describe("Government Exam Source Registry & Classification", () => {
  it("1. Classifies every source type accurately across the 5 canonical classes", () => {
    expect(SOURCE_CLASSIFICATIONS).toEqual([
      "official",
      "licensed",
      "authorized_upload",
      "user_private",
      "unsupported",
    ]);

    // Official
    const official = classifySource({ url: "https://upsc.gov.in/examinations/cse-prelims-2024.pdf" });
    expect(official.classification).toBe("official");
    expect(official.approvedDomain).toBe("upsc.gov.in");
    expect(official.allowedForAutomatedIngest).toBe(true);

    // Licensed
    const licensed = classifySource({ uploadType: "licensed" });
    expect(licensed.classification).toBe("licensed");
    expect(licensed.allowedForAutomatedIngest).toBe(true);

    // Authorized upload (Admin)
    const adminUpload = classifySource({ uploadType: "admin" });
    expect(adminUpload.classification).toBe("authorized_upload");
    expect(adminUpload.allowedForAutomatedIngest).toBe(true);

    // User-private
    const userPrivate = classifySource({ uploadType: "user" });
    expect(userPrivate.classification).toBe("user_private");
    expect(userPrivate.allowedForAutomatedIngest).toBe(false);

    // Unsupported
    const unsupported = classifySource({ url: "https://unknown-portal.org/paper.pdf" });
    expect(unsupported.classification).toBe("unsupported");
    expect(unsupported.allowedForAutomatedIngest).toBe(false);
  });

  it("2. Rejects unknown domains from automated ingestion", () => {
    const unknown = classifySource({ url: "https://random-mock-site.net/ssc-paper.pdf" });
    expect(unknown.classification).toBe("unsupported");
    expect(unknown.allowedForAutomatedIngest).toBe(false);
    expect(isOfficialExamUrlAllowed("https://random-mock-site.net/ssc-paper.pdf")).toBe(false);

    const assertRes = assertOfficialExamUrl("https://random-mock-site.net/ssc-paper.pdf");
    expect(assertRes.ok).toBe(false);
    if (!assertRes.ok) {
      expect(assertRes.code).toBe("FORBIDDEN_HOST");
    }
  });

  it("3. Strictly rejects unauthorized coaching portals and aggregators", () => {
    expect(RESTRICTED_COACHING_DOMAINS).toContain("testbook.com");
    expect(RESTRICTED_COACHING_DOMAINS).toContain("byjus.com");
    expect(RESTRICTED_COACHING_DOMAINS).toContain("unacademy.com");
    expect(RESTRICTED_COACHING_DOMAINS).toContain("gradeup.co");
    expect(RESTRICTED_COACHING_DOMAINS).toContain("adda247.com");

    const coachingUrls = [
      "https://testbook.com/pyq/ssc-cgl.pdf",
      "https://byjus.com/upsc/prelims-paper-1.pdf",
      "https://unacademy.com/exam/ibps-po.pdf",
      "https://adda247.com/defence/nda-maths.pdf",
    ];

    for (const url of coachingUrls) {
      expect(isOfficialExamUrlAllowed(url)).toBe(false);
      expect(isOfficialDocumentUrlAllowed(url)).toBe(false);

      const classified = classifySource({ url });
      expect(classified.classification).toBe("unsupported");
      expect(classified.allowedForAutomatedIngest).toBe(false);
      expect(classified.reason).toContain("unauthorized coaching portal");

      const check = assertOfficialExamUrl(url);
      expect(check.ok).toBe(false);
      if (!check.ok) {
        expect(check.code).toBe("RESTRICTED_COACHING_PORTAL");
      }
    }
  });

  it("4. Supports Admin-managed dynamic domain allowlists", () => {
    const customAllowlist = ["bpsc.bih.nic.in", "mppsc.mp.gov.in"];

    // Without custom allowlist, state PSC is not in default central allowlist
    expect(isOfficialExamUrlAllowed("https://bpsc.bih.nic.in/notices.htm")).toBe(false);

    // With dynamic allowlist provided, it matches cleanly
    expect(isOfficialExamUrlAllowed("https://bpsc.bih.nic.in/notices.htm", customAllowlist)).toBe(true);
    expect(isOfficialExamUrlAllowed("https://mppsc.mp.gov.in/exam", customAllowlist)).toBe(true);

    const classified = classifySource({
      url: "https://bpsc.bih.nic.in/2024/paper.pdf",
      dynamicAllowlist: customAllowlist,
    });
    expect(classified.classification).toBe("official");
    expect(classified.approvedDomain).toBe("bpsc.bih.nic.in");
    expect(classified.allowedForAutomatedIngest).toBe(true);
  });

  it("5. Registers source metadata with complete registry attributes", async () => {
    const insertedSources: any[] = [];
    const mockSupabase = {
      from: (table: string) => ({
        select: (cols?: string) => ({
          eq: (field: string, val: any) => Promise.resolve({ data: [], error: null }),
        }),
        insert: (row: any) => {
          insertedSources.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "source-123", ...row }, error: null }),
            }),
          };
        },
      }),
    } as any;

    const input: RegisterSourceInput = {
      recruitingBodyId: "rec-body-1",
      examId: "exam-cgl-1",
      cycleId: "cycle-2024",
      stageId: "stage-tier-1",
      paperName: "General Awareness & Quantitative Aptitude",
      shift: "Shift 1 (Morning)",
      documentType: "previous_paper",
      title: "SSC CGL 2024 Tier I Official Question Paper",
      sourceUrl: "https://ssc.gov.in/files/cgl2024_tier1_shift1.pdf",
      publicationDate: "2024-09-15",
      effectiveDate: "2024-09-15",
      language: "en",
      mimeType: "application/pdf",
      fileHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      parserVersion: "2026.08.21.1",
    };

    const result = await registerGovSource(mockSupabase, input);
    expect(result.error).toBeNull();
    expect(result.source).not.toBeNull();
    expect(result.source?.id).toBe("source-123");
    expect(result.source?.approved_domain).toBe("ssc.gov.in");
    expect(result.source?.classification).toBe("official");
    expect(result.source?.source_state).toBe("discovered");
    expect(result.source?.shift).toBe("Shift 1 (Morning)");
    expect(result.source?.paper_name).toBe("General Awareness & Quantitative Aptitude");
  });

  it("6. Records collection attempts and audit failure count", async () => {
    let updatedPayload: any = null;
    const mockSupabase = {
      from: (table: string) => ({
        select: (cols?: string) => ({
          eq: (field: string, val: any) => ({
            maybeSingle: () => Promise.resolve({ data: { failure_count: 2 }, error: null }),
          }),
        }),
        update: (patch: any) => ({
          eq: (field: string, val: any) => {
            updatedPayload = patch;
            return Promise.resolve({ error: null });
          },
        }),
      }),
    } as any;

    // Failure attempt
    const failRes = await recordCollectionAttempt(mockSupabase, "source-123", false, "HTTP_404_NOT_FOUND");
    expect(failRes.success).toBe(true);
    expect(updatedPayload.failure_count).toBe(3);
    expect(updatedPayload.last_error_code).toBe("HTTP_404_NOT_FOUND");
    expect(updatedPayload.last_collection_attempt_at).toBeDefined();

    // Success attempt
    const successRes = await recordCollectionAttempt(mockSupabase, "source-123", true);
    expect(successRes.success).toBe(true);
    expect(updatedPayload.source_state).toBe("ingested");
    expect(updatedPayload.last_successful_collection_at).toBeDefined();
    expect(updatedPayload.last_error_code).toBeNull();
  });

  it("7. Preserves question provenance from discovery to publication", async () => {
    let insertedProvenance: any = null;
    const mockSupabase = {
      from: (table: string) => ({
        insert: (row: any) => {
          insertedProvenance = row;
          return Promise.resolve({ error: null });
        },
      }),
    } as any;

    const res = await linkQuestionProvenance(mockSupabase, {
      questionId: "q-101",
      sourceId: "source-123",
      sourceClass: "previous_year",
      licenseClass: "official_public",
      pageRef: "Page 4, Q.12",
      metadata: { cycle: "2024", shift: "Shift 1" },
    });

    expect(res.success).toBe(true);
    expect(insertedProvenance.question_id).toBe("q-101");
    expect(insertedProvenance.source_id).toBe("source-123");
    expect(insertedProvenance.source_class).toBe("previous_year");
    expect(insertedProvenance.license_class).toBe("official_public");
    expect(insertedProvenance.page_ref).toBe("Page 4, Q.12");
  });

  it("8. Prevents adding unauthorized coaching domains to allowlist", async () => {
    const mockSupabase = {} as any;
    const res = await addDomainAllowlistEntry(mockSupabase, {
      domain: "https://testbook.com/extra",
      displayName: "Unauthorized Testbook",
    });
    expect(res.data).toBeNull();
    expect(res.error).not.toBeNull();
    expect(res.error?.message).toContain("Cannot add unauthorized coaching domain");
  });
});
