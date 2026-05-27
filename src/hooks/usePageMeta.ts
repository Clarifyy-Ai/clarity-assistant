import { useEffect } from "react";

interface PageMetaOptions {
  title?: string;
  description?: string;
  /** When true, adds robots noindex,nofollow for auth and error pages */
  noIndex?: boolean;
}

/**
 * Sets the document title and meta description for the current page.
 * Resets to defaults on unmount.
 */
export function usePageMeta({ title, description, noIndex }: PageMetaOptions) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;

    const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const prevDesc = metaDesc?.content ?? "";
    if (description && metaDesc) {
      metaDesc.content = description;
    }

    let robotsMeta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const hadRobots = !!robotsMeta;
    const prevRobots = robotsMeta?.content ?? "";

    if (noIndex) {
      if (!robotsMeta) {
        robotsMeta = document.createElement("meta");
        robotsMeta.setAttribute("name", "robots");
        document.head.appendChild(robotsMeta);
      }
      robotsMeta.content = "noindex, nofollow";
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) metaDesc.content = prevDesc;
      if (noIndex) {
        if (hadRobots && robotsMeta) {
          robotsMeta.content = prevRobots;
        } else if (robotsMeta) {
          robotsMeta.remove();
        }
      }
    };
  }, [title, description, noIndex]);
}
