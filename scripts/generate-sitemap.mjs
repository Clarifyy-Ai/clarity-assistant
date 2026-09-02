#!/usr/bin/env node
/**
 * Build public/sitemap.xml from the static marketing routes plus published
 * blog posts and help articles (when Supabase env is present).
 *
 *   node scripts/generate-sitemap.mjs
 *   node scripts/generate-sitemap.mjs --ping
 *
 * Daily SEO: GitHub Action pings Google/Bing with this sitemap. Rankings are
 * not guaranteed; this keeps crawlers current.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ORIGIN = "https://trycareerpilot.com";
const OUT = path.join(ROOT, "public", "sitemap.xml");

/** Keep in sync with src/lib/seo/publicPages.ts — asserted in seoPublicPages.test.ts */
export const STATIC_SITEMAP_PAGES = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/gov-exams", changefreq: "weekly", priority: "0.95" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/blog", changefreq: "daily", priority: "0.85" },
  { path: "/help", changefreq: "weekly", priority: "0.8" },
  { path: "/faq", changefreq: "monthly", priority: "0.75" },
  { path: "/about", changefreq: "yearly", priority: "0.6" },
  { path: "/industries", changefreq: "monthly", priority: "0.55" },
  { path: "/careers", changefreq: "monthly", priority: "0.5" },
  { path: "/contact-sales", changefreq: "yearly", priority: "0.5" },
  { path: "/shortcuts", changefreq: "yearly", priority: "0.4" },
  { path: "/download", changefreq: "monthly", priority: "0.65" },
  { path: "/cookies", changefreq: "yearly", priority: "0.35" },
  { path: "/terms", changefreq: "yearly", priority: "0.35" },
  { path: "/privacy", changefreq: "yearly", priority: "0.35" },
  { path: "/login", changefreq: "yearly", priority: "0.45" },
  { path: "/signup", changefreq: "monthly", priority: "0.7" },
];

function locFor(p) {
  return p === "/" ? `${ORIGIN}/` : `${ORIGIN}${p}`;
}

function isoDay(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function urlXml({ loc, lastmod, changefreq, priority }) {
  const last = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : "";
  return `  <url>
    <loc>${loc}</loc>${last}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

async function fetchJson(url, key) {
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function collectDynamicUrls(env = process.env) {
  const supabaseUrl = (env.VITE_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/+$/, "");
  const anon = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  const extra = [];
  if (!supabaseUrl || !anon) return extra;

  try {
    const posts = await fetchJson(
      `${supabaseUrl}/rest/v1/blog_posts?select=slug,published_at,updated_at&published=eq.true`,
      anon,
    );
    if (Array.isArray(posts)) {
      for (const row of posts) {
        if (!row?.slug) continue;
        extra.push({
          loc: locFor(`/blog/${encodeURIComponent(String(row.slug))}`),
          lastmod: isoDay(row.updated_at || row.published_at),
          changefreq: "weekly",
          priority: "0.7",
        });
      }
    }
  } catch (err) {
    console.warn("[sitemap] blog_posts skipped:", err instanceof Error ? err.message : err);
  }

  try {
    const articles = await fetchJson(
      `${supabaseUrl}/rest/v1/help_articles?select=slug,updated_at&published=eq.true`,
      anon,
    );
    if (Array.isArray(articles)) {
      for (const row of articles) {
        if (!row?.slug) continue;
        extra.push({
          loc: locFor(`/help/${encodeURIComponent(String(row.slug))}`),
          lastmod: isoDay(row.updated_at),
          changefreq: "monthly",
          priority: "0.65",
        });
      }
    }
  } catch (err) {
    console.warn("[sitemap] help_articles skipped:", err instanceof Error ? err.message : err);
  }

  return extra;
}

export function buildSitemapXml(staticPages, dynamicUrls) {
  const staticUrls = staticPages.map((p) =>
    urlXml({
      loc: locFor(p.path),
      changefreq: p.changefreq,
      priority: p.priority,
    }),
  );
  const dyn = dynamicUrls.map((u) => urlXml(u));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...dyn].join("\n")}
</urlset>
`;
}

export async function pingSearchEngines(sitemapUrl) {
  const targets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
  ];
  const results = [];
  for (const url of targets) {
    try {
      const res = await fetch(url, { method: "GET" });
      results.push({ url, ok: res.ok, status: res.status });
    } catch (err) {
      results.push({
        url,
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}

async function main() {
  const ping = process.argv.includes("--ping");
  const dynamicUrls = await collectDynamicUrls();
  const xml = buildSitemapXml(STATIC_SITEMAP_PAGES, dynamicUrls);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, xml, "utf8");
  const urlCount = (xml.match(/<url>/g) || []).length;
  console.log(`Wrote ${OUT} (${urlCount} URLs)`);

  if (ping) {
    const sitemapUrl = `${ORIGIN}/sitemap.xml`;
    const results = await pingSearchEngines(sitemapUrl);
    for (const r of results) {
      console.log(`Ping ${r.url} → ${r.ok ? "ok" : "fail"} ${r.status}${r.error ? ` ${r.error}` : ""}`);
    }
  }
}

const invokedDirectly = path.basename(process.argv[1] ?? "") === "generate-sitemap.mjs";

if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
