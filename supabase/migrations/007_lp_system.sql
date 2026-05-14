-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 7: Love Point (LP) System
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles: LP残高・連続ログインカラム追加 ─────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lp_balance    int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS login_streak  int         NOT NULL DEFAULT 0;

-- ── 2. sn_favorite_actresses: ユーザー×女優のLP割り当てテーブル ─────────────────
CREATE TABLE IF NOT EXISTS public.sn_favorite_actresses (
  user_id     uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  actress_id  uuid NOT NULL REFERENCES public.actresses(id) ON DELETE CASCADE,
  brand_id    text NOT NULL DEFAULT 'verity',
  assigned_lp int  NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, actress_id, brand_id)
);

CREATE INDEX IF NOT EXISTS sn_fav_actress_user_idx
  ON public.sn_favorite_actresses (user_id, brand_id);
CREATE INDEX IF NOT EXISTS sn_fav_actress_actress_idx
  ON public.sn_favorite_actresses (actress_id, brand_id);

ALTER TABLE public.sn_favorite_actresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sn_fav_select_own"
  ON public.sn_favorite_actresses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sn_fav_insert_own"
  ON public.sn_favorite_actresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "sn_fav_update_own"
  ON public.sn_favorite_actresses FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.sn_favorite_actresses TO authenticated;

-- ── 3. get_actress_ranking: クリックポイント + LP 合算スコアに更新 ──────────────
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
    a.external_id AS actress_external_id,
    COALESCE(click_pts.pts, 0) + COALESCE(lp_pts.lp, 0) AS points
  FROM actresses a
  LEFT JOIN (
    SELECT
      target_id,
      SUM(
        CASE action_type
          WHEN 'purchase_click' THEN 5
          WHEN 'reserve_click'  THEN 5
          ELSE 1
        END
      ) AS pts
    FROM sn_user_logs
    WHERE brand_id    = p_brand_id
      AND target_type = 'actress'
    GROUP BY target_id
  ) click_pts ON click_pts.target_id = a.external_id
  LEFT JOIN (
    SELECT actress_id, SUM(assigned_lp) AS lp
    FROM sn_favorite_actresses
    WHERE brand_id = p_brand_id
    GROUP BY actress_id
  ) lp_pts ON lp_pts.actress_id = a.id
  WHERE a.is_active = true
    AND (COALESCE(click_pts.pts, 0) + COALESCE(lp_pts.lp, 0)) > 0
  ORDER BY points DESC
  LIMIT p_limit;
$$;

-- ── 4. get_user_actress_purchase_clicks: 王冠バッジ判定用 ─────────────────────
CREATE OR REPLACE FUNCTION public.get_user_actress_purchase_clicks(
  p_user_id  uuid,
  p_brand_id text
)
RETURNS TABLE(actress_external_id text, purchase_clicks bigint)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  SELECT
    target_id AS actress_external_id,
    COUNT(*)  AS purchase_clicks
  FROM sn_user_logs
  WHERE user_id     = p_user_id
    AND brand_id    = p_brand_id
    AND target_type = 'actress'
    AND action_type IN ('purchase_click', 'reserve_click')
  GROUP BY target_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_actress_purchase_clicks(uuid, text)
  TO authenticated;

-- ── 5. claim_login_bonus ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_login_bonus(
  p_user_id  uuid,
  p_brand_id text
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_last       timestamptz;
  v_streak     int;
  v_balance    int;
  v_diff_h     float;
  v_new_streak int;
  v_bonus      int;
  v_is_week    boolean;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT last_login_at, login_streak, lp_balance
  INTO   v_last, v_streak, v_balance
  FROM   profiles
  WHERE  user_id = p_user_id AND brand_id = p_brand_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'profile_not_found');
  END IF;

  IF v_last IS NULL THEN
    v_diff_h := 9999;
  ELSE
    v_diff_h := EXTRACT(EPOCH FROM (now() - v_last)) / 3600.0;
  END IF;

  IF v_diff_h < 24 THEN
    RETURN jsonb_build_object(
      'already_claimed', true,
      'streak',          v_streak,
      'balance',         v_balance
    );
  END IF;

  IF v_diff_h < 48 THEN
    v_new_streak := COALESCE(v_streak, 0) + 1;
  ELSE
    v_new_streak := 1;
  END IF;

  v_is_week := (v_new_streak % 7 = 0);
  v_bonus   := CASE WHEN v_is_week THEN 6 ELSE 1 END;

  UPDATE profiles
  SET
    lp_balance    = lp_balance + v_bonus,
    last_login_at = now(),
    login_streak  = v_new_streak
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  RETURN jsonb_build_object(
    'ok',       true,
    'bonus',    v_bonus,
    'streak',   v_new_streak,
    'is_week',  v_is_week,
    'balance',  v_balance + v_bonus
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_login_bonus(uuid, text)
  TO authenticated;

-- ── 6. transfer_lp_to_actress ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_lp_to_actress(
  p_user_id    uuid,
  p_brand_id   text,
  p_actress_id uuid,
  p_amount     int
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_balance     int;
  v_new_balance int;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  IF p_amount < 1 THEN
    RETURN jsonb_build_object('error', 'invalid_amount');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id  = p_user_id
      AND brand_id = p_brand_id
      AND p_actress_id = ANY(favorite_actress_ids)
  ) THEN
    RETURN jsonb_build_object('error', 'actress_not_in_favorites');
  END IF;

  SELECT lp_balance INTO v_balance
  FROM   profiles
  WHERE  user_id = p_user_id AND brand_id = p_brand_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('error', 'insufficient_balance', 'balance', v_balance);
  END IF;

  v_new_balance := v_balance - p_amount;

  UPDATE profiles
  SET lp_balance = v_new_balance
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  INSERT INTO sn_favorite_actresses (user_id, actress_id, brand_id, assigned_lp, updated_at)
  VALUES (p_user_id, p_actress_id, p_brand_id, p_amount, now())
  ON CONFLICT (user_id, actress_id, brand_id)
  DO UPDATE SET
    assigned_lp = sn_favorite_actresses.assigned_lp + EXCLUDED.assigned_lp,
    updated_at  = now();

  RETURN jsonb_build_object(
    'ok',          true,
    'new_balance', v_new_balance
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_lp_to_actress(uuid, text, uuid, int)
  TO authenticated;
