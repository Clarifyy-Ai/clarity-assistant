/**
 * Government Exam Source Collection and Ingestion Pipeline.
 *
 * Implements:
 * - Domain policy and unauthorized coaching portal checks
 * - Circuit breaker per domain
 * - Identifiable user-agent
 * - Redirect validation to approved domains only
 * - Download timeout and size limit enforcement
 * - Magic bytes MIME signature validation & executable rejection
 * - SHA-256 calculation & duplicate detection
 * - ETag/Last-Modified change detection
 * - Multi-strategy semantic HTML link discovery with missing link detection
 * - Provenance preservation with review-gated publication
 */

import {
  classifySource,
  isOfficialDocumentUrlAllowed,
  isOfficialExamUrlAllowed,
  isRestrictedCoachingDomain,
  type SourceClassification,
} from "./officialDomainAllowlist";

export const COLLECTOR_USER_AGENT =
  "CareerPilot-GovExamBot/1.0 (+https://clarify.ai/bot; contact@clarify.ai)";

export const DEFAULT_MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024; // 50MB
export const DEFAULT_TIMEOUT_MS = 20000; // 20s
export const DEFAULT_MAX_RETRIES = 3;

export type CollectorFailureCode =
  | "INVALID_URL"
  | "FORBIDDEN_HOST"
  | "RESTRICTED_COACHING_PORTAL"
  | "REDIRECT_FORBIDDEN_HOST"
  | "DOWNLOAD_TIMEOUT"
  | "SIZE_LIMIT_EXCEEDED"
  | "UNEXPECTED_EXECUTABLE_CONTENT"
  | "INVALID_MIME_SIGNATURE"
  | "DUPLICATE_SOURCE"
  | "CIRCUIT_BREAKER_OPEN"
  | "MALFORMED_DOCUMENT"
  | "MISSING_EXPECTED_LINKS"
  | "FETCH_FAILED"
  | "NOT_MODIFIED";

export interface RetrievalEvidence {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  etag?: string | null;
  lastModified?: string | null;
  contentType?: string | null;
  contentLength?: number | null;
  fileHash: string;
  byteSize: number;
  retrievedAt: string;
  userAgent: string;
}

export interface CollectorResult {
  ok: boolean;
  code?: CollectorFailureCode;
  message?: string;
  evidence?: RetrievalEvidence;
  payload?: Uint8Array;
  isDuplicate?: boolean;
  isNotModified?: boolean;
  classification?: SourceClassification;
  approvedDomain?: string | null;
}

export interface DiscoveredLink {
  url: string;
  title: string;
  examName?: string;
  year?: number;
  stage?: string;
  shift?: string;
  documentType: "previous_paper" | "answer_key" | "syllabus" | "notification" | "corrigendum";
  matchedDomain: string;
}

/**
 * Per-domain Circuit Breaker to protect government servers and prevent infinite retry loops.
 */
export class CircuitBreaker {
  private failures: Map<string, number> = new Map();
  private lastFailureTime: Map<string, number> = new Map();
  private state: Map<string, "CLOSED" | "OPEN" | "HALF_OPEN"> = new Map();

  constructor(
    public readonly failureThreshold: number = 3,
    public readonly cooldownMs: number = 30000,
  ) {}

  public canAttempt(domain: string): boolean {
    const d = domain.toLowerCase();
    const currentState = this.state.get(d) || "CLOSED";
    if (currentState === "CLOSED") return true;

    const lastFail = this.lastFailureTime.get(d) || 0;
    const elapsed = Date.now() - lastFail;

    if (elapsed > this.cooldownMs) {
      this.state.set(d, "HALF_OPEN");
      return true;
    }
    return false;
  }

  public recordSuccess(domain: string): void {
    const d = domain.toLowerCase();
    this.failures.set(d, 0);
    this.state.set(d, "CLOSED");
  }

  public recordFailure(domain: string): void {
    const d = domain.toLowerCase();
    const count = (this.failures.get(d) || 0) + 1;
    this.failures.set(d, count);
    this.lastFailureTime.set(d, Date.now());

    if (count >= this.failureThreshold) {
      this.state.set(d, "OPEN");
    }
  }

  public getDomainState(domain: string): "CLOSED" | "OPEN" | "HALF_OPEN" {
    return this.state.get(domain.toLowerCase()) || "CLOSED";
  }

