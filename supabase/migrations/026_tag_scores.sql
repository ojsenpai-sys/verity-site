-- ══════════════════════════════════════════════════════════════════════════════
-- 026_tag_scores.sql — タグ別人気度の集計（Phase4 優先度4）
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 023 article_scores のパターンを踏襲。作品イベント(user_events.target_type=article)を
-- articles.tags へ按分して、タグごとの人気度を期間別 materialized view に集計する。
--
-- 重み（VERITY標準 + favorite を強シグナルとして追加）:
--   favorite_work * 8 / fanza_click * 5 / video_view * 2 / page_view * 1
--
-- REFRESH は CONCURRENTLY を使わない（関数内＝トランザクション内では CONCURRENTLY 不可のため）。
-- ══════════════════════════════════════════════════════════════════════════════

DROP MATERIALIZED VIEW IF EXISTS public.tag_scores CASCADE;

CREATE MATERIALIZED VIEW public.tag_scores AS
WITH weighted AS (
  SELECT
    a.tags,
    e.created_at,
    CASE e.event_name
      WHEN 'favorite_work' THEN 8
      WHEN 'fanza_click'   THEN 5
      WHEN 'video_view'    THEN 2
      WHEN 'page_view'     THEN 1
      ELSE 0
    END AS w
  FROM public.user_events e
  JOIN public.articles a ON a.external_id = e.target_id
  WHERE e.target_type = 'article'
    AND e.target_id IS NOT NULL
    AND e.event_name IN ('favorite_work', 'fanza_click', 'video_view', 'page_view')
    AND a.tags IS NOT NULL
),
exploded AS (
  SELECT unnest(tags) AS tag, created_at, w FROM weighted
)
SELECT
  tag,
  SUM(w) FILTER (WHERE created_at >= now() - interval '7 days')  AS score_7d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '30 days') AS score_30d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '90 days') AS score_90d,
  SUM(w)                                                          AS score_all
FROM exploded
GROUP BY tag;

CREATE UNIQUE INDEX tag_scores_pk      ON public.tag_scores (tag);
CREATE INDEX        tag_scores_30d_desc ON public.tag_scores (score_30d DESC NULLS LAST);
CREATE INDEX        tag_scores_7d_desc  ON public.tag_scores (score_7d  DESC NULLS LAST);

GRANT SELECT ON public.tag_scores TO anon, authenticated;

-- ── リフレッシュ関数（非 CONCURRENTLY = 関数内で安全） ──────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_tag_scores()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.tag_scores;
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_tag_scores() TO service_role;

-- ── ヘルパ RPC: 期間別 TopN タグ ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_top_tags_by_period(p_period TEXT, p_limit INT)
RETURNS TABLE(tag TEXT, score NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT tag,
    CASE p_period
      WHEN '7d'  THEN score_7d
      WHEN '30d' THEN score_30d
      WHEN '90d' THEN score_90d
      ELSE score_all
    END AS score
  FROM public.tag_scores
  WHERE CASE p_period
      WHEN '7d'  THEN score_7d
      WHEN '30d' THEN score_30d
      WHEN '90d' THEN score_90d
      ELSE score_all
    END > 0
  ORDER BY score DESC NULLS LAST
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_top_tags_by_period(text, int) TO anon, authenticated;
