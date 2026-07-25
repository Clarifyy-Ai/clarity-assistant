/**
 * @deprecated Do not import from this module.
 *
 * Prefer:
 *   - `@/lib/network/fetchEdge` for Edge Function calls
 *   - `@/lib/api/apiClient` for authenticated API requests (CSRF + retries)
 *
 * This file previously duplicated a fetch wrapper (authStore-only) and had
 * zero app importers. Kept as a thin compatibility shim so any accidental
 * barrel re-exports keep resolving without conflicting with `@/lib/api/apiClient`.
 */

export { ApiClientError } from "@/lib/api/apiClient";
export type { HttpMethod } from "@/lib/api/apiClient";
