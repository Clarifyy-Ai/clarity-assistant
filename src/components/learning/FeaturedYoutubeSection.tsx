import { ExternalLink, PlayCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FEATURED_YOUTUBE_VIDEOS } from "@/lib/learning/featuredYoutube";
import { YoutubeEmbed } from "@/components/learning/YoutubeEmbed";
import { useState } from "react";

export function FeaturedYoutubeSection() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="space-y-3" data-testid="learning-hub-youtube">
      <div>
        <h2 className="text-lg font-semibold">Recommended videos</h2>
        <p className="text-sm text-muted-foreground">
          Curated YouTube lessons on interview skills. Third-party content — not an official certification.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {FEATURED_YOUTUBE_VIDEOS.map((video) => {
          const expanded = expandedId === video.id;
          return (
            <Card key={video.id} className="flex min-w-0 flex-col gap-3">
              {expanded ? (
                <YoutubeEmbed url={video.url} title={video.title} />
              ) : (
                <div className="flex items-start gap-3">
                  <PlayCircle className="mt-0.5 h-8 w-8 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="font-medium leading-snug">{video.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{video.description}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {video.channel} · {video.durationLabel}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={expanded ? "secondary" : "default"}
                  onClick={() => setExpandedId(expanded ? null : video.id)}
                >
                  {expanded ? "Hide player" : "Watch here"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<ExternalLink className="h-3.5 w-3.5" aria-hidden />}
                  onClick={() => window.open(video.url, "_blank", "noopener,noreferrer")}
                >
                  Open on YouTube
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
