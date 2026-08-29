import { GOV_EXAM_AFFILIATION_DISCLAIMER } from "@/lib/gov-exam/disclaimers";

/** Compact affiliation disclaimer for gov-exam admin surfaces. */
export function AdminGovDisclaimer() {
  return (
    <p className="text-xs text-muted-foreground border border-border/60 rounded-xl px-3 py-2 bg-muted/20">
      {GOV_EXAM_AFFILIATION_DISCLAIMER}
    </p>
  );
}