  public reset(domain?: string): void {
    if (domain) {
      const d = domain.toLowerCase();
      this.failures.delete(d);
      this.lastFailureTime.delete(d);
      this.state.delete(d);
    } else {
      this.failures.clear;
      this.lastFailureTime.clear();
      this.state.clear();
    }
  }
}

export const globalCircuitBreaker = new CircuitBreaker();

/**
 * Validates magic byte signatures and explicitly rejects executable payloads.
 */
export function validateMagicBytes(bytes: Uint8Array): {
  ok: boolean;
  mime: string;
  isExecutable: boolean;
  error?: string;
} {
  if (!bytes || bytes.length < 4) {
    return {
      ok: false,
      mime: "application/octet-stream",
      isExecutable: false,
      error: "Payload too small to verify magic bytes",
    };
  }

  // Check for executable binaries
  // MZ header (Windows PE / EXE / DLL)
  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    return {
      ok: false,
      mime: "application/x-dosexec",
      isExecutable: true,
      error: "Unexpected executable binary (PE/MZ header detected).",
    };
  }

  // ELF header (Linux ELF binary)
  if (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) {
    return {
      ok: false,
      mime: "application/x-elf",
      isExecutable: true,
      error: "Unexpected executable binary (ELF header detected).",
    };
  }

  // Mach-O / Java bytecode
  if (bytes[0] === 0xca && bytes[1] === 0xfe && bytes[2] === 0xba && bytes[3] === 0xbe) {
    return {
      ok: false,
      mime: "application/x-mach-binary",
      isExecutable: true,
      error: "Unexpected executable binary (Mach-O / Java header detected).",
    };
  }

  // Script hash-bang `#!`
  if (bytes[0] === 0x23 && bytes[1] === 0x21) {
    return {
      ok: false,
      mime: "text/x-shellscript",
      isExecutable: true,
      error: "Unexpected executable script (shebang detected).",
    };
  }

  // PDF signature: `%PDF-`
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return {
      ok: true,
      mime: "application/pdf",
      isExecutable: false,
    };
  }

  // HTML signature: `<!DO` or `<htm`
  const headerStr = new TextDecoder().decode(bytes.slice(0, 32)).toLowerCase().trim();
  if (headerStr.startsWith("<!doctype html") || headerStr.startsWith("<html")) {
    return {
      ok: true,
      mime: "text/html",
      isExecutable: false,
    };
  }

  // JSON signature: `{` or `[`
  if (headerStr.startsWith("{") || headerStr.startsWith("[")) {
    return {
      ok: true,
      mime: "application/json",
      isExecutable: false,
    };
  }

  return {
    ok: true,
    mime: "application/octet-stream",
    isExecutable: false,
  };
}

/**
 * Computes SHA-256 hex digest of a byte array using Web Crypto API.
 */
