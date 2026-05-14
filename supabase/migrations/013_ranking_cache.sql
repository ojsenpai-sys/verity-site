-- 1日1回スナップショットするランキングキャッシュテーブル
CREATE TABLE IF NOT EXISTS public.actress_ranking_cache (
  id            bigserial    PRIMARY KEY,
  brand_id      text         NOT NULL DEFAULT 'verity',
  rank          integer      NOT NULL CHECK (rank >= 1 AND rank <= 100),
  actress_id    uuid         NOT NULL REFERENCES public.actresses(id) ON DELETE CASCADE,
  points        bigint       NOT NULL,
  image_url     text,
  snapshot_date date         NOT NULL DEFAULT CURRENT_DATE,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (brand_id, snapshot_date, rank)
);

CREATE INDEX IF NOT EXISTS ranking_cache_brand_date
  ON public.actress_ranking_cache (brand_id, snapshot_date DESC, rank);

ALTER TABLE public.actress_ranking_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read ranking_cache"
  ON public.actress_ranking_cache FOR SELECT USING (true);

GRANT SELECT ON public.actress_ranking_cache TO anon, authenticated;
