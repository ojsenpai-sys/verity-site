-- ══════════════════════════════════════════════════════════════════════════════
-- 031_top_works_ranked.sql — 公開ランキング用「人気作品」スコアRPC（熱量×トレンド）
-- ══════════════════════════════════════════════════════════════════════════════
-- 【目的】公開ランキングページ(/verity/ranking)に「人気作品 TOP10」を増設するための
--   匿名(anon)から呼べる集計関数。user_events は anon SELECT 不可(024)のため、
--   既存 get_actress_favorite_ranking と同様 SECURITY DEFINER の RPC として提供する。
--
-- 【スコア定義（VERITY独自の総合戦闘力）】
--   作品個別ページ閲覧(page_view)          : +1
--   サンプル動画視聴(video_view / Playクリック): +5
--   出演女優のお気に入り登録(favorite_actress): +20
--      → その女優が出演するアクティブ作品群へ「比例分散」加算
--        （20 ÷ 出演作品数 を各作品へ）。1人気女優に全振りされて偏るのを防ぐ。
--
-- 【時間減衰（トレンド型）】直近14日の行動のみ対象。半減期7日の指数減衰
--   power(0.5, age_days / 7) を各イベントへ乗算 → 直近を最優先・古い行動は自動減衰。
--   （公開女優ランキングの「直近の熱量を反映」する思想と同期。母数が小さいうちは
--    on-demand 集計で十分軽量。重くなれば actress_ranking_cache 同様にキャッシュ化する）
--
-- 戻り値: external_id(=CID) と points のみ（PIIなし・集計値のみ）。
-- 冪等。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_top_works_ranked(p_limit int DEFAULT 10)
RETURNS TABLE(external_id text, points numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH
  -- ① 作品個別イベント: PV=1 / サンプル視聴=5 を半減期7日で減衰加算
  ev_work AS (
    SELECT target_id AS cid,
           SUM(
             (CASE event_name WHEN 'page_view' THEN 1 WHEN 'video_view' THEN 5 ELSE 0 END)
             * power(0.5, EXTRACT(EPOCH FROM (now() - created_at)) / 604800.0)
           ) AS pts
    FROM user_events
    WHERE target_type = 'article'
      AND target_id IS NOT NULL
      AND event_name IN ('page_view', 'video_view')
      AND created_at >= now() - interval '14 days'
    GROUP BY target_id
  ),
  -- ② 出演女優お気に入り(+20)を半減期7日で減衰加算 → 女優ext単位で集約
  fav_actress AS (
    SELECT target_id AS actress_ext,
           SUM(20 * power(0.5, EXTRACT(EPOCH FROM (now() - created_at)) / 604800.0)) AS fav_pts
    FROM user_events
    WHERE target_type = 'actress'
      AND event_name  = 'favorite_actress'
      AND target_id IS NOT NULL
      AND created_at >= now() - interval '14 days'
    GROUP BY target_id
  ),
  -- ③ 女優ext → 女優名 → 出演アクティブ作品へ「比例分散」(20 ÷ 出演作品数)
  fav_work AS (
    SELECT a.external_id AS cid,
           SUM(fa.fav_pts / cnt.c) AS pts
    FROM fav_actress fa
    JOIN actresses ac ON ac.external_id = fa.actress_ext
    JOIN LATERAL (
      SELECT GREATEST(count(*), 1) AS c
      FROM articles a2
      WHERE a2.is_active AND a2.tags @> ARRAY[ac.name]
    ) cnt ON true
    JOIN articles a ON a.is_active AND a.tags @> ARRAY[ac.name]
    GROUP BY a.external_id
  ),
  -- ④ ①②③を合算
  merged AS (
    SELECT cid, SUM(pts) AS pts
    FROM (
      SELECT cid, pts FROM ev_work
      UNION ALL
      SELECT cid, pts FROM fav_work
    ) u
    GROUP BY cid
  )
  SELECT m.cid AS external_id, round(m.pts::numeric, 1) AS points
  FROM merged m
  JOIN articles a ON a.external_id = m.cid AND a.is_active = true
  WHERE m.pts > 0
  ORDER BY m.pts DESC
  LIMIT GREATEST(p_limit, 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_top_works_ranked(int) TO anon, authenticated, service_role;
