-- VERITY initial schema

-- Sources: external API endpoints to pull from
CREATE TABLE IF NOT EXISTS public.sources (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text UNIQUE NOT NULL,
  api_endpoint    text,
  api_key_env     text,             -- name of the env var holding the API key
  is_active       boolean NOT NULL DEFAULT true,
  last_synced_at  timestamptz
);

-- Articles: normalised records fetched from sources
CREATE TABLE IF NOT EXISTS public.articles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id   text UNIQUE NOT NULL,
  title         text NOT NULL,
  slug          text UNIQUE NOT NULL,
  source        text NOT NULL,
  category      text,
  tags          text[],
  summary       text,
  content       text,
  image_url     text,
  published_at  timestamptz,
  fetched_at    timestamptz NOT NULL DEFAULT now(),
  metadata      jsonb,
  is_active     boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx ON public.articles (published_at DESC);
CREATE INDEX IF NOT EXISTS articles_source_idx       ON public.articles (source);
CREATE INDEX IF NOT EXISTS articles_category_idx     ON public.articles (category);
CREATE INDEX IF NOT EXISTS articles_tags_idx         ON public.articles USING gin (tags);
CREATE INDEX IF NOT EXISTS articles_slug_idx         ON public.articles (slug);

-- Full-text search index on title + summary
CREATE INDEX IF NOT EXISTS articles_fts_idx ON public.articles
  USING gin (to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(summary, '')));

-- Affiliate links: zero or more per article, per category
CREATE TABLE IF NOT EXISTS public.affiliate_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id    uuid REFERENCES public.articles(id) ON DELETE CASCADE,
  category      text,
  label         text NOT NULL,
  url           text NOT NULL,
  display_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS affiliate_links_article_idx ON public.affiliate_links (article_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_links ENABLE ROW LEVEL SECURITY;

-- Public read-only access on active articles and their affiliate links
CREATE POLICY "Public can read active articles"
  ON public.articles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Public can read affiliate links"
  ON public.affiliate_links FOR SELECT
  USING (true);

-- Sources are internal only (service role writes, no anon/authenticated reads)
-- No policy = deny all for anon/authenticated

-- ─── GRANTS ─────────────────────────────────────────────────────────────────

GRANT SELECT ON public.articles        TO anon, authenticated;
GRANT SELECT ON public.affiliate_links TO anon, authenticated;
-- sources intentionally NOT granted to anon/authenticated