export async function calculateSha256(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Discovers official links from HTML using multiple semantic selector strategies.
 */
export function discoverSemanticLinks(
  html: string,
  baseUrl: string,
  options?: {
    targetExamName?: string;
    targetYear?: number;
    dynamicAllowlist?: readonly string[];
  },
): {
  discovered: DiscoveredLink[];
  missingExpectedLinks: boolean;
  reason?: string;
} {
  const discovered: DiscoveredLink[] = [];
  const seenUrls = new Set<string>();

  const yearRegex = /(20\d{2}|19\d{2})/;
  const stageRegex = /(tier[-\s]?[i|1|ii|2]|prelims|mains|cbt[-\s]?[1|2]|session\s*[1|2]|shift\s*\d+)/i;
  const answerKeyRegex = /answer\s*key|response\s*sheet|solution/i;
  const syllabusRegex = /syllabus|curriculum|scheme/i;
  const notificationRegex = /notification|notice|advertisement/i;

  // Strategy 1: Table row context parsing
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const rowHtml = trMatch[1];
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch: RegExpExecArray | null;

    while ((aMatch = aRegex.exec(rowHtml)) !== null) {
      const rawHref = aMatch[1].trim();
      const anchorText = aMatch[2].replace(/<[^>]+>/g, "").trim();
      const rowText = rowHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      try {
        const resolved = new URL(rawHref, baseUrl).href;
        if (seenUrls.has(resolved)) continue;

        const classification = classifySource({
          url: resolved,
          dynamicAllowlist: options?.dynamicAllowlist,
        });

        if (!classification.allowedForAutomatedIngest || !classification.approvedDomain) {
          continue;
        }

        const combinedText = `${rowText} ${anchorText}`;
        const ym = combinedText.match(yearRegex);
        const year = ym ? parseInt(ym[1], 10) : undefined;

        if (options?.targetYear && year && year !== options.targetYear) {
          continue;
        }

        const stageMatch = combinedText.match(stageRegex);
        const stage = stageMatch ? stageMatch[0] : undefined;

        let docType: DiscoveredLink["documentType"] = "previous_paper";
        if (answerKeyRegex.test(combinedText)) docType = "answer_key";
        else if (syllabusRegex.test(combinedText)) docType = "syllabus";
        else if (notificationRegex.test(combinedText)) docType = "notification";

        const isGenericDownload = !anchorText || /^download(\s*\([\d.]+\s*[kmg]b\))?$/i.test(anchorText) || /^click\s*here$/i.test(anchorText) || /^pdf$/i.test(anchorText);
        const resolvedTitle = isGenericDownload ? (rowText.slice(0, 150) || anchorText) : anchorText;

        seenUrls.add(resolved);
        discovered.push({
          url: resolved,
          title: resolvedTitle,
          examName: options?.targetExamName,
          year,
          stage,
          documentType: docType,
          matchedDomain: classification.approvedDomain,
        });
      } catch {
        // invalid URL
      }
    }
  }

  // Strategy 2: List item context parsing `<li>`
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch: RegExpExecArray | null;

  while ((liMatch = liRegex.exec(html)) !== null) {
    const liHtml = liMatch[1];
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch: RegExpExecArray | null;

    while ((aMatch = aRegex.exec(liHtml)) !== null) {
      const rawHref = aMatch[1].trim();
      const anchorText = aMatch[2].replace(/<[^>]+>/g, "").trim();
      const liText = liHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      try {
        const resolved = new URL(rawHref, baseUrl).href;
        if (seenUrls.has(resolved)) continue;

        const classification = classifySource({
          url: resolved,
          dynamicAllowlist: options?.dynamicAllowlist,
        });

        if (!classification.allowedForAutomatedIngest || !classification.approvedDomain) {
          continue;
        }

        const combinedText = `${liText} ${anchorText}`;
        const ym = combinedText.match(yearRegex);
        const year = ym ? parseInt(ym[1], 10) : undefined;

        if (options?.targetYear && year && year !== options.targetYear) {
          continue;
        }

        const stageMatch = combinedText.match(stageRegex);
        const stage = stageMatch ? stageMatch[0] : undefined;

        let docType: DiscoveredLink["documentType"] = "previous_paper";
        if (answerKeyRegex.test(combinedText)) docType = "answer_key";
        else if (syllabusRegex.test(combinedText)) docType = "syllabus";
        else if (notificationRegex.test(combinedText)) docType = "notification";

        const isGenericDownload = !anchorText || /^download(\s*\([\d.]+\s*[kmg]b\))?$/i.test(anchorText) || /^click\s*here$/i.test(anchorText) || /^pdf$/i.test(anchorText);
        const resolvedTitle = isGenericDownload ? (liText.slice(0, 150) || anchorText) : anchorText;

        seenUrls.add(resolved);
        discovered.push({
          url: resolved,
          title: resolvedTitle,
          examName: options?.targetExamName,
          year,
          stage,
          documentType: docType,
          matchedDomain: classification.approvedDomain,
        });
      } catch {
        // ignore
      }
    }
  }

  // Strategy 3: Notice/Card container parsing (`<div class="notice-item">`, `<article>`, etc.)
  const divRegex = /<(div|article|section)[^>]*class=["'][^"']*(notice|download|item|card|entry)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;
  let divMatch: RegExpExecArray | null;

  while ((divMatch = divRegex.exec(html)) !== null) {
    const blockHtml = divMatch[3];
    const aRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let aMatch: RegExpExecArray | null;

    while ((aMatch = aRegex.exec(blockHtml)) !== null) {
      const rawHref = aMatch[1].trim();
      const anchorText = aMatch[2].replace(/<[^>]+>/g, "").trim();
      const blockText = blockHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

      try {
        const resolved = new URL(rawHref, baseUrl).href;
        if (seenUrls.has(resolved)) continue;

        const classification = classifySource({
          url: resolved,
          dynamicAllowlist: options?.dynamicAllowlist,
        });

        if (!classification.allowedForAutomatedIngest || !classification.approvedDomain) {
          continue;
        }

        const combinedText = `${blockText} ${anchorText} ${resolved}`;
        const ym = combinedText.match(yearRegex);
        const year = ym ? parseInt(ym[1], 10) : undefined;

        if (options?.targetYear && year && year !== options.targetYear) {
          continue;
        }

        const stageMatch = combinedText.match(stageRegex);
        const stage = stageMatch ? stageMatch[0] : undefined;

        let docType: DiscoveredLink["documentType"] = "previous_paper";
        if (answerKeyRegex.test(combinedText)) docType = "answer_key";
        else if (syllabusRegex.test(combinedText)) docType = "syllabus";
        else if (notificationRegex.test(combinedText)) docType = "notification";

        seenUrls.add(resolved);
        discovered.push({
          url: resolved,
          title: anchorText || blockText.slice(0, 100),
          examName: options?.targetExamName,
          year,
          stage,
          documentType: docType,
          matchedDomain: classification.approvedDomain,
        });
      } catch {
        // ignore
      }
    }
  }

  // Strategy 4: General anchor matching with PDF filter
  const generalARegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let gMatch: RegExpExecArray | null;

  while ((gMatch = generalARegex.exec(html)) !== null) {
    const rawHref = gMatch[1].trim();
    const anchorText = gMatch[2].replace(/<[^>]+>/g, "").trim();

    try {
      const resolved = new URL(rawHref, baseUrl).href;
      if (seenUrls.has(resolved)) continue;

      if (!resolved.toLowerCase().endsWith(".pdf") && !resolved.toLowerCase().includes(".pdf?")) {
        continue;
      }

      const classification = classifySource({
        url: resolved,
        dynamicAllowlist: options?.dynamicAllowlist,
      });

      if (!classification.allowedForAutomatedIngest || !classification.approvedDomain) {
        continue;
      }

      const combinedText = `${anchorText} ${resolved}`;
      const ym = combinedText.match(yearRegex);
      const year = ym ? parseInt(ym[1], 10) : undefined;
      if (options?.targetYear && year && year !== options.targetYear) {
        continue;
      }

      const stageMatch = combinedText.match(stageRegex);
      const stage = stageMatch ? stageMatch[0] : undefined;

      seenUrls.add(resolved);
      discovered.push({
        url: resolved,
        title: anchorText || "Official Document",
        examName: options?.targetExamName,
        year,
        stage,
        documentType: answerKeyRegex.test(combinedText) ? "answer_key" : "previous_paper",
        matchedDomain: classification.approvedDomain,
      });
    } catch {
      // ignore
    }
  }

  const missingExpectedLinks = discovered.length === 0;
  return {
    discovered,
    missingExpectedLinks,
    reason: missingExpectedLinks
      ? "No allowlisted official examination links or PDFs found in provided HTML."
      : undefined,
  };
}

/**
 * Executes safe, audited, rate-limited collection of an official source document.
 */
export async function collectSourceDocument(
  url: string,
  options: {
    dynamicAllowlist?: readonly string[];
    etag?: string | null;
    lastModified?: string | null;
    previousHash?: string | null;
    maxBytes?: number;
    timeoutMs?: number;
    maxRetries?: number;
    circuitBreaker?: CircuitBreaker;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<CollectorResult> {
  const fetchFn = options.fetchImpl || fetch;
  const cb = options.circuitBreaker || globalCircuitBreaker;
  const maxBytes = options.maxBytes || DEFAULT_MAX_DOWNLOAD_BYTES;
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries || DEFAULT_MAX_RETRIES;

  // Step 1: Validate domain and source policy
  const initialClass = classifySource({
    url,
    dynamicAllowlist: options.dynamicAllowlist,
  });

  if (!initialClass.allowedForAutomatedIngest || !initialClass.approvedDomain) {
    return {
      ok: false,
      code: isRestrictedCoachingDomain(new URL(url).hostname)
        ? "RESTRICTED_COACHING_PORTAL"
        : "FORBIDDEN_HOST",
      message: initialClass.reason || "Domain not authorized for automated collection.",
      classification: initialClass.classification,
    };
  }

  const domain = initialClass.approvedDomain;

  // Step 2: Check Circuit Breaker
  if (!cb.canAttempt(domain)) {
    return {
      ok: false,
      code: "CIRCUIT_BREAKER_OPEN",
      message: `Circuit breaker is OPEN for domain '${domain}' due to consecutive failures.`,
    };
  }

  // Step 3: Bounded retry loop with timeout & redirect protection
  let attempt = 0;
  let lastError: Error | null = null;

  while (attempt < maxRetries) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = {
        "User-Agent": COLLECTOR_USER_AGENT,
        Accept: "application/pdf, text/html, application/json, */*",
      };

      if (options.etag) headers["If-None-Match"] = options.etag;
      if (options.lastModified) headers["If-Modified-Since"] = options.lastModified;

      const response = await fetchFn(url, {
        method: "GET",
        headers,
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);

      // Handle 304 Not Modified
      if (response.status === 304) {
        cb.recordSuccess(domain);
        return {
          ok: true,
          isNotModified: true,
          code: "NOT_MODIFIED",
          evidence: {
            requestedUrl: url,
            finalUrl: response.url || url,
            statusCode: 304,
            etag: response.headers.get("etag"),
            lastModified: response.headers.get("last-modified"),
            fileHash: options.previousHash || "",
            byteSize: 0,
            retrievedAt: new Date().toISOString(),
            userAgent: COLLECTOR_USER_AGENT,
          },
        };
      }

      // Step 4: Validate redirected destination
      const finalUrl = response.url || url;
      if (finalUrl !== url) {
        const finalClass = classifySource({
          url: finalUrl,
          dynamicAllowlist: options.dynamicAllowlist,
        });
        if (!finalClass.allowedForAutomatedIngest) {
          cb.recordFailure(domain);
          return {
            ok: false,
            code: "REDIRECT_FORBIDDEN_HOST",
            message: `Redirect destination '${finalUrl}' is not on the approved domain allowlist.`,
          };
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Step 5: Check Content-Length size limit if provided
      const clHeader = response.headers.get("content-length");
      if (clHeader) {
        const cl = parseInt(clHeader, 10);
        if (cl > maxBytes) {
          cb.recordFailure(domain);
          return {
            ok: false,
            code: "SIZE_LIMIT_EXCEEDED",
            message: `Content length ${cl} exceeds maximum limit of ${maxBytes} bytes.`,
          };
        }
      }

      // Read stream / buffer with live byte limit
      const arrayBuffer = await response.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      if (bytes.length > maxBytes) {
        cb.recordFailure(domain);
        return {
          ok: false,
          code: "SIZE_LIMIT_EXCEEDED",
          message: `Downloaded ${bytes.length} bytes exceeding limit of ${maxBytes}.`,
        };
      }

      // Step 6: Magic byte MIME verification & executable rejection
      const magicCheck = validateMagicBytes(bytes);
      if (magicCheck.isExecutable) {
        cb.recordFailure(domain);
        return {
          ok: false,
          code: "UNEXPECTED_EXECUTABLE_CONTENT",
          message: magicCheck.error || "Unexpected executable binary rejected.",
        };
      }

      // Step 7: SHA-256 & Duplicate check
      const fileHash = await calculateSha256(bytes);
      const isDuplicate = Boolean(options.previousHash && options.previousHash === fileHash);

      cb.recordSuccess(domain);

      const evidence: RetrievalEvidence = {
        requestedUrl: url,
        finalUrl,
        statusCode: response.status,
        etag: response.headers.get("etag"),
        lastModified: response.headers.get("last-modified"),
        contentType: response.headers.get("content-type"),
        contentLength: bytes.length,
        fileHash,
        byteSize: bytes.length,
        retrievedAt: new Date().toISOString(),
        userAgent: COLLECTOR_USER_AGENT,
      };

      return {
        ok: true,
        payload: bytes,
        evidence,
        isDuplicate,
        classification: initialClass.classification,
        approvedDomain: domain,
      };
    } catch (err) {
      clearTimeout(timer);
      lastError = err instanceof Error ? err : new Error(String(err));

      if (lastError.name === "AbortError") {
        cb.recordFailure(domain);
        return {
          ok: false,
          code: "DOWNLOAD_TIMEOUT",
          message: `Request timed out after ${timeoutMs}ms.`,
        };
      }

      // Exponential backoff before next attempt
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 50));
      }
    }
  }

  cb.recordFailure(domain);
  return {
    ok: false,
    code: "FETCH_FAILED",
    message: lastError ? lastError.message : "Failed to fetch source after maximum retries.",
  };
}
