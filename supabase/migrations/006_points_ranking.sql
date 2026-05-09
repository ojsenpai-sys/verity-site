-- Phase 6: Points & Crown Badge & Ranking System

-- 1. profiles: max favorites 3 → 6 (API層で3/6を動的に制御)
ALTER TABLE public.profiles DROP CONSTRAINT profiles_max_3_favorites;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_max_6_favorites
  CHECK (cardinality(favorite_actress_ids) <= 6);

-- 2. ランキング集計用インデックス
CREATE INDEX IF NOT EXISTS sn_user_logs_brand_action
  ON public.sn_user_logs (brand_id, target_type, action_type, target_id);

-- 3. サイト全体女優ランキング集計 (SECURITY DEFINER でRLSバイパス)
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
  SELECT
    target_id AS actress_external_id,
    SUM(
      CASE action_type
        WHEN 'purchase_click' THEN 5
        WHEN 'reserve_click'  THEN 5
        ELSE 1
      END
    ) AS points
  FROM sn_user_logs
  WHERE brand_id    = p_brand_id
    AND target_type = 'actress'
  GROUP BY target_id
  ORDER BY points DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_actress_ranking(text, int)
  TO anon, authenticated;

-- 4. ユーザー別女優ポイント集計 (SECURITY DEFINER でRLSバイパス)
CREATE OR REPLACE FUNCTION public.get_user_actress_points(
  p_user_id  uuid,
  p_brand_id text
)
RETURNS TABLE(actress_external_id text, points bigint)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT
    target_id AS actress_external_id,
    SUM(
      CASE action_type
        WHEN 'purchase_click' THEN 5
        WHEN 'reserve_click'  THEN 5
        ELSE 1
      END
    ) AS points
  FROM sn_user_logs
  WHERE user_id     = p_user_id
    AND brand_id    = p_brand_id
    AND target_type = 'actress'
  GROUP BY target_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_actress_points(uuid, text)
  TO authenticated;
