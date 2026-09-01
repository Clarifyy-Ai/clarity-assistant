import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Award, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { certificateKindLabel, formatCertificateDate } from "@/lib/learning/certificates";
import { PAGE_SHELL_STANDARD } from "@/lib/ui/responsivePage";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

type VerifyPayload = {
  valid: boolean;
  certificate_code?: string;
  student_name?: string;
  course_name?: string;
  issued_at?: string;
  course_duration_hours?: number | null;
  completion_percentage?: number;
  kind?: string;
};

type VerifyStatus = "idle" | "loading" | "valid" | "invalid" | "error";

/**
 * Public certificate verification (TC-PUB-011).
 * Invalid IDs must not leak private learning data — RPC returns { valid: false } only.
 */
export default function VerifyCertificatePage() {
  const { certificateId } = useParams<{ certificateId?: string }>();
  const navigate = useNavigate();
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<VerifyPayload | null>(null);
  const [status, setStatus] = useState<VerifyStatus>(
    certificateId?.trim() ? "loading" : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  usePageMeta({
    title: `Verify certificate — ${PRODUCT_NAMES.brand}`,
    description:
      "Verify a Career Pilot course completion certificate. Invalid IDs show a safe empty result.",
    noIndex: !certificateId?.trim(),
  });

  const verify = useCallback(async (codeRaw?: string) => {
    const code = (codeRaw ?? certificateId)?.trim();
    if (!code) {
      setResult(null);
      setError(null);
      setStatus("idle");
      return;
    }
    setStatus("loading");
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("verify_course_certificate", {
      p_code: code,
    });
    if (rpcError) {
      setResult(null);
      setError(rpcError.message || "Could not verify this certificate.");
      setStatus("error");
      return;
    }
    const payload = (data as VerifyPayload) ?? { valid: false };
    setResult(payload);
    const next = payload.valid ? "valid" : "invalid";
    setStatus(next);
  }, [certificateId]);

  useEffect(() => {
    if (certificateId?.trim()) void verify(certificateId);
    else setStatus("idle");
  }, [certificateId, verify]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    navigate(`/verify-certificate/${encodeURIComponent(code)}`);
  }

  return (
    <div
      data-testid="dd-layout-root"
      className={`${PAGE_SHELL_STANDARD} mx-auto flex min-h-0 w-full flex-col px-4 py-8 sm:px-6 sm:py-10`}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <main id="main-content" className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{certificateKindLabel()}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            This verifies a Career Pilot course completion record. It is not an official
            professional certification. Certificates are issued from your signed-in Learn
            account; this page only checks a public verification code.
          </p>
        </div>

        {!certificateId?.trim() && (
          <form onSubmit={submitManual} className="space-y-3 rounded-2xl border border-border p-4 sm:p-5">
            <label className="block text-sm font-medium text-foreground" htmlFor="cert-code">
              Certificate ID
            </label>
            <Input
              id="cert-code"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Paste a certificate code"
              autoComplete="off"
            />
            <Button type="submit" variant="primary" size="md" disabled={!manualCode.trim()}>
              Verify
            </Button>
          </form>
        )}

        {status === "loading" && (
          <div className="space-y-3">
            <SkeletonCard />
            <p className="text-sm text-muted-foreground">Checking certificate…</p>
          </div>
        )}

        {status === "error" && (
          <InlineErrorRetry
            message={error ?? "Could not verify this certificate."}
            onRetry={() => void verify()}
          />
        )}

        {status === "invalid" && (
          <div className="flex flex-1 min-h-[40vh] items-center justify-center">
            <EmptyState
              icon={AlertTriangle}
              title="Invalid certificate code"
              description={
                certificateId?.trim()
                  ? "No matching certificate was found for this ID. No learner or course details are shown."
                  : "This verification link is missing a certificate code."
              }
              actionLabel="Try another code"
              onAction={() => navigate("/verify-certificate")}
              compact
            />
          </div>
        )}

        {status === "valid" && result?.valid && (
          <div data-testid="certificate-card" className="flex flex-1 flex-col justify-center">
            <div
              data-certificate-surface
              className="w-full rounded-2xl border-2 border-primary/25 bg-gradient-to-br from-background via-background to-primary/5 px-6 py-10 shadow-sm sm:px-10 sm:py-12 md:min-h-[20rem] md:px-14 md:py-14"
            >
              <p className="text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" aria-hidden />
                {result.kind}
              </p>
              <p className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
                {result.student_name}
              </p>
              <p className="mt-3 max-w-3xl text-base text-foreground/90 sm:text-lg">{result.course_name}</p>
              <dl className="mt-8 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 md:gap-6 md:text-base">
                <div>
                  <dt className="text-muted-foreground">Certificate ID</dt>
                  <dd className="mt-0.5 font-medium break-all">{result.certificate_code}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Completion date</dt>
                  <dd className="mt-0.5 font-medium">
                    {result.issued_at ? formatCertificateDate(result.issued_at) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Course duration</dt>
                  <dd className="mt-0.5 font-medium">{result.course_duration_hours ?? 0} hours</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Completion</dt>
                  <dd className="mt-0.5 font-medium">{result.completion_percentage}%</dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        <p className="mt-auto pt-4 text-xs text-muted-foreground">
          Looking for Help instead?{" "}
          <Link to="/help" className="text-primary font-medium hover:underline">
            Open Help Center
          </Link>
        </p>
      </main>
    </div>
  );
}
