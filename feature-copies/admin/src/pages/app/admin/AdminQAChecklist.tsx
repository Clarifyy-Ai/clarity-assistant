import { ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";

/**
 * QA tracking is not a production control. Do not persist checklist status in
 * localStorage or present this page as live ops.
 */
export default function AdminQAChecklist() {
  return (
    <div className="max-w-xl space-y-4" data-testid="admin-qa-checklist">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-xl font-bold text-foreground">QA Checklist</h1>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-foreground">
            QA tracking is not a production control.
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Browser-local checklists are not operations status and are not shared
            across admins or devices. Use CI, issue tracking, and staged releases
            for launch quality — not this page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
