import { parseYoutubeVideoId, youtubeEmbedUrl, youtubeWatchUrl } from "@/lib/learning/youtube";

type YoutubeEmbedProps = {
  url: string;
  title?: string;
  className?: string;
};

export function YoutubeEmbed({ url, title = "YouTube video", className }: YoutubeEmbedProps) {
  const videoId = parseYoutubeVideoId(url);
  if (!videoId) return null;

  return (
    <div className={className}>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
        <iframe
          src={youtubeEmbedUrl(videoId)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      <a
        href={youtubeWatchUrl(videoId)}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-xs text-muted-foreground underline hover:text-foreground"
      >
        Open on YouTube
      </a>
    </div>
  );
}
