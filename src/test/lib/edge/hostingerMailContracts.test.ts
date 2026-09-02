import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function walkSourceFiles(dir: string, skipDirNames: Set<string>): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirNames.has(entry.name)) continue;
      out.push(...walkSourceFiles(path.join(dir, entry.name), skipDirNames));
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

describe("Hostinger Mail contracts", () => {
  const helper = read("supabase/functions/_shared/hostingerMail.ts");
  const proxy = read("supabase/functions/hostinger-mail/index.ts");
  const sendEmail = read("supabase/functions/send-email/index.ts");
  const config = read("supabase/config.toml");
  const envExample = read(".env.example");
  const adminMail = read("src/pages/app/admin/AdminMail.tsx");

  it("keeps the Mail API token server-side only", () => {
    expect(helper).toContain("HOSTINGER_MAIL_API_TOKEN");
    expect(helper).toContain("https://api.mail.hostinger.com");
    expect(helper).toContain("/api/v1/me");
    expect(helper).toContain("/send");
    expect(proxy).toContain("enforceAdmin");
    expect(proxy).toContain("PROVIDER_UNAVAILABLE");
    expect(proxy).toContain("assertNoTokenLeak");
    expect(config).toMatch(/\[functions\.hostinger-mail\][\s\S]*?verify_jwt = true/);
    expect(envExample).toMatch(/^HOSTINGER_MAIL_API_TOKEN=\s*$/m);
    expect(envExample).toContain("HOSTINGER_MAIL_ADDRESS=hello@trycareerpilot.com");
    expect(envExample).not.toMatch(/HOSTINGER_MAIL_API_TOKEN=\S+/);
    expect(envExample).not.toMatch(/VITE_HOSTINGER/);
  });

  it("does not put Hostinger secrets in production src", () => {
    const files = walkSourceFiles(path.join(root, "src"), new Set(["test"]));
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(src, file).not.toContain("HOSTINGER_MAIL_API_TOKEN=");
      expect(src, file).not.toMatch(/VITE_HOSTINGER/);
      expect(src, file).not.toMatch(/Authorization:\s*`Bearer \$\{.*HOSTINGER/);
    }
    expect(adminMail).toContain("configured");
    expect(adminMail).not.toMatch(/token\s*[:=]\s*["'][^"']+["']/i);
  });

  it("send-email prefers Hostinger when the token is present", () => {
    expect(sendEmail).toContain("isHostingerMailConfigured");
    expect(sendEmail).toContain("sendHostingerEmail");
    expect(sendEmail).toContain("sendProductEmail");
    const preferBlock = sendEmail.slice(
      sendEmail.indexOf("async function sendProductEmail"),
      sendEmail.indexOf("function renderTemplate"),
    );
    expect(preferBlock.indexOf("isHostingerMailConfigured()")).toBeGreaterThan(-1);
    expect(preferBlock.indexOf("isHostingerMailConfigured()")).toBeLessThan(
      preferBlock.indexOf("sendEmailResend"),
    );
    expect(sendEmail).toContain("HOSTINGER_MAIL_API_TOKEN or RESEND_API_KEY");
    expect(sendEmail).toContain("wrapCareerPilotEmail");
    expect(sendEmail).toContain("trycareerpilot.com");
    expect(sendEmail).not.toContain("confideq.app");
  });

  it("schedule-interview prefers Hostinger with Resend fallback", () => {
    const scheduleInterview = read("supabase/functions/schedule-interview/index.ts");
    expect(scheduleInterview).toContain("isHostingerMailConfigured");
    expect(scheduleInterview).toContain("sendHostingerEmail");
    const confirmBlock = scheduleInterview.slice(
      scheduleInterview.indexOf("async function sendConfirmationEmail"),
      scheduleInterview.indexOf("type ReminderKind"),
    );
    expect(confirmBlock.indexOf("isHostingerMailConfigured()")).toBeGreaterThan(-1);
    expect(confirmBlock.indexOf("api.resend.com")).toBeGreaterThan(-1);
    expect(scheduleInterview).toContain(
      "isHostingerMailConfigured() || Boolean(RESEND_API_KEY)",
    );
  });

  it("creates tracking folders for OTPs and verifications", () => {
    expect(helper).toContain('name: "OTPs"');
    expect(helper).toContain('name: "Verifications"');
    expect(helper).toContain("ensureTrackingFolders");
    expect(proxy).toContain("ensure-folders");
    expect(adminMail).toContain("ensure-folders");
    const uiFolders = read("src/lib/mail/hostingerTrackingFolders.ts");
    expect(uiFolders).toContain('name: "OTPs"');
    expect(uiFolders).toContain('name: "PasswordResets"');
  });

  it("uses the Career Pilot email shell and public website", () => {
    const layout = read("supabase/functions/_shared/emailLayout.ts");
    expect(layout).toContain('PUBLIC_WEBSITE_URL = "https://trycareerpilot.com"');
    expect(layout).toContain("wrapCareerPilotEmail");
    expect(layout).toContain("#0B1220");
    expect(layout).toContain("#163B73");
    expect(layout).toContain("#2563EB");
    expect(read("supabase/functions/schedule-interview/index.ts")).toContain("wrapCareerPilotEmail");
    expect(read("supabase/functions/contact-sales/index.ts")).toContain("wrapCareerPilotEmail");
    expect(read("supabase/functions/send-interview-reminders/index.ts")).toContain("wrapCareerPilotEmail");
  });
});
