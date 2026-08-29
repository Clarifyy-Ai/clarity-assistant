export const LICENSE_TYPES = [
  "ORIGINAL",
  "USER_OWNED",
  "PUBLIC_DOMAIN",
  "LICENSED",
  "INTERNAL",
  "UNKNOWN",
] as const;

export type LicenseType = (typeof LICENSE_TYPES)[number];

export const PUBLISHABLE_LICENSES: LicenseType[] = [
  "ORIGINAL",
  "USER_OWNED",
  "PUBLIC_DOMAIN",
  "LICENSED",
  "INTERNAL",
];

export type PublishStatus = "draft" | "published" | "archived";

export function isLicenseType(value: string | null | undefined): value is LicenseType {
  return Boolean(value && (LICENSE_TYPES as readonly string[]).includes(value));
}

export function canPublishLicense(license: string | null | undefined): boolean {
  return isLicenseType(license) && license !== "UNKNOWN";
}

export function publishBlockReason(license: string | null | undefined): string | null {
  if (!license) return "Licensing metadata is required before publishing.";
  if (!isLicenseType(license)) return "Invalid license type.";
  if (license === "UNKNOWN") {
    return "UNKNOWN license content cannot be published to public certification-style exams.";
  }
  return null;
}

export type ContentOwnershipMeta = {
  content_owner: string | null;
  created_by: string | null;
  source: string | null;
  license_type: LicenseType;
  license_url: string | null;
  copyright_status: string | null;
  created_at?: string;
  updated_at?: string;
};

export function normalizeLicense(value: string | null | undefined): LicenseType {
  const raw = String(value ?? "UNKNOWN").trim().toUpperCase().replace(/\s+/g, "_");
  if (raw === "PUBLIC-DOMAIN") return "PUBLIC_DOMAIN";
  if (raw === "USER" || raw === "OWNED") return "USER_OWNED";
  return isLicenseType(raw) ? raw : "UNKNOWN";
}
