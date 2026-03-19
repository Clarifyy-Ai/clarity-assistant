// ─── Formatters ───────────────────────────────────────────────────────────────
export {
  formatNumber, formatCompact, formatPercent, formatScore,
  clamp, roundTo,
  formatCents, formatYearlySaving,
  formatDurationMs, formatDurationSec, formatDurationHuman, formatSessionLength,
  formatFileSize,
  formatWPM, formatRMS, formatFillerCount,
  formatCredits, formatCreditBalance,
  truncate, truncateWords, getInitials, ordinal, pluralise,
} from "./formatters";

// ─── Date Utilities ───────────────────────────────────────────────────────────
export {
  timeAgo, timeUntil, relativeTime,
  formatDate, formatDateLong, formatTime, formatDateTime,
  formatISODate, formatCalendarDate,
  isSameDay, isToday, isTomorrow, isYesterday,
  isThisWeek, isThisYear, isPast, isFuture,
  addDays, addHours, addMinutes, addMonths,
  startOfDay, endOfDay, startOfWeek, startOfMonth,
  getLast7Days, getLast30Days, getLast90Days,
  isInRange, daysBetween,
  smartDate, formatInterviewDate,
  nowISO, toUnixSeconds, fromUnixSeconds,
} from "./dateUtils";

export type { DateLike, DateRange } from "./dateUtils";

// ─── String Utilities ─────────────────────────────────────────────────────────
export {
  capitalize, titleCase, camelToTitle, snakeToTitle,
  toKebabCase, toSnakeCase, toCamelCase,
  stripHTML, escapeHTML, alphanumericOnly, normalizeWhitespace,
  FILLER_WORDS, removeFillers, countFillers, totalFillerCount,
  wordCount, sentenceCount, charCount,
  averageWordLength, estimateReadingTime, estimateSpeakingTime,
  fuzzyMatch, matchScore, highlight, escapeRegex,
  extractEmails, extractURLs, extractHashtags, parseTags,
  generateUUID, generateShortId, slugify,
} from "./stringUtils";

// ─── Array Utilities ──────────────────────────────────────────────────────────
export {
  unique, uniqueBy,
  groupBy, countBy,
  sortBy, sortByMultiple,
  chunk, paginate,
  searchFilter,
  intersection, difference, union,
  sum, average, median, minMax, standardDeviation,
  sample, shuffle, flat, moveItem, toggleItem,
  isNonEmpty, tail, head,
} from "./arrayUtils";

export type { PaginatedResult } from "./arrayUtils";

// ─── Object Utilities ─────────────────────────────────────────────────────────
export {
  pick, omit,
  deepClone, shallowClone,
  deepMerge,
  shallowDiff, shallowEqual, deepEqual,
  flattenObject, unflattenObject,
  compactObject, compactFalsy, isEmpty,
  getNestedValue, setNestedValue,
  mapValues, mapKeys, filterObject, invertObject,
} from "./objectUtils";

// ─── URL Utilities ────────────────────────────────────────────────────────────
export {
  buildQueryString, appendQuery, parseQueryString,
  getQueryParam, getAllQueryParams, setQueryParam,
  parseURL, getDomain, isExternalURL, isValidURL, normalizeURL,
  joinPaths, getExtension, getFilename, getBasename,
  buildDeepLink, buildStorageURL,
  copyToClipboard, readFromClipboard,
} from "./urlUtils";

// ─── File Utilities ───────────────────────────────────────────────────────────
export {
  MIME_TYPES, getMimeType,
  isImageFile, isPDFFile, isDocumentFile,
  readFileAsText, readFileAsDataURL, readFileAsArrayBuffer,
  blobToBase64, base64ToBlob, blobToArrayBuffer, arrayBufferToBlob,
  float32ToWAVBlob,
  downloadBlob, downloadDataURL, downloadText, downloadJSON, downloadCSV,
  canvasToBlob, resizeImage,
} from "./fileUtils";

// ─── Hash Utilities ───────────────────────────────────────────────────────────
export {
  fnv1a, numericHash,
  sha256, sha256Buffer, shortHash,
  promptCacheKey, documentCacheKey, fileFingerprint,
  stableId, objectHash,
  hmacSHA256,
  adler32,
  generateETag,
} from "./hashUtils";
