/** Parse common YouTube URL shapes into a video id. */
export function parseYoutubeVideoId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (parsed.pathname === "/watch") {
        const id = parsed.searchParams.get("v");
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
      const embedMatch = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/);
      if (embedMatch) return embedMatch[1];
    }
  } catch {
    return null;
  }

  return null;
}

export function isYoutubeUrl(url: string): boolean {
  return parseYoutubeVideoId(url) !== null;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
}

/** Normalize pasted YouTube links to canonical watch URLs for storage. */
export function normalizeYoutubeUrl(url: string): string | null {
  const id = parseYoutubeVideoId(url);
  return id ? youtubeWatchUrl(id) : null;
}

export function normalizeVideoResourceUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  return normalizeYoutubeUrl(trimmed) ?? trimmed;
}
