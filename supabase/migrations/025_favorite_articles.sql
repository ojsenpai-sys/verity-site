-- ══════════════════════════════════════════════════════════════════════════════
-- 025_favorite_articles.sql — 作品お気に入り（DB化）
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 設計方針（020 favorite_actresses を踏襲、ただし簡素化）:
--   · 作品は上限なし・profiles 配列を介さず本テーブルを直接 source of truth とする
--   · キーは articles.external_id（CID, 安定）。LS の slug|CID は API 側で解決
--   · SECURITY DEFINER 関数でカウントを公開／自身の一覧を取得
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.favorite_articles (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  article_external_id text        NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, article_external_id)
);

CREATE INDEX IF NOT EXISTS fav_articles_user_idx    ON public.favorite_articles (user_id);
CREATE INDEX IF NOT EXISTS fav_articles_cid_idx     ON public.favorite_articles (article_external_id);
CREATE INDEX IF NOT EXISTS fav_articles_created_idx ON public.favorite_articles (created_at DESC);

ALTER TABLE public.favorite_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_articles_select_own" ON public.favorite_articles;
CREATE POLICY "fav_articles_select_own"
  ON public.favorite_articles FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_articles_insert_own" ON public.favorite_articles;
CREATE POLICY "fav_articles_insert_own"
  ON public.favorite_articles FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_articles_delete_own" ON public.favorite_articles;
CREATE POLICY "fav_articles_delete_own"
  ON public.favorite_articles FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.favorite_articles TO authenticated;

-- ── get_article_favorite_count: 個別作品のお気に入り数（公開） ──────────────────
CREATE OR REPLACE FUNCTION public.get_article_favorite_count(p_external_id text)
RETURNS int
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT COUNT(*)::int
  FROM public.favorite_articles
  WHERE article_external_id = p_external_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_article_favorite_count(text) TO anon, authenticated;

-- ── get_my_favorite_articles: 自身のお気に入り作品一覧（登録日付き） ──────────────
CREATE OR REPLACE FUNCTION public.get_my_favorite_articles(p_user_id uuid)
RETURNS TABLE(
  external_id  text,
  title        text,
  slug         text,
  image_url    text,
  metadata     jsonb,
  favorited_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT a.external_id, a.title, a.slug, a.image_url, a.metadata, fa.created_at AS favorited_at
  FROM   public.favorite_articles fa
  JOIN   public.articles a ON a.external_id = fa.article_external_id
  WHERE  fa.user_id = p_user_id
    AND  a.is_active = true
  ORDER  BY fa.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_favorite_articles(uuid) TO authenticated;
