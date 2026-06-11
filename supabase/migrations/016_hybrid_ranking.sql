-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 16: ハイブリッド熱量スコアリングシステム
--
-- 旧: click点数(5/1) + LP合算
-- 新: ページ閲覧(1pt) + FANZAクリック(10pt) + お気に入り登録(50pt)
--     直近7日間の閲覧・クリックと、全期間のお気に入り数を組み合わせ
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_actress_ranking(
  p_brand_id text,
  p_limit    int DEFAULT 10
)
RETURNS TABLE(actress_external_id text, points bigint)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  WITH
  -- 直近7日間のページ閲覧ポイント (1pt/view)
  view_pts AS (
    SELECT target_id AS ext_id, COUNT(*) AS cnt
    FROM   sn_user_logs
    WHERE  brand_id    = p_brand_id
      AND  target_type = 'actress'
      AND  action_type = 'view'
      AND  created_at  >= NOW() - INTERVAL '7 days'
    GROUP BY target_id
  ),
  -- 直近7日間のFANZAアフィリエイト遷移ポイント (10pt/click)
  click_pts AS (
    SELECT target_id AS ext_id, COUNT(*) AS cnt
    FROM   sn_user_logs
    WHERE  brand_id    = p_brand_id
      AND  target_type = 'actress'
      AND  action_type IN ('purchase_click', 'reserve_click')
      AND  created_at  >= NOW() - INTERVAL '7 days'
    GROUP BY target_id
  ),
  -- 全期間のお気に入り登録数ポイント (50pt/人)
  -- profiles.favorite_actress_ids (uuid[]) を unnest して集計
  fav_pts AS (
    SELECT a.external_id AS ext_id, COUNT(*) AS cnt
    FROM   profiles p
    CROSS JOIN LATERAL unnest(p.favorite_actress_ids) AS fav_id(id)
    JOIN   actresses a ON a.id = fav_id.id
    WHERE  p.brand_id = p_brand_id
    GROUP BY a.external_id
  )
  SELECT
    a.external_id AS actress_external_id,
    (
      COALESCE(v.cnt, 0)      * 1  +   -- 閲覧ポイント
      COALESCE(c.cnt, 0)      * 10 +   -- FANZAクリックポイント
      COALESCE(f.cnt, 0)      * 50     -- お気に入りポイント
    )::bigint AS points
  FROM   actresses a
  LEFT JOIN view_pts  v ON v.ext_id = a.external_id
  LEFT JOIN click_pts c ON c.ext_id = a.external_id
  LEFT JOIN fav_pts   f ON f.ext_id = a.external_id
  WHERE  a.is_active = true
    AND  (
      COALESCE(v.cnt, 0) * 1 +
      COALESCE(c.cnt, 0) * 10 +
      COALESCE(f.cnt, 0) * 50
    ) > 0
  ORDER BY points DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_actress_ranking(text, int)
  TO anon, authenticated;
