// @ts-nocheck
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { refreshCredits } from "@/lib/billing/creditsManager";
import { useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Sparkles, Copy, Save, CheckCircle, AlertCircle,
  Briefcase, Plus, X, Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

export default function ProjectBuilder() {
  const credits = useCredits();
  const { user } = useAuthStore();

  const [projectName, setProjectName]   = useState("");
  const [role, setRole]                 = useState("");
  const [techStack, setTechStack]       = useState<string[]>([]);
  const [techInput, setTechInput]       = useState("");
  const [description, setDescription]   = useState("");
  const [impact, setImpact]             = useState("");
  const [githubUrl, setGithubUrl]       = useState("");
  const [showcase, setShowcase]         = useState("");
  const [loading, setLoading]           = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState<string | null>(null);

  function addTech() {
    const tech = techInput.trim();
    if (tech && !techStack.includes(tech)) {
      setTechStack((p) => [...p, tech]);
      setTechInput("");
    }
  }

  function removeTech(tech: string) {
    setTechStack((p) => p.filter((t) => t !== tech));
  }

  const isFormValid = projectName.trim() && role.trim() && description.trim().length >= 20;

  async function generateShowcase() {
    if (!isFormValid || !credits.canAfford("project_build")) return;
    setLoading(true);
    setError(null);
    setShowcase("");
    setSaved(false);

    try {
      const techList = techStack.length > 0 ? techStack.join(", ") : "not specified";
      const input = `Project: ${projectName}\nRole: ${role}\nTech Stack: ${techList}\n\nWhat I did:\n${description}${impact ? `\n\nImpact & Metrics:\n${impact}` : ""}${githubUrl ? `\n\nGitHub/Portfolio URL: ${githubUrl}` : ""}`;
      const data = await fetchEdgeJson<{ result?: string }>("prep-tool", {
        tool_id: "project_build",
        input,
      });
      setShowcase(data.result ?? "Showcase generation unavailable.");
      await refreshCredits();
    } catch (err) {
      setShowcase(getOfflineShowcase(projectName, role, techStack, description, impact));
      toast.info("Using offline template — AI unavailable.");
    }
    setLoading(false);
  }

  async function saveShowcase() {
    if (!user || !showcase) return;
    const { error: insertErr } = await supabase.from("answer_bank").insert({
      user_id: user.id,
      question_text: `Project Showcase: ${projectName}`,
      answer_text: showcase,
      category: "Technical",
      source: "prep_lab",
    });
    if (insertErr) {
      toast.error("Failed to save — please try again");
      return;
    }
    setSaved(true);
    toast.success("Project showcase saved to Answer Bank");
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Project Builder"
        description="Turn your project experience into polished interview showcases"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Card>
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">Project Details</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Project name</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Real-time Analytics Dashboard"
                  className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Your role</label>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Lead Backend Engineer"
                  className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">GitHub / Portfolio URL (optional)</label>
                <input
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  placeholder="e.g. https://github.com/user/project"
                  className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </div>

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tech stack</label>
                <div className="flex gap-2">
                  <input
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTech(); } }}
                    placeholder="Add technology…"
                    className="flex-1 bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                  />
                  <Button variant="secondary" size="sm" onClick={addTech} leftIcon={<Plus className="w-3 h-3" />}>
                    Add
                  </Button>
                </div>
                {techStack.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {techStack.map((t) => (
                      <Badge key={t} variant="default" size="sm" className="pr-1">
                        {t}
                        <button
                          onClick={() => removeTech(t)}
                          className="ml-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card>
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">What you did</p>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your contributions, challenges you solved, and decisions you made…"
              rows={5}
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
          </Card>

          <Card>
            <p className="text-xs font-semibold text-foreground uppercase tracking-widest mb-3">Impact & Metrics (optional)</p>
            <textarea
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
              placeholder="e.g. Reduced page load time by 40%, increased user engagement by 25%, saved $50K/month in infrastructure costs…"
              rows={3}
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
            />
          </Card>
        </div>

        <div className="space-y-4">
          {error && (
            <Card className="border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            </Card>
          )}

          <Button
            variant="primary"
            size="md"
            onClick={generateShowcase}
            disabled={!isFormValid || loading || !credits.canAfford("project_build")}
            loading={loading}
            leftIcon={<Sparkles className="w-4 h-4" />}
            fullWidth
          >
            Generate project showcase ({credits.costs.project_build} credits)
          </Button>

          {showcase ? (
            <Card className="border-violet-500/20 bg-violet-500/5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Rocket className="w-3.5 h-3.5" /> Project Showcase
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(showcase); toast.success("Copied!"); }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={saveShowcase}
                    className={cn(
                      "transition-colors",
                      saved ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{showcase}</div>
            </Card>
          ) : (
            <Card className="text-center py-16">
              <Briefcase className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Your polished project showcase will appear here</p>
              <p className="text-muted-foreground text-xs mt-1">
                Fill in the project details and click Generate
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function getOfflineShowcase(
  name: string,
  role: string,
  stack: string[],
  desc: string,
  impact: string
): string {
  const techList = stack.length > 0 ? stack.join(", ") : "various technologies";
  return `## ${name}\n**Role:** ${role}\n**Tech Stack:** ${techList}\n\n### Overview\n${desc}\n\n### Key Achievements\n${impact ? `• ${impact.split(/[,\n]/).filter(Boolean).join("\n• ")}` : "• [Add specific metrics when AI is available]"}\n\n### Interview Talking Points\n1. **Challenge:** What was the hardest part of this project?\n2. **Decision:** What was a key technical decision you made and why?\n3. **Impact:** How did this project affect the team/company/users?\n4. **Learning:** What would you do differently if you started over?\n\n### Suggested STAR Response\n- **Situation:** Set the context — team size, timeline, business need\n- **Task:** Your specific responsibility on this project\n- **Action:** The concrete steps YOU took (use "I", not "we")\n- **Result:** Quantified outcomes — performance gains, user impact, cost savings\n\n*AI-enhanced version will be available when the service is online.*`;
}
