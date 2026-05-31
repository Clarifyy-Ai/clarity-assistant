-- CMS content tables for Blog, Help, CodingHints, SystemDesign
-- All publicly readable when published=true; admin-only writes.

-- 1. blog_posts
CREATE TABLE public.blog_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  author TEXT NOT NULL DEFAULT 'Clarify AI Team',
  read_time TEXT,
  cover_image_url TEXT,
  published BOOLEAN NOT NULL DEFAULT true,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_posts TO anon, authenticated;
GRANT ALL ON public.blog_posts TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.blog_posts TO authenticated;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blog_posts_public_read" ON public.blog_posts FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "blog_posts_admin_all" ON public.blog_posts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX idx_blog_posts_published_at ON public.blog_posts(published_at DESC) WHERE published = true;
CREATE TRIGGER trg_blog_posts_updated_at BEFORE UPDATE ON public.blog_posts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. help_articles
CREATE TABLE public.help_articles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category_slug TEXT NOT NULL,
  category_title TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  body_md TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.help_articles TO anon, authenticated;
GRANT ALL ON public.help_articles TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.help_articles TO authenticated;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "help_articles_public_read" ON public.help_articles FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "help_articles_admin_all" ON public.help_articles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE INDEX idx_help_articles_category ON public.help_articles(category_slug, sort_order) WHERE published = true;
CREATE TRIGGER trg_help_articles_updated_at BEFORE UPDATE ON public.help_articles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. coding_hints
CREATE TABLE public.coding_hints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  pattern TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Medium',
  example_problems JSONB NOT NULL DEFAULT '[]'::jsonb,
  template_code TEXT,
  language TEXT NOT NULL DEFAULT 'python',
  tags TEXT[] NOT NULL DEFAULT '{}'::text[],
  sort_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.coding_hints TO anon, authenticated;
GRANT ALL ON public.coding_hints TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.coding_hints TO authenticated;
ALTER TABLE public.coding_hints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coding_hints_public_read" ON public.coding_hints FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "coding_hints_admin_all" ON public.coding_hints FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_coding_hints_updated_at BEFORE UPDATE ON public.coding_hints FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. system_design_topics
CREATE TABLE public.system_design_topics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  difficulty TEXT NOT NULL DEFAULT 'Medium',
  key_concepts TEXT[] NOT NULL DEFAULT '{}'::text[],
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  tradeoffs JSONB NOT NULL DEFAULT '[]'::jsonb,
  example_companies TEXT[] NOT NULL DEFAULT '{}'::text[],
  reference_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.system_design_topics TO anon, authenticated;
GRANT ALL ON public.system_design_topics TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.system_design_topics TO authenticated;
ALTER TABLE public.system_design_topics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_design_public_read" ON public.system_design_topics FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "system_design_admin_all" ON public.system_design_topics FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE TRIGGER trg_system_design_updated_at BEFORE UPDATE ON public.system_design_topics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();