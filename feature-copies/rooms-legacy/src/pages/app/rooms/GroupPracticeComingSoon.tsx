import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Users, Video, ShieldCheck, Sparkles, Check, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function GroupPracticeComingSoon() {
  const navigate = useNavigate();
  const [joinedWaitlist, setJoinedWaitlist] = useState(false);

  const handleJoinWaitlist = () => {
    setJoinedWaitlist(true);
    toast.success("You've been added to the Group Practice early access list!");
  };

  return (
    <PageContent className="space-y-6 max-w-4xl mx-auto py-6">
      <PageHeader
        title="Group Practice Rooms"
        subtitle="Collaborative peer interviewing & shared live evaluation rubrics"
        breadcrumbs={[
          { label: "Dashboard", href: "/app/dashboard" },
          { label: "Group Practice" },
        ]}
      />

      <Card className="p-8 text-center space-y-6 border-primary/20 bg-gradient-to-b from-card to-secondary/20 relative overflow-hidden">
        <div className="absolute top-4 right-4">
          <Badge variant="secondary" size="md" className="gap-1 bg-primary/10 text-primary border border-primary/20">
            <Sparkles className="w-3.5 h-3.5" /> WebRTC In Development
          </Badge>
        </div>

        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-primary shadow-inner">
          <Users className="w-8 h-8" />
        </div>

        <div className="max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            Multi-Player Rehearsal Rooms Are On The Way
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            We are engineering low-latency video and audio rooms powered by WebRTC. Soon, you will be able to invite colleagues, coaches, and accountability peers into live interview simulation spaces with collaborative AI feedback and shared scorecards.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-left max-w-2xl mx-auto py-2">
          <div className="p-4 rounded-xl border bg-card/60 space-y-1.5">
            <Video className="w-5 h-5 text-primary" />
            <h4 className="text-sm font-semibold text-foreground">Peer Mock Sessions</h4>
            <p className="text-xs text-muted-foreground">Alternate candidate and interviewer roles with synchronized timers.</p>
          </div>
          <div className="p-4 rounded-xl border bg-card/60 space-y-1.5">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
            <h4 className="text-sm font-semibold text-foreground">Live Shared Rubrics</h4>
            <p className="text-xs text-muted-foreground">Grade behavioral competencies in real-time alongside AI observations.</p>
          </div>
          <div className="p-4 rounded-xl border bg-card/60 space-y-1.5">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h4 className="text-sm font-semibold text-foreground">Group Debriefs</h4>
            <p className="text-xs text-muted-foreground">Aggregate feedback notes from all observers into a single comprehensive report.</p>
          </div>
        </div>

        <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant={joinedWaitlist ? "secondary" : "primary"}
            size="md"
            onClick={handleJoinWaitlist}
            disabled={joinedWaitlist}
            leftIcon={joinedWaitlist ? <Check className="w-4 h-4 text-emerald-500" /> : <Sparkles className="w-4 h-4" />}
            className="w-full sm:w-auto min-w-[220px]"
          >
            {joinedWaitlist ? "You are on the Priority List" : "Join Early Access Waitlist"}
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={() => navigate("/app/dashboard")}
            leftIcon={<ArrowLeft className="w-4 h-4" />}
            className="w-full sm:w-auto"
          >
            Back to Dashboard
          </Button>
        </div>
      </Card>
    </PageContent>
  );
}
