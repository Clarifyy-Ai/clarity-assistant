import { PRIVACY_EMAIL, LEGAL_ENTITY_NAME, COMPANY_NAME } from "@/lib/constants/contact";
import { LEGAL_PROSE_CLASS } from "@/lib/constants/legal";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { LegalAuthBackLink } from "@/components/marketing/LegalAuthBackLink";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function Privacy() {
  usePageMeta({
    title: "Privacy Policy | Clarify AI",
    description: "Learn how Clarify AI collects, uses, and protects your personal data.",
  });

  return (
    <MarketingLayout>
      <article className="pt-4 sm:pt-12 pb-14 px-4 sm:px-6 max-w-3xl mx-auto">
        <LegalAuthBackLink />
        <header className="text-center mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">Last updated: March 25, 2026</p>
        </header>
        <div className={`text-left ${LEGAL_PROSE_CLASS}`}>
        <h2>1. Introduction</h2>
        <p>
          {LEGAL_ENTITY_NAME} ("Company", "we", "us") operates {COMPANY_NAME}. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service. {COMPANY_NAME} is intended for interview preparation and rehearsal — not for use during actual third-party interviews or proctored assessments.
        </p>

        <h2>2. Information We Collect</h2>
        <h3>2.1 Information You Provide</h3>
        <ul>
          <li><strong>Account data:</strong> Name, email address, password (hashed).</li>
          <li><strong>Profile data:</strong> Job title, target role, experience level, resume content.</li>
          <li><strong>Usage content:</strong> Interview answers, practice session transcripts, uploaded documents.</li>
          <li><strong>Payment data:</strong> Processed securely by Razorpay; we do not store full card numbers.</li>
        </ul>

        <h3>2.2 Automatically Collected Information</h3>
        <ul>
          <li><strong>Device &amp; browser data:</strong> IP address, browser type, operating system.</li>
          <li><strong>Usage analytics:</strong> Pages visited, features used, session duration (via PostHog).</li>
          <li><strong>Performance data:</strong> Error logs, API response times.</li>
        </ul>

        <h2>3. How We Use Your Information</h2>
        <ul>
          <li>To provide and maintain the Service.</li>
          <li>To personalize AI coaching based on your profile and history.</li>
          <li>To process payments.</li>
          <li>To send transactional emails (account verification, password reset).</li>
          <li>To improve the Service through aggregated, anonymized analytics.</li>
          <li>To detect and prevent fraud or abuse.</li>
        </ul>

        <h2>4. Data Sharing</h2>
        <p>We do not sell your personal data. We may share data with:</p>
        <ul>
          <li><strong>Service providers:</strong> Supabase (database/auth), Razorpay (payments), Deepgram (transcription), PostHog (analytics), Resend (email).</li>
          <li><strong>AI model providers:</strong> OpenAI, Anthropic, Google (for processing your prompts — no data is retained by these providers for training).</li>
          <li><strong>Legal requirements:</strong> If required by law, regulation, or legal process.</li>
        </ul>

        <h2>5. Data Retention</h2>
        <p>
          We retain your data for as long as your account is active. You can delete your account and all associated data at any time from Settings → Danger Zone. Upon account deletion, your data is permanently removed within 30 days.
        </p>

        <h2>6. Data Security</h2>
        <p>
          We implement industry-standard security measures including encryption in transit (TLS 1.3), encryption at rest, row-level security on database tables, and regular security audits.
        </p>

        <h2>7. Your Rights</h2>
        <p>You have the right to:</p>
        <ul>
          <li><strong>Access</strong> your personal data (Settings → Data → Export).</li>
          <li><strong>Correct</strong> inaccurate data (Settings → Profile).</li>
          <li><strong>Delete</strong> your account and data (Settings → Danger Zone).</li>
          <li><strong>Object</strong> to marketing communications (Settings → Notifications).</li>
          <li><strong>Data portability</strong> — export your data in standard formats.</li>
        </ul>

        <h2>8. Cookies &amp; Tracking</h2>
        <p>
          We use essential cookies for authentication and session management. We use PostHog for product analytics. You can opt out of non-essential analytics via the cookie consent banner or Settings → Privacy.
        </p>

        <h2>9. Children's Privacy</h2>
        <p>
          The Service is not intended for users under 16 years of age. We do not knowingly collect data from children under 16.
        </p>

        <h2>10. International Data Transfers</h2>
        <p>
          Your data may be processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place for cross-border transfers.
        </p>

        <h2>11. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.
        </p>

        <h2>12. Contact Us</h2>
        <p>
          For privacy-related questions, contact us at{" "}
          <a href={`mailto:${PRIVACY_EMAIL}`} className="text-primary hover:underline">
            {PRIVACY_EMAIL}
          </a>
          . The address is shown in full so you can copy it if your browser does not open a mail app
          (a canceled <code className="text-xs">mailto:</code> request in DevTools is normal).
        </p>
        </div>
      </article>
    </MarketingLayout>
  );
}
