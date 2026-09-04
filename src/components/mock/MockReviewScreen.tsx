import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import type { InterviewContextSnapshot } from "@/lib/mock/interviewContext";
import { getInterviewerVoice } from "@/lib/mock/interviewerVoiceCatalog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type MockReviewScreenProps = {
  snapshot: InterviewContextSnapshot;
  warmup: boolean;
  /** Display credit cost; mock is often free within daily allowance. */
  creditCostLabel?: string;
  loading?: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

export function MockReviewScreen({
  snapshot,
  warmup,
  creditCostLabel,
  loading,
  onBack,
  onConfirm,
}: MockReviewScreenProps) {
  const voice = getInterviewerVoice(snapshot.voice_id);
  const cost =
    creditCostLabel ??
    `Free within daily mock allowance · ${AI_CREDIT_COSTS.mock_session} cr if billed`;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Role", value: snapshot.role || "—" },
    { label: "Company", value: snapshot.company || "—" },
    { label: "Interview type", value: snapshot.interview_type || "—" },
    { label: "Experience", value: snapshot.experience_level || "—" },
    { label: "Questions", value: String(snapshot.planned_question_count) },
    { label: "Duration", value: `${snapshot.duration_minutes} min` },
    {
      label: "Resume",
      value: snapshot.resume_id
        ? `Selected (${snapshot.resume_hash.slice(0, 8)})`
        : snapshot.resume_text
          ? "Pasted / loaded text"
          : "None",
    },
    {
      label: "Job description",
      value: snapshot.jd_id
        ? `Selected (${snapshot.jd_hash.slice(0, 8)})`
        : snapshot.jd_text
          ? "Provided"
          : "None",
    },
    { label: "Voice", value: voice.label },
    { label: "Language", value: snapshot.language },
    { label: "Difficulty", value: snapshot.difficulty },
    { label: "Input mode", value: snapshot.input_mode },
    { label: "Follow-ups", value: snapshot.follow_up_depth },
    { label: "Warmup", value: warmup ? "On" : "Off" },
    { label: "Credit cost", value: cost },
  ];

  return (
    <Card className="space-y-4" data-testid="mock-review-screen">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Review mock interview</h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Confirm settings before starting. Resume and JD text are frozen for this session so
          mid-interview edits cannot change the plan.
        </p>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2 min-w-0"
          >
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {row.label}
            </dt>
            <dd className="text-sm text-foreground mt-0.5 break-words">{row.value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-11"
          onClick={onBack}
          disabled={loading}
        >
          Back
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="min-h-11"
          loading={loading}
          onClick={onConfirm}
          data-testid="mock-review-confirm"
        >
          Start mock interview
        </Button>
      </div>
    </Card>
  );
}
