// src/lib/security/index.ts
//
// Central export point for frontend security utilities.
//
// Import from this file instead of importing individual security modules directly.
//
// Example:
// import { sanitizeText, getCSRFHeaders } from "@/lib/security";

export {
  sanitizeHTML,
  sanitizeText,
  sanitizeURL,
  sanitizeMarkdownText,
  sanitizeObject,
  stripControlCharacters,
  sanitizeFileName,
  containsSuspiciousHTML,
  sanitizeAIOutput,
  sanitizeDocumentText,
} from "./sanitizer";

export {
  generateCSRFToken,
  storeCSRFToken,
  getCSRFToken,
  getCSRFTokenCreatedAt,
  clearCSRFToken,
  isCSRFTokenExpired,
  getOrCreateCSRFToken,
  rotateCSRFToken,
  validateCSRFToken,
  getCSRFHeaders,
  getCSRFTokenFromFormData,
  validateCSRFTokenFromFormData,
  getCSRFHiddenInputProps,
} from "./csrf";
