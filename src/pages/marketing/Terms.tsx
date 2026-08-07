import { LEGAL_EMAIL, LEGAL_ENTITY_NAME, COMPANY_NAME } from "@/lib/constants/contact";
import { LEGAL_PROSE_CLASS } from "@/lib/constants/legal";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { ComplianceBanner } from "@/components/marketing";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function Terms() {
  usePageMeta({
    title: "Terms of Service | Clarify AI",
    description: "Read the Clarify AI terms of service, usage policies, and legal agreements.",
  });

  return (
    <MarketingLayout>
      <article className="pt-4 sm:pt-12 pb-14 px-4 sm:px-6 max-w-3xl mx-auto">
        <header className="text-center mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">Last updated: March 25, 2026</p>
        </header>
        <ComplianceBanner />
        <div className={`text-left ${LEGAL_PROSE_CLASS}`}>
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using {COMPANY_NAME} (&quot;Service&quot;), operated by {LEGAL_ENTITY_NAME} (&quot;Company&quot;, &quot;we&quot;, &quot;us&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Clarify AI is an AI-powered interview preparation platform providing mock interviews, live practice coaching, analytics, and related tools for rehearsal and preparation. The Service is provided &quot;as is&quot; and &quot;as available.&quot;
        </p>

        <h3>2.1 Practice and Rehearsal Only</h3>
        <p>
          Clarify AI is designed exclusively for interview preparation, mock sessions, and rehearsal. You may not use AI assistance features during actual third-party interviews, employer assessments, proctored exams, or any evaluation where outside assistance is prohibited. The on-screen overlay is a standard application window and is visible to screen-sharing and recording tools.
        </p>

        <h2>3. User Accounts</h2>
        <ul>
          <li>You must provide accurate information when creating an account.</li>
          <li>You are responsible for maintaining the security of your account credentials.</li>
          <li>You must be at least 16 years of age to use the Service.</li>
          <li>One person or entity may not maintain more than one free account.</li>
        </ul>

        <h2>4. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
          <li>
            Use the Service to deceive a third party during an actual interview, exam, or assessment
            — including using AI-generated hints or answers in real time while an employer, interviewer,
            proctor, or examiner is evaluating you.
          </li>
          <li>Attempt to reverse-engineer, decompile, or disassemble any part of the Service.</li>
          <li>Share your account credentials with third parties.</li>
          <li>Use automated systems (bots, scrapers) to access the Service without permission.</li>
          <li>Upload malicious content, viruses, or harmful code.</li>
        </ul>
        <p>
          Clarify AI is an interview <strong>preparation</strong> platform. Mock sessions, warmups,
          and live rehearsals are practice contexts. AI model answers and coaching are study aids for
          rehearsal — not scripts to be used during actual third-party interviews or employer evaluations.
        </p>

        <h2>5. Intellectual Property</h2>
        <p>
          All content, features, and functionality of the Service — including text, graphics, logos, and software — are owned by {LEGAL_ENTITY_NAME} and protected by intellectual property laws. Your content (resumes, answers, notes) remains yours.
        </p>

        <h2>6. Subscriptions &amp; Billing</h2>
        <ul>
          <li>Paid plans are billed monthly or annually as selected at checkout.</li>
          <li>You may cancel your subscription at any time; access continues until the end of the billing period.</li>
          <li>Refunds are handled on a case-by-case basis within 7 days of purchase.</li>
          <li>Credit packs are non-refundable once used.</li>
        </ul>

        <h2>7. AI-Generated Content</h2>
        <p>
          The Service uses AI models to generate interview answers, feedback, and coaching suggestions. AI-generated content is provided for educational and practice purposes only. We do not guarantee the accuracy, completeness, or appropriateness of AI outputs.
        </p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided &quot;as is&quot; without warranties of any kind, express or implied. We do not warrant that the Service will be uninterrupted, error-free, or secure.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, {LEGAL_ENTITY_NAME} shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.
        </p>

        <h2>10. Termination</h2>
        <p>
          We may suspend or terminate your account at any time for violations of these Terms. You may delete your account at any time through the Settings page.
        </p>

        <h2>11. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated &quot;Last updated&quot; date. Continued use of the Service constitutes acceptance of the revised Terms.
        </p>

        <h2>12. Contact</h2>
        <p>
          For questions about these Terms, contact us at{" "}
          <a href={`mailto:${LEGAL_EMAIL}`} className="text-primary hover:underline">
            {LEGAL_EMAIL}
          </a>.
        </p>
        </div>
      </article>
    </MarketingLayout>
  );
}
