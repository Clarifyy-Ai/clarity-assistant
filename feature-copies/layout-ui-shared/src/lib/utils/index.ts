// ─── Formatters ───────────────────────────────────────────────────────────────
// NOTE: `formatDate` exists in both ./formatters and ./dateUtils. The dateUtils
// version is canonical at the barrel; the formatters version is aliased as
// `formatDateLong` to avoid the name collision. Modules that need the original
// formatters.formatDate should import it directly from "./formatters".
export {
  formatNumber,
  formatDecimal,
  formatPercent,
  clamp,
  formatScore,
  formatScorePercent,
  formatCents,
  formatMonthlyPrice,
  formatUsdAmountAsInr,
  formatUsdCentsAsInr,
  APPROX_USD_INR_RATE,
  formatDate as formatDateLong,
  formatDurationSec,
  formatDurationMs,
  formatDurationSeconds,
  formatDurationProse,
  formatCountdown,
  formatFileSize,
  formatWPM,
  formatVolume,
  formatFillerStat,
  formatCredits,
  formatCreditsRemaining,
  formatList,
  formatCount,
  formatOrdinal,
} from "./formatters";

// ─── Date Utilities ───────────────────────────────────────────────────────────
export * from "./dateUtils";

// ─── String Utilities ─────────────────────────────────────────────────────────
export * from "./stringUtils";

// ─── Array Utilities ──────────────────────────────────────────────────────────
export * from "./arrayUtils";

// ─── Object Utilities ─────────────────────────────────────────────────────────
export * from "./objectUtils";

// ─── URL Utilities ────────────────────────────────────────────────────────────
// NOTE: `getExtension` exists in both ./urlUtils and ./fileUtils. The fileUtils
// version is canonical at the barrel; the urlUtils version is aliased as
// `getUrlExtension`. Modules needing the original should import directly.
export type { QueryParams } from "./urlUtils";
export {
  buildQueryString,
  appendQuery,
  parseQueryString,
  getQueryParam,
  getAllQueryParams,
  setQueryParam,
  parseURL,
  getDomain,
  isExternalURL,
  isValidURL,
  normalizeURL,
  joinPaths,
  getExtension as getUrlExtension,
  getFilename,
  getBasename,
  buildDeepLink,
  buildStorageURL,
  copyToClipboard,
  readFromClipboard,
} from "./urlUtils";

// ─── File Utilities ───────────────────────────────────────────────────────────
export * from "./fileUtils";

// ─── Hash Utilities ───────────────────────────────────────────────────────────
export * from "./hashUtils";
