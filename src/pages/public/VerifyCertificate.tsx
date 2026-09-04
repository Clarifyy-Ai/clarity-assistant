import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Award, Download, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { certificateKindLabel, formatCertificateDate } from "@/lib/learning/certificates";
import {
  certificatePdfInputFromVerifyPayload,
  downloadCertificatePdf,
} from "@/lib/learning/certificatePdf";
import {
  type CertificateVerifyPayload,
  type CertificateVerifyStatus,
  certificateMalformedCopy,
  certificateNotFoundCopy,
  classifyRouteCertificateCode,
  normalizeCertificateCode,
  resolveVerifyStatusFromRpc,
  safeCertificateVerifyErrorMessage,
} from "@/lib/learning/certificateVerification";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { PublicErrorState } from "@/components/common/PublicErrorState";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { usePageMeta } from "@/hooks/usePageMeta";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { MARKETING_SHELL } from "@/lib/ui/responsivePage";

/**
 * Public certificate verification (TC-PUB-011).
 * Invalid IDs must not leak private learning data — RPC returns { valid: false } only.
 * Download PDF / Print use only the verified public payload.
 */
export default function VerifyCertificatePage() {
  const { certificateId } = useParams<{ certificateId?: string }>();
  const navigate = useNavigate();
  const routeCode = normalizeCertificateCode(certificateId);
  const routeKind = classifyRouteCertificateCode(certificateId);

  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<CertificateVerifyPayload | null>(null);
  const [status, setStatus] = useState<CertificateVerifyStatus>(() => {
    if (!routeCode) return "idle";
    if (routeKind === "malformed") return "malformed";
    return "loading";
  });
  const [error, setError] = useState<string | null>(null);

  usePageMeta({
    title: `Verify certificate — ${PRODUCT_NAMES.brand}`,
    description:
      "Verify a Career Pilot course completion certificate. Invalid IDs show a safe empty result.",
    noIndex: !routeCode,
  });

  const verify = useCallback(async (codeRaw?: string) => {
    const code = normalizeCertificateCode(codeRaw ?? certificateId);
    if (!code) {
      setResult(null);
      setError(null);
      setStatus("idle");
      return;
    }
    if (classifyRouteCertificateCode(code) !== "ready") {
      setResult(null);
      setError(null);
      setStatus("malformed");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("verify_course_certificate", {
        p_code: code,
      });
      const resolved = resolveVerifyStatusFromRpc(
        (data as CertificateVerifyPayload | null) ?? { valid: false },
        rpcError,
      );
      setResult(resolved.status === "valid" ? (data as CertificateVerifyPayload) : null);
      setError(resolved.error);
      setStatus(resolved.status);
    } catch {
      setResult(null);
      setError(safeCertificateVerifyErrorMessage());
      setStatus("error");
    }
  }, [certificateId]);

  useEffect(() => {
    if (!routeCode) {
      setStatus("idle");
      setResult(null);
      setError(null);
      return;
    }
    if (routeKind === "malformed") {
      setStatus("malformed");
      setResult(null);
      setError(null);
      return;
    }
    void verify(routeCode);
  }, [routeCode, routeKind, verify]);

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const code = normalizeCertificateCode(manualCode);
    if (!code) return;
    navigate(`/verify-certificate/${encodeURIComponent(code)}`);
  }

  const handleDownloadPdf = useCallback(() => {
    const input = certificatePdfInputFromVerifyPayload(result ?? { valid: false });
    if (!input) {
      toast.error("Certificate details are incomplete. Refresh and try again.");
      return;
    }
    try {
      downloadCertificatePdf(input);
      toast.success("Certificate PDF downloaded.");
    } catch {
      toast.error("Could not create the PDF. Please try again.");
    }
  }, [result]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const notFoundCopy = certificateNotFoundCopy();
  const malformedCopy = certificateMalformedCopy();

  return (
    <MarketingLayout>
      <section
        data-testid="dd-layout-root"
        className={`${MARKETING_SHELL} px-4 sm:px-6 pt-8 pb-16 certificate-verify-page`}
      >
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <header className="no-print space-y-2 text-center sm:text-left">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">
              {PRODUCT_NAMES.brand} verification
            </p>
            <h1 className="text-2xl font-semibold sm:text-3xl">{certificateKindLabel()}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground leading-relaxed">
              This verifies a Career Pilot course completion record. It is not an official
              professional certification. Certificates are issued from your signed-in Learn
              account; this page only checks a public verification code.
            </p>
          </header>

          {status === "idle" && (
            <form
              onSubmit={submitManual}
              className="no-print space-y-3 rounded-2xl border border-border bg-card/40 p-4 sm:p-5"
              data-testid="certificate-verify-form"
            >
              <label className="block text-sm font-medium text-foreground" htmlFor="cert-code">
                Certificate ID
              </label>
              <Input
                id="cert-code"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="CLR-2026-AB12CD34"
                autoComplete="off"
              />
              <Button type="submit" variant="primary" size="md" disabled={!manualCode.trim()}>
                Verify certificate
              </Button>
            </form>
          )}

          {status === "loading" && (
            <div className="no-print space-y-3" data-testid="certificate-verify-loading">
              <SkeletonCard />
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden />
                Checking certificate…
              </p>
            </div>
          )}

          {status === "malformed" && (
            <div className="no-print" data-testid="certificate-verify-malformed">
              <PublicErrorState
                title={malformedCopy.title}
                description={malformedCopy.description}
                homeHref="/verify-certificate"
                homeLabel="Enter another code"
              />
            </div>
          )}

          {status === "invalid" && (
            <div className="no-print" data-testid="certificate-verify-invalid">
              <p className="mb-2 text-center text-xs font-semibold uppercase tracking-widest text-primary">
                {PRODUCT_NAMES.brand}
              </p>
              <PublicErrorState
                title={notFoundCopy.title}
                description={notFoundCopy.description}
                homeHref="/verify-certificate"
                homeLabel="Verify another code"
              />
            </div>
          )}

          {status === "error" && (
            <div
              className="no-print space-y-4"
              data-testid="certificate-verify-error"
              role="alert"
            >
              <PublicErrorState
                title="Verification unavailable"
                description={
                  error ??
                  "We could not verify this certificate right now. Please try again in a moment."
                }
                homeHref="/verify-certificate"
                homeLabel="Back to verification"
              />
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={() => void verify()}
                >
                  Try again
                </Button>
              </div>
            </div>
          )}

          {status === "valid" && result?.valid && (
            <div data-testid="certificate-card" className="flex flex-1 flex-col gap-4 justify-center">
              <div
                className="no-print flex flex-wrap items-center justify-center gap-2 sm:justify-start"
                data-testid="certificate-actions"
              >
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  leftIcon={<Download className="h-4 w-4" aria-hidden />}
                  onClick={handleDownloadPdf}
                  data-testid="certificate-download-pdf"
                >
                  Download PDF
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  leftIcon={<Printer className="h-4 w-4" aria-hidden />}
                  onClick={handlePrint}
                  data-testid="certificate-print"
                >
                  Print
                </Button>
              </div>

              <div
                data-certificate-surface
                className="certificate-print-surface relative w-full overflow-hidden rounded-sm border-[3px] border-primary/40 bg-[linear-gradient(145deg,hsl(var(--background))_0%,hsl(var(--background))_55%,hsl(var(--primary)/0.08)_100%)] px-6 py-10 shadow-md sm:px-12 sm:py-14"
              >
                <div
                  className="pointer-events-none absolute inset-3 rounded-sm border border-primary/20"
                  aria-hidden
                />
                <div className="relative text-center space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                    {PRODUCT_NAMES.brand}
                  </p>
                  <p className="inline-flex items-center justify-center gap-2 text-sm uppercase tracking-wide text-muted-foreground">
                    <Award className="h-5 w-5 text-primary" aria-hidden />
                    {result.kind || certificateKindLabel()}
                  </p>
                  <p className="pt-2 text-xs uppercase tracking-widest text-muted-foreground">
                    This is to certify that
                  </p>
                  <p className="text-3xl font-semibold tracking-tight sm:text-4xl">
                    {result.student_name}
                  </p>
                  <p className="text-sm text-muted-foreground">has successfully completed</p>
                  <p className="mx-auto max-w-2xl text-xl font-medium text-foreground/95 sm:text-2xl">
                    {result.course_name}
                  </p>
                </div>
                <dl className="relative mt-10 grid grid-cols-1 gap-5 text-sm sm:grid-cols-2 sm:gap-6 md:text-base">
                  <div>
                    <dt className="text-muted-foreground">Certificate ID</dt>
                    <dd className="mt-0.5 break-all font-medium">{result.certificate_code}</dd>
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
                <p className="relative mt-8 text-center text-[11px] text-muted-foreground">
                  Course completion record — not an accredited professional license.
                </p>
              </div>
            </div>
          )}

          <p className="no-print text-center text-xs text-muted-foreground sm:text-left">
            Need help with verification?{" "}
            <Link to="/help" className="font-medium text-primary hover:underline">
              Open Help Center
            </Link>
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
