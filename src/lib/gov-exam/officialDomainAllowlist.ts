/**
 * Official recruiting-body / exam portal hosts allowed for source URL registration.
 * Used by ingest-source-document (edge), UI components, and test suites.
 * Subdomains of allowlisted registrable suffixes are accepted when allowSubdomains=true.
 */

export const SOURCE_CLASSIFICATIONS = [
  "official",
  "licensed",
  "authorized_upload",
  "user_private",
  "unsupported",
] as const;

export type SourceClassification = (typeof SOURCE_CLASSIFICATIONS)[number];

export const OFFICIAL_EXAM_DOMAIN_ALLOWLIST = [
  "ssc.gov.in",
  "ssc.nic.in",
  "upsc.gov.in",
  "ibps.in",
  "rrbcdg.gov.in",
  "indianrailways.gov.in",
  "nta.ac.in",
  "ncs.gov.in",
  "employmentnews.gov.in",
] as const;

export type OfficialDomainAllowlistEntry =
  (typeof OFFICIAL_EXAM_DOMAIN_ALLOWLIST)[number];

/** CDN / document hosts that may serve official PDFs (metadata registration only). */
export const OFFICIAL_DOCUMENT_HOST_ALLOWLIST = [
  ...OFFICIAL_EXAM_DOMAIN_ALLOWLIST,
  "cdnbbsr.s3waas.gov.in",
  "documents.upsc.gov.in",
  "static.upsc.gov.in",
  "ibpsonline.ibps.in",
] as const;

/** Unauthorized third-party coaching portals and pirated aggregators (strictly forbidden). */
export const RESTRICTED_COACHING_DOMAINS = [
  "testbook.com",
  "byjus.com",
  "unacademy.com",
  "gradeup.co",
  "adda247.com",
  "careerwill.com",
  "exampundit.in",
  "oliveboard.in",
  "wifistudy.com",
  "guidely.in",
  "shiksha.com",
  "jagranjosh.com",
  "prepp.in",
  "embibe.com",
  "careerpower.in",
] as const;

export function hostnameOf(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function hostMatchesAllowlist(
  hostname: string,
  allowlist: readonly string[],
): boolean {
  const host = hostname.toLowerCase();
  return allowlist.some((entry) => {
    const e = entry.toLowerCase();
    return host === e || host.endsWith(`.${e}`);
  });
}

/**
 * Returns true if the hostname is an unauthorized third-party coaching portal or aggregator.
 */
export function isRestrictedCoachingDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return hostMatchesAllowlist(host, RESTRICTED_COACHING_DOMAINS);
}

/**
 * Returns true when the URL is https and its host is on the official exam allowlist.
 * Does NOT imply permission to download — pilot ingest must not fetch when robots/terms are unknown.
 */
export function isOfficialExamUrlAllowed(
  rawUrl: string,
  dynamicAllowlist?: readonly string[],
): boolean {
  const host = hostnameOf(rawUrl);
  if (!host) return false;
  if (isRestrictedCoachingDomain(host)) return false;
  const list = dynamicAllowlist && dynamicAllowlist.length > 0
    ? dynamicAllowlist
    : OFFICIAL_EXAM_DOMAIN_ALLOWLIST;
  return hostMatchesAllowlist(host, list);
}

/**
 * Broader check for document/CDN hosts (registration / metadata only).
 */
export function isOfficialDocumentUrlAllowed(
  rawUrl: string,
  dynamicAllowlist?: readonly string[],
): boolean {
  const host = hostnameOf(rawUrl);
  if (!host) return false;
  if (isRestrictedCoachingDomain(host)) return false;
  const list = dynamicAllowlist && dynamicAllowlist.length > 0
    ? dynamicAllowlist
    : OFFICIAL_DOCUMENT_HOST_ALLOWLIST;
  return hostMatchesAllowlist(host, list);
}

export function findMatchingApprovedDomain(
  hostname: string,
  allowlist: readonly string[] = OFFICIAL_DOCUMENT_HOST_ALLOWLIST,
): string | null {
  const host = hostname.toLowerCase();
  for (const entry of allowlist) {
    const e = entry.toLowerCase();
    if (host === e || host.endsWith(`.${e}`)) {
      return e;
    }
  }
  return null;
}

