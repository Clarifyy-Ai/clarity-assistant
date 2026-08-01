#!/usr/bin/env node
/**
 * Static smoke: gov exam routes + State PSC pilot seed file present.
 * No network / no token required.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const app = fs.readFileSync(path.join(root, "src", "App.tsx"), "utf8");
const migration = path.join(
  root,
  "supabase",
  "migrations",
  "20260802130000_gov_exam_state_psc_pilot.sql",
);
const disclaimers = fs.readFileSync(
  path.join(root, "src", "lib", "gov-exam", "disclaimers.ts"),
  "utf8",
);

const extractFn = path.join(
  root,
  "supabase",
  "functions",
  "extract-question-paper",
  "index.ts",
);
const ocrMigration = path.join(
  root,
  "supabase",
  "migrations",
  "20260802150000_extract_question_paper_ocr.sql",
);
const layout = fs.readFileSync(
  path.join(root, "src", "pages", "app", "admin", "AdminLayout.tsx"),
  "utf8",
);

const checks = [
  {
    name: "route /app/mock-test/exam/:examCode",
    ok: /path:\s*"mock-test\/exam\/:examCode"/.test(app),
  },
  {
    name: "route /app/mock-test/generate",
    ok: /path:\s*"mock-test\/generate"/.test(app),
  },
  {
    name: "route /app/admin/gov/ingest",
    ok: /path:\s*"gov\/ingest"/.test(app) && /AdminGovIngest/.test(app),
  },
  {
    name: "admin sidebar PDF Ingest link",
    ok: /gov\/ingest/.test(layout) && /PDF Ingest/.test(layout),
  },
  {
    name: "extract-question-paper edge function",
    ok: fs.existsSync(extractFn) &&
      /is_public:\s*false/.test(fs.readFileSync(extractFn, "utf8")) &&
      /needs_review:\s*true/.test(fs.readFileSync(extractFn, "utf8")) &&
      /validateExtractQuestionPaperPayload/.test(
        fs.readFileSync(extractFn, "utf8"),
      ),
  },
  {
    name: "OCR job status migration",
    ok: fs.existsSync(ocrMigration) &&
      /extracting/.test(fs.readFileSync(ocrMigration, "utf8")) &&
      /questions[\s\S]*metadata/.test(fs.readFileSync(ocrMigration, "utf8")),
  },
  {
    name: "APPSC State PSC migration file",
    ok: fs.existsSync(migration) &&
      /APPSC_GROUP2/.test(fs.readFileSync(migration, "utf8")) &&
      /psc\.ap\.gov\.in/.test(fs.readFileSync(migration, "utf8")),
  },
  {
    name: "paper_class presentation helpers",
    ok: /resolvePaperClassPresentation/.test(disclaimers) &&
      /primaryActionInsight/.test(disclaimers) &&
      /official_previous/.test(disclaimers),
  },
  {
    name: "bank readiness migration + helper",
    ok: (() => {
      const bankMigration = path.join(
        root,
        "supabase",
        "migrations",
        "20260802160000_gov_exam_bank_readiness.sql",
      );
      const bankHelper = path.join(
        root,
        "src",
        "lib",
        "gov-exam",
        "bankReadiness.ts",
      );
      return (
        fs.existsSync(bankMigration) &&
        /get_gov_exam_bank_readiness/.test(
          fs.readFileSync(bankMigration, "utf8"),
        ) &&
        fs.existsSync(bankHelper) &&
        /computeBankReadinessStatus/.test(fs.readFileSync(bankHelper, "utf8"))
      );
    })(),
  },
];

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}: ${c.name}`);
  if (!c.ok) failed += 1;
}

if (failed) {
  console.error(`\nGov exam static smoke: ${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nOK: gov exam static smoke passed");
