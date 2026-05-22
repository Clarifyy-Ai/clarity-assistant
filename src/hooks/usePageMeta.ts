import { useEffect } from "react";

interface PageMetaOptions {
  title?: string;
  description?: string;
}

/**
 * Sets the document title and meta description for the current page.
 * Resets to defaults on unmount.
 */
export function usePageMeta({ title, description }: PageMetaOptions) {
  useEffect(() => {
    const prevTitle = document.title;
    if (title) document.title = title;

    const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    const prevDesc = metaDesc?.content ?? "";
    if (description && metaDesc) {
      metaDesc.content = description;
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc) metaDesc.content = prevDesc;
    };
  }, [title, description]);
}
