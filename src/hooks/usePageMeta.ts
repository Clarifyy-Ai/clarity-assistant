import { useEffect } from "react";

interface PageMetaOptions {
  title?: string;
  description?: string;
  /** Comma-separated keywords for engines that still read this tag */
  keywords?: string;
  /** When true, adds robots noindex,nofollow for auth and error pages */
  noIndex?: boolean;
  /** Absolute or relative canonical URL for the current page */
  canonical?: string;
  /** Open Graph image URL (absolute) */
  ogImage?: string;
  /** Open Graph type (default: 'website'; use 'article' for blog posts) */
  ogType?: string;
  /** JSON-LD structured data object (will be JSON.stringified) */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

function upsertMeta(
  selector: string,
  attr: "name" | "property",
  attrValue: string,
  content: string,
): { el: HTMLMetaElement; created: boolean; prev: string } {
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  const created = !el;
  const prev = el?.content ?? "";
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, attrValue);
    document.head.appendChild(el);
  }
  el.content = content;
  return { el, created, prev };
}

function upsertLink(
  rel: string,
  href: string,
): { el: HTMLLinkElement; created: boolean; prev: string } {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  const created = !el;
  const prev = el?.href ?? "";
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.href = href;
  return { el, created, prev };
}

/**
 * Sets the document title and SEO meta for the current page.
 * Resets to defaults on unmount.
 */
export function usePageMeta({
  title,
  description,
  keywords,
  noIndex,
  canonical,
  ogImage,
  ogType,
  jsonLd,
}: PageMetaOptions) {
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    // Title
    const prevTitle = document.title;
    if (title) document.title = title;
    cleanups.push(() => {
      document.title = prevTitle;
    });

    // Description
    if (description) {
      const metaDesc = document.querySelector(
        'meta[name="description"]',
      ) as HTMLMetaElement | null;
      const prevDesc = metaDesc?.content ?? "";
      if (metaDesc) {
        metaDesc.content = description;
        cleanups.push(() => {
          if (prevDesc) metaDesc.content = prevDesc;
        });
      }
    }

    if (keywords) {
      const kw = upsertMeta('meta[name="keywords"]', "name", "keywords", keywords);
      cleanups.push(() => {
        if (kw.created) kw.el.remove();
        else if (kw.prev) kw.el.content = kw.prev;
      });
    }

    // Robots noindex
    if (noIndex) {
      const existing = document.querySelector(
        'meta[name="robots"]',
      ) as HTMLMetaElement | null;
      const hadExisting = !!existing;
      const prev = existing?.content ?? "";
      const r = upsertMeta('meta[name="robots"]', "name", "robots", "noindex, nofollow");
      cleanups.push(() => {
        if (hadExisting) r.el.content = prev;
        else r.el.remove();
      });
    }

    // Canonical
    if (canonical) {
      const existing = document.querySelector(
        'link[rel="canonical"]',
      ) as HTMLLinkElement | null;
      const hadExisting = !!existing;
      const prev = existing?.href ?? "";
      const c = upsertLink("canonical", canonical);
      cleanups.push(() => {
        if (hadExisting) c.el.href = prev;
        else c.el.remove();
      });

      // Mirror to og:url
      const og = upsertMeta(
        'meta[property="og:url"]',
        "property",
        "og:url",
        canonical,
      );
      cleanups.push(() => {
        if (og.created) og.el.remove();
        else if (og.prev) og.el.content = og.prev;
      });
    }

    // og:title mirrors title
    if (title) {
      const og = upsertMeta(
        'meta[property="og:title"]',
        "property",
        "og:title",
        title,
      );
      cleanups.push(() => {
        if (og.created) og.el.remove();
        else if (og.prev) og.el.content = og.prev;
      });
      const tw = upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", title);
      cleanups.push(() => {
        if (tw.created) tw.el.remove();
        else if (tw.prev) tw.el.content = tw.prev;
      });
    }

    // og:description mirrors description
    if (description) {
      const og = upsertMeta(
        'meta[property="og:description"]',
        "property",
        "og:description",
        description,
      );
      cleanups.push(() => {
        if (og.created) og.el.remove();
        else if (og.prev) og.el.content = og.prev;
      });
      const tw = upsertMeta(
        'meta[name="twitter:description"]',
        "name",
        "twitter:description",
        description,
      );
      cleanups.push(() => {
        if (tw.created) tw.el.remove();
        else if (tw.prev) tw.el.content = tw.prev;
      });
    }

    // og:type
    if (ogType) {
      const og = upsertMeta(
        'meta[property="og:type"]',
        "property",
        "og:type",
        ogType,
      );
      cleanups.push(() => {
        if (og.created) og.el.remove();
        else if (og.prev) og.el.content = og.prev;
      });
    }

    // og:image
    if (ogImage) {
      const og = upsertMeta(
        'meta[property="og:image"]',
        "property",
        "og:image",
        ogImage,
      );
      cleanups.push(() => {
        if (og.created) og.el.remove();
        else if (og.prev) og.el.content = og.prev;
      });
    }

    // JSON-LD — mutate the static #clarify-page-jsonld slot from index.html.
    // Never document.createElement("script"): CSP script-src 'self' treats that
    // as an inline executable script even when type is application/ld+json.
    if (jsonLd) {
      const slot = document.getElementById(
        "clarify-page-jsonld",
      ) as HTMLScriptElement | null;
      if (slot) {
        const prev = slot.textContent ?? "{}";
        slot.textContent = JSON.stringify(jsonLd);
        cleanups.push(() => {
          slot.textContent = prev;
        });
      }
    }

    return () => {
      // Run cleanups in reverse order
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]();
    };
  }, [title, description, keywords, noIndex, canonical, ogImage, ogType, jsonLd]);
}
