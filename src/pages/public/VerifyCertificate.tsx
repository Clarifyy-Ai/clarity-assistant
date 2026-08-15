import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { certificateKindLabel, formatCertificateDate } from "@/lib/learning/certificates";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

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

export default function VerifyCertificatePage() {
  const { certificateId } = useParams<{ certificateId: string }>();
  const [result, setResult] = useState<VerifyPayload | null>(null);

  useEffect(() => {
    if (!certificateId) return;
    void supabase.rpc("verify_course_certificate", { p_code: certificateId }).then(({ data }) => {
      setResult((data as VerifyPayload) ?? { valid: false });
    });
  }, [certificateId]);

  return (
    <div className={`${PAGE_SHELL} mx-auto max-w-2xl px-4 py-10`}>
      <h1 className="text-2xl font-semibold">{certificateKindLabel()}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        This verifies a Clarify AI course completion record. It is not an official professional certification.
      </p>
      {result?.valid ? (
        <div className="mt-8 rounded-2xl border border-border p-6">
          <p className="text-sm uppercase tracking-wide text-muted-foreground">{result.kind}</p>
          <p className="mt-2 text-xl font-semibold">{result.student_name}</p>
          <p className="mt-1">{result.course_name}</p>
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">Certificate ID</dt><dd>{result.certificate_code}</dd></div>
            <div><dt className="text-muted-foreground">Completion date</dt><dd>{result.issued_at ? formatCertificateDate(result.issued_at) : "—"}</dd></div>
            <div><dt className="text-muted-foreground">Course duration</dt><dd>{result.course_duration_hours ?? 0} hours</dd></div>
            <div><dt className="text-muted-foreground">Completion</dt><dd>{result.completion_percentage}%</dd></div>
          </dl>
        </div>
      ) : result ? (
        <p className="mt-8 text-sm">No matching certificate was found for this ID.</p>
      ) : (
        <p className="mt-8 text-sm">Checking…</p>
      )}
    </div>
  );
}
