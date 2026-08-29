export type CertificateRecord = {
  certificate_code: string;
  student_name: string;
  course_name: string;
  issued_at: string;
  course_duration_hours: number | null;
  completion_percentage: number;
};

export function certificateKindLabel(): string {
  return "Course Completion Certificate";
}

export function verificationPath(certificateCode: string): string {
  return `/verify-certificate/${encodeURIComponent(certificateCode)}`;
}

export function isOfficialCertificationClaim(text: string): boolean {
  return /official\s+certification|accredited\s+cert|board[- ]certified/i.test(text);
}

export function formatCertificateDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
