import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";

export default function Terms() {
  usePageMeta({
    title: "Terms of Service | Clarify AI",
    description: "Read the Clarify AI terms of service, usage policies, and legal agreements.",
  });

  return (
    <MarketingLayout>
      <article className="pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 sm:px-6 max-w-3xl mx-auto prose prose-sm dark:prose-invert prose-headings:font-bold prose-headings:text-foreground prose-p:text-muted-foreground prose-li:text-muted-foreground prose-strong:text-foreground">
        <h1>Terms of Service</h1>
        <p className="text-xs text-muted-foreground">Last updated: March 25, 2026</p>

        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using Clarify AI ("Service"), operated by Payara Labs ("Company", "we", "us"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          Clarify AI is an AI-powered interview preparation platform providing mock interviews, real-time coaching, analytics, and related tools. The Service is provided "as is" and "as available."
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
          <li>Attempt to reverse-engineer, decompile, or disassemble any part of the Service.</li>
          <li>Share your account credentials with third parties.</li>
          <li>Use automated systems (bots, scrapers) to access the Service without permission.</li>
          <li>Upload malicious content, viruses, or harmful code.</li>
        </ul>

        <h2>5. Intellectual Property</h2>
        <p>
          All content, features, and functionality of the Service — including text, graphics, logos, and software — are owned by Payara Labs and protected by intellectual property laws. Your content (resumes, answers, notes) remains yours.
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
          THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, PAYARA LABS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
        </p>

        <h2>10. Termination</h2>
        <p>
          We may suspend or terminate your account at any time for violations of these Terms. You may delete your account at any time through the Settings page.
        </p>

        <h2>11. Changes to Terms</h2>
        <p>
          We reserve the right to modify these Terms at any time. Changes will be posted on this page with an updated "Last updated" date. Continued use of the Service constitutes acceptance of the revised Terms.
        </p>

        <h2>12. Contact</h2>
        <p>
          For questions about these Terms, contact us at{" "}
          <a href="mailto:legal@clarifyai.com" className="text-primary hover:underline">
            legal@clarifyai.com
          </a>.
        </p>
      </article>
    </MarketingLayout>
  );
}
