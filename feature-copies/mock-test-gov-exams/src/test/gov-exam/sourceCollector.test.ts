import { describe, expect, it, vi } from "vitest";
import {
  CircuitBreaker,
  collectSourceDocument,
  discoverSemanticLinks,
  validateMagicBytes,
} from "@/lib/gov-exam/sourceCollector";
import {
  EMPTY_OR_UNEXPECTED_HTML_SAMPLE,
  NTA_EXAM_DOWNLOADS_HTML_SAMPLE,
  SSC_CGL_PAPERS_HTML_SAMPLE,
  UPSC_PREVIOUS_PAPERS_HTML_SAMPLE,
} from "@/lib/gov-exam/fixtures/authorizedSamples";

describe("Government Exam Source Collection and Ingestion Pipeline", () => {
  // 1. Approved Source
  it("1. Successfully collects an approved official source with full retrieval evidence", async () => {
    const validPdfBytes = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, // %PDF-1.4
      0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
    ]);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://upsc.gov.in/files/CSP_2024_GS_P1.pdf",
      headers: new Headers({
        "content-type": "application/pdf",
        "content-length": String(validPdfBytes.length),
        etag: '"upsc-2024-etag-1"',
        "last-modified": "Sun, 15 Sep 2024 10:00:00 GMT",
      }),
      arrayBuffer: () => Promise.resolve(validPdfBytes.buffer),
    });

    const result = await collectSourceDocument(
      "https://upsc.gov.in/files/CSP_2024_GS_P1.pdf",
      { fetchImpl: mockFetch },
    );

    expect(result.ok).toBe(true);
    expect(result.classification).toBe("official");
    expect(result.approvedDomain).toBe("upsc.gov.in");
    expect(result.evidence).toBeDefined();
    expect(result.evidence?.statusCode).toBe(200);
    expect(result.evidence?.etag).toBe('"upsc-2024-etag-1"');
    expect(result.evidence?.fileHash).toBeDefined();
    expect(result.evidence?.userAgent).toContain("CareerPilot-GovExamBot");
  });

  // 2. Rejected Domain
  it("2. Rejects unknown domains and unauthorized coaching portals immediately", async () => {
    const unknownRes = await collectSourceDocument("https://unknown-exam-site.net/paper.pdf");
    expect(unknownRes.ok).toBe(false);
    expect(unknownRes.code).toBe("FORBIDDEN_HOST");

    const coachingRes = await collectSourceDocument("https://testbook.com/pyq/ssc-cgl.pdf");
    expect(coachingRes.ok).toBe(false);
    expect(coachingRes.code).toBe("RESTRICTED_COACHING_PORTAL");
  });

  // 3. Changed Source (ETag / Last-Modified / 304)
  it("3. Detects unchanged source via 304 Not Modified to avoid duplicate re-downloads", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 304,
      url: "https://ssc.gov.in/files/cgl2024.pdf",
      headers: new Headers({
        etag: '"etag-12345"',
        "last-modified": "Mon, 16 Sep 2024 12:00:00 GMT",
      }),
    });

    const result = await collectSourceDocument(
      "https://ssc.gov.in/files/cgl2024.pdf",
      {
        etag: '"etag-12345"',
        previousHash: "hash-abc-123",
        fetchImpl: mockFetch,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.isNotModified).toBe(true);
    expect(result.code).toBe("NOT_MODIFIED");
    expect(result.evidence?.statusCode).toBe(304);
  });

  // 4. Duplicate File (SHA-256 Match)
  it("4. Detects duplicate file when SHA-256 matches existing source record", async () => {
    const sampleBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]); // %PDF-1.7

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://nta.ac.in/Downloads/paper.pdf",
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: () => Promise.resolve(sampleBytes.buffer),
    });

    // Compute expected hash first
    const hashBuffer = await crypto.subtle.digest("SHA-256", sampleBytes);
    const expectedHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const result = await collectSourceDocument(
      "https://nta.ac.in/Downloads/paper.pdf",
      {
        previousHash: expectedHash,
        fetchImpl: mockFetch,
      },
    );

    expect(result.ok).toBe(true);
    expect(result.isDuplicate).toBe(true);
    expect(result.evidence?.fileHash).toBe(expectedHash);
  });

  // 5. Download Failure (HTTP 500 / 404)
  it("5. Handles download failure with structured failure code", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    const result = await collectSourceDocument(
      "https://ibps.in/crp/po-2024.pdf",
      {
        maxRetries: 2,
        fetchImpl: mockFetch,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe("FETCH_FAILED");
    expect(result.message).toContain("HTTP 500");
  });

  // 6. Timeout
  it("6. Handles download timeout with abort signal", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";

    const mockFetch = vi.fn().mockRejectedValue(abortErr);

    const result = await collectSourceDocument(
      "https://rrbcdg.gov.in/files/cbt1.pdf",
      {
        timeoutMs: 100,
        fetchImpl: mockFetch,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.code).toBe("DOWNLOAD_TIMEOUT");
    expect(result.message).toContain("timed out");
  });

  // 7. Redirect Validation
  it("7. Follows approved redirect and rejects redirect to unauthorized coaching portal", async () => {
    // Approved redirect (upsc.gov.in -> documents.upsc.gov.in)
    const validRedirectFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://documents.upsc.gov.in/files/prelims2024.pdf",
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: () =>
        Promise.resolve(
          new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer,
        ),
    });

    const approvedRedirect = await collectSourceDocument(
      "https://upsc.gov.in/redirect-me.pdf",
      { fetchImpl: validRedirectFetch },
    );
    expect(approvedRedirect.ok).toBe(true);
    expect(approvedRedirect.evidence?.finalUrl).toBe(
      "https://documents.upsc.gov.in/files/prelims2024.pdf",
    );

    // Forbidden redirect (ssc.gov.in -> unauthorized third-party coaching site)
    const badRedirectFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://testbook.com/leaked-paper.pdf",
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(10)),
    });

    const forbiddenRedirect = await collectSourceDocument(
      "https://ssc.gov.in/compromised-redirect.pdf",
      { fetchImpl: badRedirectFetch },
    );
    expect(forbiddenRedirect.ok).toBe(false);
    expect(forbiddenRedirect.code).toBe("REDIRECT_FORBIDDEN_HOST");
  });

  // 8. Malformed / Executable Content Rejection
  it("8. Rejects unexpected executable binaries (MZ / ELF / Shebang)", async () => {
    // MZ header
    const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    const exeCheck = validateMagicBytes(exeBytes);
    expect(exeCheck.ok).toBe(false);
    expect(exeCheck.isExecutable).toBe(true);
    expect(exeCheck.error).toContain("executable binary");

    // ELF header
    const elfBytes = new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
    const elfCheck = validateMagicBytes(elfBytes);
    expect(elfCheck.ok).toBe(false);
    expect(elfCheck.isExecutable).toBe(true);

    // Shell script
    const shBytes = new Uint8Array([0x23, 0x21, 0x2f, 0x62, 0x69, 0x6e]);
    const shCheck = validateMagicBytes(shBytes);
    expect(shCheck.ok).toBe(false);
    expect(shCheck.isExecutable).toBe(true);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      url: "https://ssc.gov.in/payload.exe",
      headers: new Headers({ "content-type": "application/pdf" }),
      arrayBuffer: () => Promise.resolve(exeBytes.buffer),
    });

    const result = await collectSourceDocument(
      "https://ssc.gov.in/payload.exe",
      { fetchImpl: mockFetch },
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("UNEXPECTED_EXECUTABLE_CONTENT");
  });

  // 9. Semantic Link Matching and Missing Expected Links
  it("9. Extracts semantic links across multiple selector strategies and detects missing links", () => {
    // Strategy 1: Table parsing (UPSC fixture)
    const upscResult = discoverSemanticLinks(
      UPSC_PREVIOUS_PAPERS_HTML_SAMPLE,
      "https://upsc.gov.in/examinations/previous-question-papers",
      { targetYear: 2024 },
    );
    expect(upscResult.missingExpectedLinks).toBe(false);
    expect(upscResult.discovered.length).toBeGreaterThanOrEqual(3);
    const paper1 = upscResult.discovered.find((d) =>
      d.title.includes("Paper - I"),
    );
    expect(paper1).toBeDefined();
    expect(paper1?.year).toBe(2024);
    expect(paper1?.documentType).toBe("previous_paper");

    // Strategy 2: Notice block / list parsing (SSC fixture)
    const sscResult = discoverSemanticLinks(
      SSC_CGL_PAPERS_HTML_SAMPLE,
      "https://ssc.gov.in",
      { targetYear: 2024 },
    );
    expect(sscResult.missingExpectedLinks).toBe(false);
    expect(sscResult.discovered.length).toBeGreaterThanOrEqual(1);
    expect(sscResult.discovered[0].stage).toContain("Tier-I");

    // Strategy 3: NTA download list
    const ntaResult = discoverSemanticLinks(
      NTA_EXAM_DOWNLOADS_HTML_SAMPLE,
      "https://nta.ac.in",
    );
    expect(ntaResult.missingExpectedLinks).toBe(false);
    expect(ntaResult.discovered.some((d) => d.documentType === "answer_key")).toBe(
      true,
    );

    // Missing expected links on empty fixture
    const emptyResult = discoverSemanticLinks(
      EMPTY_OR_UNEXPECTED_HTML_SAMPLE,
      "https://upsc.gov.in",
    );
    expect(emptyResult.missingExpectedLinks).toBe(true);
    expect(emptyResult.discovered.length).toBe(0);
    expect(emptyResult.reason).toContain("No allowlisted official examination links");
  });

  // 10. Bounded Retries
  it("10. Executes bounded retries with exponential backoff on transient failures", async () => {
    let callCount = 0;
    const transientFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.reject(new Error("Network connection reset"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        url: "https://upsc.gov.in/paper.pdf",
        headers: new Headers({ "content-type": "application/pdf" }),
        arrayBuffer: () =>
          Promise.resolve(
            new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer,
          ),
      });
    });

    const result = await collectSourceDocument(
      "https://upsc.gov.in/paper.pdf",
      {
        maxRetries: 3,
        fetchImpl: transientFetch,
      },
    );

    expect(result.ok).toBe(true);
    expect(callCount).toBe(3);
  });

  // 11. Circuit Breaker
  it("11. Trips circuit breaker to OPEN after consecutive failures and fast-fails subsequent requests", async () => {
    const customBreaker = new CircuitBreaker(3, 60000); // 3 failures, 60s cooldown
    const failingFetch = vi.fn().mockRejectedValue(new Error("Host down"));

    // Attempt 1, 2, 3 failures
    await collectSourceDocument("https://ibps.in/file1.pdf", {
      maxRetries: 1,
      circuitBreaker: customBreaker,
      fetchImpl: failingFetch,
    });
    await collectSourceDocument("https://ibps.in/file2.pdf", {
      maxRetries: 1,
      circuitBreaker: customBreaker,
      fetchImpl: failingFetch,
    });
    await collectSourceDocument("https://ibps.in/file3.pdf", {
      maxRetries: 1,
      circuitBreaker: customBreaker,
      fetchImpl: failingFetch,
    });

    expect(customBreaker.getDomainState("ibps.in")).toBe("OPEN");

    // Attempt 4 should immediately fast-fail with CIRCUIT_BREAKER_OPEN without invoking fetch
    const fastFailResult = await collectSourceDocument(
      "https://ibps.in/file4.pdf",
      {
        circuitBreaker: customBreaker,
        fetchImpl: failingFetch,
      },
    );

    expect(fastFailResult.ok).toBe(false);
    expect(fastFailResult.code).toBe("CIRCUIT_BREAKER_OPEN");
    expect(fastFailResult.message).toContain("Circuit breaker is OPEN");
  });
});
