import {
  test,
  expect,
  setupSupabaseMocks,
  clearBrowserAuthState,
  loginAsTestUser,
  expectDashboardReady,
  E2E_TEST_USER,
} from "../playwright-fixture";

test.describe("Document library upload UX [T-13]", () => {
  test.beforeEach(async ({ page }) => {
    await setupSupabaseMocks(page);
    await clearBrowserAuthState(page);
  });

  test("library page shows accessible picker and rejects images clearly", async ({ page }) => {
    await loginAsTestUser(page);
    await expectDashboardReady(page);
    await page.goto("/app/library", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Document Library/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/PDF, DOCX, TXT, CSV, XLSX/i)).toBeVisible();
    await expect(page.getByText(/Choose file/i)).toBeVisible();

    await page.getByLabel(/I confirm I own this material/i).check();

    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
      if (!input) throw new Error("file input missing");
      const file = new File([new Uint8Array([137, 80, 78, 71])], "photo.png", {
        type: "image/png",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.getByText(/Unsupported file format/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("BUG 23 document parse + practice set", () => {
  test.setTimeout(120_000);

  test("gates practice set until parse completes, then generates from parsed content", async ({
    page,
  }) => {
    await setupSupabaseMocks(page);
    await loginAsTestUser(page);

    const completedDoc = {
      id: "lib-doc-completed-1",
      owner_id: E2E_TEST_USER.id,
      uploaded_by: E2E_TEST_USER.id,
      document_name: "resume.pdf",
      mime_type: "application/pdf",
      storage_path: `${E2E_TEST_USER.id}/library/hash-resume.pdf`,
      source: "personal",
      content_rights: "USER_OWNED",
      rights_confirmed: true,
      processing_status: "completed",
      processing_error: null,
      parsed_content: "Built APIs at Acme. Led a migration that cut latency 40%.",
      content_hash: "hashabc",
      parser_version: "v1",
      created_at: "2026-09-04T10:00:00.000Z",
    };

    const inflightDoc = {
      ...completedDoc,
      id: "lib-doc-inflight-1",
      document_name: "notes.pdf",
      processing_status: "extracting",
      parsed_content: null,
      content_hash: "hashdef",
    };

    const libraryDocs = [inflightDoc, completedDoc];
    const createJobCalls: string[] = [];

    await page.route("**/rest/v1/personal_library_documents**", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(libraryDocs),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    await page.route("**/rest/v1/document_processing_jobs**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "job-inflight-1",
            document_id: inflightDoc.id,
            owner_id: E2E_TEST_USER.id,
            status: "extracting",
            error_code: null,
            error_message: null,
            created_at: "2026-09-04T10:00:00.000Z",
          },
        ]),
      });
    });

    await page.route("**/rest/v1/document_practice_sets**", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([]),
        });
      }
      if (method === "POST") {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify([{ id: "ps-e2e-1", ...body }]),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });

    // Prefer the shared supabase.co mock for generate-questions / answer_bank.
    // Only override library document REST + job polling here.

    await page.route("**/functions/v1/get-document-processing-job**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          job: { id: "job-inflight-1", status: "extracting", error_code: null },
        }),
      });
    });

    await page.route("**/functions/v1/create-document-processing-job**", async (route) => {
      createJobCalls.push("create");
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, jobId: "job-inflight-1", state: "queued" }),
      });
    });

    await page.goto("/app/library", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Document Library/i })).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByText("notes.pdf")).toBeVisible();
    await expect(page.getByText("resume.pdf")).toBeVisible();
    await expect(page.getByTestId("job-progress-card")).toBeVisible();

    const practiceButtons = page.getByRole("button", { name: /Create practice set/i });
    await expect(practiceButtons).toHaveCount(2);
    await expect(practiceButtons.nth(0)).toBeDisabled();
    await expect(practiceButtons.nth(1)).toBeEnabled();

    const genWait = page.waitForRequest(
      (req) => req.url().includes("/functions/v1/generate-questions") && req.method() === "POST",
      { timeout: 15_000 },
    );
    const answersWait = page.waitForRequest(
      (req) => req.url().includes("/rest/v1/answer_bank") && req.method() === "POST",
      { timeout: 15_000 },
    );
    const practiceWait = page.waitForRequest(
      (req) => req.url().includes("/rest/v1/document_practice_sets") && req.method() === "POST",
      { timeout: 15_000 },
    );
    await practiceButtons.nth(1).click();
    await Promise.all([genWait, answersWait, practiceWait]);
    expect(createJobCalls.length).toBe(0);
  });

  test("soft client wait keeps processing without hard-fail retry toast", async ({ page }) => {
    await setupSupabaseMocks(page);
    await loginAsTestUser(page);

    const uploaded = {
      id: "lib-doc-new-1",
      owner_id: E2E_TEST_USER.id,
      uploaded_by: E2E_TEST_USER.id,
      document_name: "brief.pdf",
      mime_type: "application/pdf",
      storage_path: `${E2E_TEST_USER.id}/library/brief.pdf`,
      source: "personal",
      content_rights: "USER_OWNED",
      rights_confirmed: true,
      processing_status: "queued",
      processing_error: null,
      parsed_content: null,
      content_hash: "briefhash",
      created_at: new Date().toISOString(),
    };
    let docs: typeof uploaded[] = [];
    let parseDocumentHits = 0;

    await page.route("**/rest/v1/personal_library_documents**", async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(docs),
        });
      }
      if (method === "POST") {
        docs = [uploaded];
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify([uploaded]),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(docs),
      });
    });

    await page.route("**/functions/v1/create-document-processing-job**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, jobId: "job-soft-1", state: "queued" }),
      });
    });

    await page.route("**/functions/v1/get-document-processing-job**", async (route) => {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          job: { id: "job-soft-1", status: "extracting", error_code: null },
        }),
      });
    });

    await page.route("**/functions/v1/parse-document**", async (route) => {
      parseDocumentHits += 1;
      return route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "should not sync fallback", code: "UNEXPECTED" }),
      });
    });

    await page.goto("/app/library", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Document Library/i })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByLabel(/I confirm I own this material/i).check();

    await page.evaluate(() => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
      if (!input) throw new Error("file input missing");
      const file = new File([new Uint8Array([37, 80, 68, 70])], "brief.pdf", {
        type: "application/pdf",
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.getByText(/Uploaded, but processing needs a retry/i)).toHaveCount(0, {
      timeout: 8_000,
    });
    await expect(page.getByText(/Document uploaded/i)).toBeVisible({ timeout: 20_000 });
    expect(parseDocumentHits).toBe(0);
  });
});