/**
 * Classifies a government exam source document into one of 5 strict tiers:
 * - Official: Host is on the approved official government domain allowlist.
 * - Licensed: Legitimate licensed source partner.
 * - Authorized upload: Admin-authorized file upload with proven lineage.
 * - User-private: User's personal upload (not published to bank).
 * - Unsupported: Unknown domain, forbidden coaching portal, or invalid scheme.
 */
export function classifySource(params: {
  url?: string | null;
  uploadType?: "admin" | "user" | "licensed" | null;
  dynamicAllowlist?: readonly string[];
}): {
  classification: SourceClassification;
  approvedDomain: string | null;
  allowedForAutomatedIngest: boolean;
  reason?: string;
} {
  const { url, uploadType, dynamicAllowlist } = params;

  if (uploadType === "licensed") {
    return {
      classification: "licensed",
      approvedDomain: null,
      allowedForAutomatedIngest: true,
    };
  }

  if (uploadType === "admin") {
    return {
      classification: "authorized_upload",
      approvedDomain: null,
      allowedForAutomatedIngest: true,
    };
  }

  if (uploadType === "user") {
    return {
      classification: "user_private",
      approvedDomain: null,
      allowedForAutomatedIngest: false,
      reason: "User-private sources cannot be published to the public question bank.",
    };
  }

  if (!url) {
    return {
      classification: "unsupported",
      approvedDomain: null,
      allowedForAutomatedIngest: false,
      reason: "No source URL or authorized upload payload provided.",
    };
  }

  const host = hostnameOf(url);
  if (!host) {
    return {
      classification: "unsupported",
      approvedDomain: null,
      allowedForAutomatedIngest: false,
      reason: "URL must be a valid HTTPS URL.",
    };
  }

  if (isRestrictedCoachingDomain(host)) {
    return {
      classification: "unsupported",
      approvedDomain: null,
      allowedForAutomatedIngest: false,
      reason: `Automated ingestion from unauthorized coaching portal '${host}' is strictly prohibited.`,
    };
  }

  const allowlist = dynamicAllowlist && dynamicAllowlist.length > 0
    ? dynamicAllowlist
    : OFFICIAL_DOCUMENT_HOST_ALLOWLIST;

  const matchedDomain = findMatchingApprovedDomain(host, allowlist);
  if (matchedDomain) {
    return {
      classification: "official",
      approvedDomain: matchedDomain,
      allowedForAutomatedIngest: true,
    };
  }

  return {
    classification: "unsupported",
    approvedDomain: null,
    allowedForAutomatedIngest: false,
    reason: `Host '${host}' is not on the admin-managed official domain allowlist.`,
  };
}

export function assertOfficialExamUrl(
  rawUrl: string,
  dynamicAllowlist?: readonly string[],
): {
  ok: true;
  hostname: string;
  approvedDomain: string;
} | {
  ok: false;
  code: string;
  message: string;
} {
  const host = hostnameOf(rawUrl);
  if (!host) {
    return {
      ok: false,
      code: "INVALID_URL",
      message: "URL must be a valid https URL.",
    };
  }

  if (isRestrictedCoachingDomain(host)) {
    return {
      ok: false,
      code: "RESTRICTED_COACHING_PORTAL",
      message: `Scraping or ingesting from unauthorized coaching portal '${host}' is strictly prohibited.`,
    };
  }

  const allowlist = dynamicAllowlist && dynamicAllowlist.length > 0
    ? dynamicAllowlist
    : OFFICIAL_EXAM_DOMAIN_ALLOWLIST;

  const matchedDomain = findMatchingApprovedDomain(host, allowlist);
  if (!matchedDomain) {
    return {
      ok: false,
      code: "FORBIDDEN_HOST",
      message: `Host not on official domain allowlist: ${host}`,
    };
  }

  return { ok: true, hostname: host, approvedDomain: matchedDomain };
}
