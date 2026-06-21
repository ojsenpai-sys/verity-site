-- ═══════════════════════════════════════════════════════════════════════════════
-- 023_article_scores.sql
--
-- Phase 4-6 Analytics Layer — 作品スコアの永続化キャッシュ。
--
-- 計算式 (VERITY 標準):
--   fanza_click * 5  (購入意図)
--   video_view  * 2  (視聴遷移)
--   page_view   * 1  (作品ページ閲覧)
--
-- ランキング / 代表作 / 人気シグナル / 立ち位置 すべてのフィーチャから参照される。
-- 集計母数が増えるたびに in-memory 集計が高コストになるため、materialized view 化で
-- 高速化する。CRON で 30 分ごとに REFRESH する想定。
--
-- 期間別: 7d / 30d / 90d / 365d / all を一行に保持し、横展開を 1 クエリで完結させる。
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 0. user_events に必須インデックス (スコープ走査の高速化) ──────────────
CREATE INDEX IF NOT EXISTS user_events_article_scoring_idx
  ON public.user_events (target_type, event_name, target_id, created_at DESC)
  WHERE target_type IN ('article', 'actress');

-- ── 1. article_scores: 期間別集計の materialized view ─────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.article_scores CASCADE;

CREATE MATERIALIZED VIEW public.article_scores AS
WITH weighted AS (
  SELECT
    target_id AS cid,
    created_at,
    CASE event_name
      WHEN 'fanza_click' THEN 5
      WHEN 'video_view'  THEN 2
      WHEN 'page_view'   THEN 1
      ELSE 0
    END AS w
  FROM public.user_events
  WHERE target_type = 'article'
    AND target_id IS NOT NULL
    AND event_name IN ('fanza_click', 'video_view', 'page_view')
)
SELECT
  cid AS external_id,
  SUM(w) FILTER (WHERE created_at >= now() - interval '7 days')   AS score_7d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '30 days')  AS score_30d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '90 days')  AS score_90d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '365 days') AS score_365d,
  SUM(w)                                                          AS score_all,
  -- prior 期間 (急上昇判定用): 直近 30 日の 1 期間前 = 30〜60 日前
  SUM(w) FILTER (
    WHERE created_at >= now() - interval '60 days'
      AND created_at <  now() - interval '30 days'
  ) AS score_prior30d
FROM weighted
GROUP BY cid;

CREATE UNIQUE INDEX article_scores_pk ON public.article_scores (external_id);
CREATE INDEX article_scores_30d_desc  ON public.article_scores (score_30d DESC NULLS LAST);
CREATE INDEX article_scores_7d_desc   ON public.article_scores (score_7d  DESC NULLS LAST);
CREATE INDEX article_scores_all_desc  ON public.article_scores (score_all DESC NULLS LAST);

GRANT SELECT ON public.article_scores TO anon, authenticated;

-- ── 2. actress_scores: 同じ仕様で女優側 ────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.actress_scores CASCADE;

CREATE MATERIALIZED VIEW public.actress_scores AS
WITH weighted AS (
  SELECT
    target_id AS ext_id,
    created_at,
    CASE event_name
      WHEN 'fanza_click'  THEN 5
      WHEN 'video_view'   THEN 2
      WHEN 'actress_view' THEN 2
      WHEN 'page_view'    THEN 1
      ELSE 0
    END AS w
  FROM public.user_events
  WHERE target_type = 'actress'
    AND target_id IS NOT NULL
    AND event_name IN ('fanza_click', 'video_view', 'actress_view', 'page_view')
)
SELECT
  ext_id AS external_id,
  SUM(w) FILTER (WHERE created_at >= now() - interval '7 days')   AS score_7d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '30 days')  AS score_30d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '90 days')  AS score_90d,
  SUM(w) FILTER (WHERE created_at >= now() - interval '365 days') AS score_365d,
  SUM(w)                                                          AS score_all,
  SUM(w) FILTER (
    WHERE created_at >= now() - interval '60 days'
      AND created_at <  now() - interval '30 days'
  ) AS score_prior30d
FROM weighted
GROUP BY ext_id;

CREATE UNIQUE INDEX actress_scores_pk ON public.actress_scores (external_id);
CREATE INDEX actress_scores_30d_desc  ON public.actress_scores (score_30d DESC NULLS LAST);
CREATE INDEX actress_scores_7d_desc   ON public.actress_scores (score_7d  DESC NULLS LAST);

GRANT SELECT ON public.actress_scores TO anon, authenticated;

-- ── 3. リフレッシュ関数 (pg_cron / pg_net などから呼ぶ想定) ───────────────
CREATE OR REPLACE FUNCTION public.refresh_article_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.article_scores;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.actress_scores;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_article_scores() TO service_role;

-- ── 4. ヘルパ RPC: 期間指定で TopN を取得 (in-memory 集計の置換用) ────────
CREATE OR REPLACE FUNCTION public.get_top_articles_by_period(
  p_period TEXT,
  p_limit  INT
)
RETURNS TABLE(external_id TEXT, score NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT s.external_id,
         CASE p_period
           WHEN '7d'   THEN s.score_7d
           WHEN '30d'  THEN s.score_30d
           WHEN '90d'  THEN s.score_90d
           WHEN '365d' THEN s.score_365d
           ELSE s.score_all
         END AS score
  FROM public.article_scores s
  WHERE
    CASE p_period
      WHEN '7d'   THEN s.score_7d
      WHEN '30d'  THEN s.score_30d
      WHEN '90d'  THEN s.score_90d
      WHEN '365d' THEN s.score_365d
      ELSE s.score_all
    END > 0
  ORDER BY 2 DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.get_top_actresses_by_period(
  p_period TEXT,
  p_limit  INT
)
RETURNS TABLE(external_id TEXT, score NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT s.external_id,
         CASE p_period
           WHEN '7d'   THEN s.score_7d
           WHEN '30d'  THEN s.score_30d
           WHEN '90d'  THEN s.score_90d
           WHEN '365d' THEN s.score_365d
           ELSE s.score_all
         END AS score
  FROM public.actress_scores s
  WHERE
    CASE p_period
      WHEN '7d'   THEN s.score_7d
      WHEN '30d'  THEN s.score_30d
      WHEN '90d'  THEN s.score_90d
      WHEN '365d' THEN s.score_365d
      ELSE s.score_all
    END > 0
  ORDER BY 2 DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_top_articles_by_period(TEXT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_actresses_by_period(TEXT, INT) TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 初回 REFRESH: マイグレーション適用直後に在庫データから集計を走らせる。
-- CONCURRENTLY は初回はインデックスがないため不要。
-- ═══════════════════════════════════════════════════════════════════════════════
REFRESH MATERIALIZED VIEW public.article_scores;
REFRESH MATERIALIZED VIEW public.actress_scores;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 運用メモ
--   - リフレッシュは Supabase pg_cron で 30 分間隔を推奨:
--       SELECT cron.schedule('refresh-scores', '*/30 * * * *',
--         $$ SELECT public.refresh_article_scores(); $$);
--   - クライアントは get_top_articles_by_period('7d', 10) を rpc 経由で呼べる
--   - in-memory 集計 (src/lib/articleScoring.ts) は段階的に view 参照へ置換
-- ═══════════════════════════════════════════════════════════════════════════════
