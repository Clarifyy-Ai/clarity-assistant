/** Mirrors src/lib/gov-exam/officialDomainAllowlist.ts for Deno edge. */

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

export const OFFICIAL_DOCUMENT_HOST_ALLOWLIST = [
  ...OFFICIAL_EXAM_DOMAIN_ALLOWLIST,
  "cdnbbsr.s3waas.gov.in",
  "documents.upsc.gov.in",
  "static.upsc.gov.in",
  "ibpsonline.ibps.in",
] as const;

function hostnameOf(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostMatchesAllowlist(
  hostname: string,
  allowlist: readonly string[],
): boolean {
  const host = hostname.toLowerCase();
  return allowlist.some((entry) => {
    const e = entry.toLowerCase();
    return host === e || host.endsWith(`.${e}`);
  });
}

export function isOfficialExamUrlAllowed(rawUrl: string): boolean {
  const host = hostnameOf(rawUrl);
  if (!host) return false;
  return hostMatchesAllowlist(host, OFFICIAL_EXAM_DOMAIN_ALLOWLIST);
}

export function isOfficialDocumentUrlAllowed(rawUrl: string): boolean {
  const host = hostnameOf(rawUrl);
  if (!host) return false;
  return hostMatchesAllowlist(host, OFFICIAL_DOCUMENT_HOST_ALLOWLIST);
}

export function assertOfficialExamUrl(rawUrl: string): {
  ok: true;
  hostname: string;
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
  if (!hostMatchesAllowlist(host, OFFICIAL_EXAM_DOMAIN_ALLOWLIST)) {
    return {
      ok: false,
      code: "FORBIDDEN_HOST",
      message: `Host not on official domain allowlist: ${host}`,
    };
  }
  return { ok: true, hostname: host };
}
