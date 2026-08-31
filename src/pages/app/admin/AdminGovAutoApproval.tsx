import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ShieldCheck, Loader2 } from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import {
  listAutoApprovalRules,
  updateAutoApprovalRule,
  createAutoApprovalRuleVersion,
  type AutoApprovalRuleRow,
} from "@/lib/gov-exam/adminOps";

function RuleCard({ rule, onSaved }: { rule: AutoApprovalRuleRow; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [autoPublish, setAutoPublish] = useState(rule.auto_publish);
  const [minQuality, setMinQuality] = useState(String(rule.min_quality_score));
  const [allowVerifiedPublic, setAllowVerifiedPublic] = useState(rule.allow_verified_public);
  const [allowAiPractice, setAllowAiPractice] = useState(rule.allow_ai_generated_practice);

  async function save() {
    setBusy(true);
    const { error } = await updateAutoApprovalRule(
      rule.id,
      {
        enabled,
        auto_publish: autoPublish,
        min_quality_score: Number(minQuality) || 0.72,
        allow_verified_public: allowVerifiedPublic,
        allow_ai_generated_practice: allowAiPractice,
      },
      rule,
    );
    setBusy(false);
    if (error) toast.error(error);
    else {
      toast.success(`Rule v${rule.rule_version} updated`);
      onSaved();
    }
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium capitalize">{rule.entity_type} rules</h3>
          <p className="text-sm text-muted-foreground">Version {rule.rule_version}</p>
        </div>
        <Badge variant={enabled ? "default" : "secondary"}>
          {enabled ? "enabled" : "disabled"}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center justify-between">
          <Label htmlFor={`enabled-${rule.id}`}>Auto-approval enabled</Label>
          <Switch id={`enabled-${rule.id}`} checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`publish-${rule.id}`}>Auto-publish (when approved)</Label>
          <Switch id={`publish-${rule.id}`} checked={autoPublish} onCheckedChange={setAutoPublish} />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`verified-${rule.id}`}>Allow verified public source</Label>
          <Switch
            id={`verified-${rule.id}`}
            checked={allowVerifiedPublic}
            onCheckedChange={setAllowVerifiedPublic}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor={`ai-${rule.id}`}>Allow AI-generated practice</Label>
          <Switch
            id={`ai-${rule.id}`}
            checked={allowAiPractice}
            onCheckedChange={setAllowAiPractice}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`quality-${rule.id}`}>Minimum quality score</Label>
          <Input
            id={`quality-${rule.id}`}
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={minQuality}
            onChange={(e) => setMinQuality(e.target.value)}
          />
        </div>
      </div>

      {rule.notes && (
        <p className="text-xs text-muted-foreground">{rule.notes}</p>
      )}

      <Button size="sm" onClick={() => void save()} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save rule"}
      </Button>
    </Card>
  );
}

export default function AdminGovAutoApproval() {
  const [rules, setRules] = useState<AutoApprovalRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await listAutoApprovalRules();
    if (error) toast.error(error);
    setRules(data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function newVersion(entityType: "question" | "paper") {
    setCreating(entityType);
    const latest = rules.find((r) => r.entity_type === entityType);
    const { id, error } = await createAutoApprovalRuleVersion(entityType, {
      min_quality_score: latest?.min_quality_score ?? 0.72,
      duplicate_threshold: latest?.duplicate_threshold ?? 0.92,
      allowed_source_types: latest?.allowed_source_types,
      allow_verified_public: latest?.allow_verified_public ?? false,
      allow_internal_bank: latest?.allow_internal_bank ?? true,
      allow_generated_practice: latest?.allow_generated_practice ?? true,
      allow_ai_generated_practice: latest?.allow_ai_generated_practice ?? true,
      require_provenance: latest?.require_provenance ?? true,
    });
    setCreating(null);
    if (error) toast.error(error);
    else {
      toast.success(`Created rule version for ${entityType}`);
      void load();
    }
    return id;
  }

  const questionRule = rules.find((r) => r.entity_type === "question");
  const paperRule = rules.find((r) => r.entity_type === "paper");

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Auto-approval policy"
        description="Configure deterministic, rule-based auto-approval. Disabled by default — never blindly publishes."
        icon={<ShieldCheck className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <strong>Policy:</strong> Auto-approval is deterministic and rule-based. AI never decides
        approval. APPROVED ≠ PUBLISHED unless auto-publish is explicitly enabled. Engine failures
        route to manual review — never silently approved.
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {questionRule && <RuleCard rule={questionRule} onSaved={load} />}
          {paperRule && <RuleCard rule={paperRule} onSaved={load} />}

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={creating === "question"}
              onClick={() => void newVersion("question")}
            >
              New question rule version
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={creating === "paper"}
              onClick={() => void newVersion("paper")}
            >
              New paper rule version
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
