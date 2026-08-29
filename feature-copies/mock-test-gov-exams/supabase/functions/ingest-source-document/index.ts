/**
 * RETIRED — admin ingest uses extract-question-paper.
 *
 * Replacement: supabase/functions/extract-question-paper
 * UI: src/pages/app/admin/AdminGovIngest.tsx
 */
import { retiredResponse } from "../_shared/retired.ts";

Deno.serve((req) => retiredResponse(req));
