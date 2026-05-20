// src/lib/security/sanitizer.ts
//
// Centralized frontend sanitization utilities.
// Use these helpers before rendering or storing user-generated content.
//
// SECURITY PURPOSE:
// - Prevent XSS through user-controlled HTML/text
// - Remove script tags, event handlers, unsafe URLs
// - Provide safe utilities for forms, AI output, resumes, notes, and rich text

import DOMPurify from "dompurify";

const ALLOWED_HTML_TAGS = [
  "b",
  "strong",
  "i",
  "em",
  "u",
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "span",
  "a",
];

const ALLOWED_HTML_ATTRIBUTES = ["href", "target", "rel", "title"];

const SAFE_URL_PROTOCOLS = ["http:", "https:", "mailto:"];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Sanitizes limited rich HTML.
 *
 * Use this only when you intentionally allow basic formatting like:
 * bold, italic, paragraphs, lists, links.
 */
export function sanitizeHTML(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "";
  }

  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: ALLOWED_HTML_TAGS,
    ALLOWED_ATTR: ALLOWED_HTML_ATTRIBUTES,

    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option",
      "meta",
      "link",
      "base",
      "svg",
      "math",
    ],

    FORBID_ATTR: [
      "onerror",
      "onload",
      "onclick",
      "onmouseover",
      "onfocus",
      "onblur",
      "onchange",
      "onsubmit",
      "style",
      "srcdoc",
    ],

    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitizes plain text by removing all HTML tags.
 *
 * Use this for normal user input:
 * names, job titles, notes, answers, resume text, company names, etc.
 */
export function sanitizeText(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "";
  }

  const withoutHtml = DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });

  return withoutHtml.trim();
}

/**
 * Sanitizes a URL before using it in href/src-like fields.
 *
 * Blocks dangerous protocols like:
 * javascript:
 * data:
 * vbscript:
 */
export function sanitizeURL(input: string): string {
  if (typeof input !== "string" || input.trim().length === 0) {
    return "";
  }

  try {
    const url = new URL(input.trim(), window.location.origin);

    if (!SAFE_URL_PROTOCOLS.includes(url.protocol)) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

/**
 * Sanitizes user-generated Markdown-like text as plain text.
 *
 * This does NOT render markdown.
 * It only removes dangerous HTML while preserving readable content.
 */
export function sanitizeMarkdownText(input: string): string {
  return sanitizeText(input);
}

/**
 * Recursively sanitizes unknown JSON-like data.
 *
 * Useful before:
 * - saving form data
 * - sending payloads
 * - rendering API responses
 * - processing AI output
 */
export function sanitizeObject<T>(input: T): T {
  if (typeof input === "string") {
    return sanitizeText(input) as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) => sanitizeObject(item)) as T;
  }

  if (isPlainObject(input)) {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeObject(value);
    }

    return sanitized as T;
  }

  return input;
}

/**
 * Removes unsafe control characters from text.
 *
 * Useful for:
 * - filenames
 * - labels
 * - short identifiers
 */
export function stripControlCharacters(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  return input.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}

/**
 * Sanitizes a filename for local display/upload metadata.
 *
 * This does not validate file content.
 * File content validation must happen separately.
 */
export function sanitizeFileName(input: string): string {
  const cleaned = stripControlCharacters(input);

  return cleaned
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
}

/**
 * Basic suspicious content detector.
 *
 * This should NOT be your only security control.
 * Use it for warnings, audit logs, or rejecting obviously malicious input.
 */
export function containsSuspiciousHTML(input: string): boolean {
  if (typeof input !== "string" || input.length === 0) {
    return false;
  }

  const suspiciousPatterns = [
    /<script/i,
    /<\/script/i,
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /onerror\s*=/i,
    /onload\s*=/i,
    /onclick\s*=/i,
    /srcdoc\s*=/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /<svg/i,
    /<math/i,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Sanitizes AI-generated text before rendering.
 *
 * AI output should be treated as untrusted user-controlled content.
 */
export function sanitizeAIOutput(input: string): string {
  return sanitizeHTML(input);
}

/**
 * Sanitizes resume/JD extracted text.
 *
 * Resume and PDF content must be treated as untrusted.
 */
export function sanitizeDocumentText(input: string): string {
  return sanitizeText(input).slice(0, 100_000);
}
