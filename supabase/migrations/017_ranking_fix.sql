-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 17: get_actress_ranking パフォーマンス修正 + フェイルファスト
--
-- 問題: fav_pts CTE が profiles 全件スキャン → statement timeout → 522 cascade
-- 修正:
--   1) sn_user_logs に (brand_id, target_type, action_type, created_at) 複合インデックス
--   2) profiles(favorite_actress_ids) に GIN インデックス
--   3) fav_pts に IS NOT NULL + cardinality() > 0 フィルタ
--   4) SET statement_timeout = '5s' でフェイルファスト（連鎖障害を防止）
-- ══════════════════════════════════════════════════════════════════════════════

-- ① sn_user_logs ランキング集計用複合インデックス
--    view_pts / click_pts CTE のフィルタ (brand_id, target_type, action_type, created_at) に対応
CREATE INDEX IF NOT EXISTS sn_user_logs_ranking
  ON public.sn_user_logs (brand_id, target_type, action_type, created_at DESC);

-- ② profiles.favorite_actress_ids GIN インデックス
--    fav_pts CTE の LATERAL unnest + JOIN を高速化
CREATE INDEX IF NOT EXISTS idx_profiles_fav_actress_ids
  ON public.profiles USING GIN (favorite_actress_ids);

-- ③ get_actress_ranking を最適化版に置き換え
CREATE OR REPLACE FUNCTION public.get_actress_ranking(
  p_brand_id text,
  p_limit    int DEFAULT 10
)
RETURNS TABLE(actress_external_id text, points bigint)
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
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
  -- IS NOT NULL + cardinality() > 0 で空配列プロファイルをスキップ
  fav_pts AS (
    SELECT a.external_id AS ext_id, COUNT(*) AS cnt
    FROM   profiles p
    CROSS JOIN LATERAL unnest(p.favorite_actress_ids) AS fav_id(id)
    JOIN   actresses a ON a.id = fav_id.id
    WHERE  p.brand_id              = p_brand_id
      AND  p.favorite_actress_ids  IS NOT NULL
      AND  cardinality(p.favorite_actress_ids) > 0
    GROUP BY a.external_id
  )
  SELECT
    a.external_id AS actress_external_id,
    (
      COALESCE(v.cnt, 0)  * 1  +
      COALESCE(c.cnt, 0)  * 10 +
      COALESCE(f.cnt, 0)  * 50
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
