-- SNS / X (Twitter) image feed cache

CREATE TABLE IF NOT EXISTS public.social_feeds (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actress_name text        NOT NULL,
  screen_name  text        NOT NULL,
  post_id      text        UNIQUE NOT NULL,
  image_url    text        NOT NULL,
  post_url     text        NOT NULL,
  created_at   timestamptz NOT NULL,   -- tweet timestamp
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_feeds_actress_idx    ON public.social_feeds (actress_name);
CREATE INDEX IF NOT EXISTS social_feeds_updated_at_idx ON public.social_feeds (updated_at DESC);
CREATE INDEX IF NOT EXISTS social_feeds_created_at_idx ON public.social_feeds (created_at DESC);

ALTER TABLE public.social_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read social feeds"
  ON public.social_feeds FOR SELECT
  USING (true);

GRANT SELECT ON public.social_feeds TO anon, authenticated;
