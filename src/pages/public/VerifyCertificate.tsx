import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Award, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { certificateKindLabel, formatCertificateDate } from "@/lib/learning/certificates";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";

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

type VerifyStatus = "loading" | "valid" | "invalid" | "error";

export default function VerifyCertificatePage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [result, setResult] = useState<VerifyPayload | null>(null);
  const [status, setStatus] = useState<VerifyStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async () => {
    const code = certificateId?.trim();
    if (!code) {
      setResult(null);
      setError(null);
      setStatus("invalid");
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
    setStatus(payload.valid ? "valid" : "invalid");
  }, [certificateId]);

  useEffect(() => {
    void verify();
  }, [verify]);

  return (
    <div className={`${PAGE_SHELL} mx-auto max-w-2xl px-4 py-10`}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>
      <main id="main-content">
        <h1 className="text-2xl font-semibold">{certificateKindLabel()}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          This verifies a Clarify AI course completion record. It is not an official professional certification.
        </p>

        {status === "loading" && (
          <div className="mt-8 space-y-3">
            <SkeletonCard />
            <p className="text-sm text-muted-foreground">Checking certificate…</p>
          </div>
        )}

        {status === "error" && (
          <div className="mt-8">
            <InlineErrorRetry
              message={error ?? "Could not verify this certificate."}
              onRetry={() => void verify()}
            />
          </div>
        )}

        {status === "invalid" && (
          <div className="mt-8">
            <EmptyState
              icon={AlertTriangle}
              title="Invalid certificate code"
              description={
                certificateId?.trim()
                  ? "No matching certificate was found for this ID."
                  : "This verification link is missing a certificate code."
              }
              actionLabel="Retry"
              onAction={() => void verify()}
              compact
            />
          </div>
        )}

        {status === "valid" && result?.valid && (
          <div className="mt-8 rounded-2xl border border-border p-6">
            <p className="text-sm uppercase tracking-wide text-muted-foreground inline-flex items-center gap-2">
              <Award className="w-4 h-4" aria-hidden />
              {result.kind}
            </p>
            <p className="mt-2 text-xl font-semibold">{result.student_name}</p>
            <p className="mt-1">{result.course_name}</p>
            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Certificate ID</dt><dd>{result.certificate_code}</dd></div>
              <div><dt className="text-muted-foreground">Completion date</dt><dd>{result.issued_at ? formatCertificateDate(result.issued_at) : "—"}</dd></div>
              <div><dt className="text-muted-foreground">Course duration</dt><dd>{result.course_duration_hours ?? 0} hours</dd></div>
              <div><dt className="text-muted-foreground">Completion</dt><dd>{result.completion_percentage}%</dd></div>
            </dl>
          </div>
        )}
      </main>
    </div>
  );
}
