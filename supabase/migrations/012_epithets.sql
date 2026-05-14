-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 9: 二つ名（Epithet）System + 宣伝担当ランキング
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. user_achievements: 二つ名の獲得履歴 ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id    text        NOT NULL DEFAULT 'verity',
  epithet_id  text        NOT NULL,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brand_id, epithet_id)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_brand
  ON public.user_achievements (user_id, brand_id);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "achievements_select_own" ON public.user_achievements
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "achievements_insert_own" ON public.user_achievements
  FOR INSERT WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.user_achievements TO authenticated;

-- ── 2. profiles: 追加カラム ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_days_count      int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lp_transfer_count     int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS favorite_change_count int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS equipped_epithet      text;

-- ── 3. sn_favorite_actresses に ranking 用インデックス ─────────────────────────
CREATE INDEX IF NOT EXISTS sn_fav_actress_lp_rank_idx
  ON public.sn_favorite_actresses (actress_id, brand_id, lp_points DESC);

-- ── 4. claim_login_bonus: login_days_count 増加 + sleeping_dragon チェック ──────
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
  v_last         timestamptz;
  v_streak       int;
  v_balance      int;
  v_diff_h       float;
  v_new_streak   int;
  v_bonus        int;
  v_is_week      boolean;
  v_new_epithets jsonb := '[]'::jsonb;
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

  -- sleeping_dragon: 3日（72時間）以上の空白から復帰
  IF v_last IS NOT NULL AND v_diff_h >= 72 THEN
    INSERT INTO user_achievements (user_id, brand_id, epithet_id)
    VALUES (p_user_id, p_brand_id, 'sleeping_dragon')
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_new_epithets := v_new_epithets || '["sleeping_dragon"]'::jsonb;
    END IF;
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
    lp_balance       = lp_balance + v_bonus,
    last_login_at    = now(),
    login_streak     = v_new_streak,
    login_days_count = login_days_count + 1
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  RETURN jsonb_build_object(
    'ok',          true,
    'bonus',       v_bonus,
    'streak',      v_new_streak,
    'is_week',     v_is_week,
    'balance',     v_balance + v_bonus,
    'new_epithets', v_new_epithets
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_login_bonus(uuid, text) TO authenticated;

-- ── 5. transfer_lp_to_actress: lp_transfer_count + 二つ名チェック ──────────────
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
  v_balance            int;
  v_is_legend          boolean;
  v_titles             jsonb;
  v_lp_cap             int;
  v_cur_lp_pts         int;
  v_new_lp_pts         int;
  v_actual             int;
  v_new_balance        int;
  v_actress_name       text;
  v_master_id          text;
  v_has_master         boolean;
  v_new_transfer_count int;
  v_daily_transfers    int;
  v_other_lp_count     int;
  v_new_epithets       jsonb := '[]'::jsonb;
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

  SELECT
    lp_balance,
    (titles_data @> '[{"id":"legend_of_verity"}]'::jsonb),
    titles_data,
    lp_transfer_count
  INTO v_balance, v_is_legend, v_titles, v_new_transfer_count
  FROM profiles
  WHERE user_id = p_user_id AND brand_id = p_brand_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('error', 'profile_not_found');
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object('error', 'insufficient_balance', 'balance', v_balance);
  END IF;

  v_lp_cap := CASE WHEN v_is_legend THEN 100 ELSE 30 END;

  SELECT COALESCE(lp_points, 0) INTO v_cur_lp_pts
  FROM sn_favorite_actresses
  WHERE user_id = p_user_id AND actress_id = p_actress_id AND brand_id = p_brand_id;

  v_cur_lp_pts := COALESCE(v_cur_lp_pts, 0);

  IF v_cur_lp_pts >= v_lp_cap THEN
    RETURN jsonb_build_object('error', 'lp_cap_reached', 'cap', v_lp_cap, 'current', v_cur_lp_pts);
  END IF;

  v_new_lp_pts         := LEAST(v_cur_lp_pts + p_amount, v_lp_cap);
  v_actual             := v_new_lp_pts - v_cur_lp_pts;
  v_new_balance        := v_balance - v_actual;
  v_new_transfer_count := COALESCE(v_new_transfer_count, 0) + 1;

  -- actress_master タイトル付与チェック（LEGEND 限定）
  IF v_new_lp_pts >= 100 AND v_is_legend THEN
    SELECT name INTO v_actress_name FROM actresses WHERE id = p_actress_id;
    v_master_id  := 'actress_master_' || p_actress_id::text;
    v_has_master := v_titles @> jsonb_build_array(jsonb_build_object('id', v_master_id));
    IF NOT v_has_master THEN
      v_titles := v_titles || jsonb_build_array(jsonb_build_object(
        'id',          v_master_id,
        'name',        v_actress_name || 'マスター',
        'unlocked_at', now()
      ));

      -- 一騎当千: LEGEND で、他のお気に入り女優への LP が全員 0 の状態でマスター達成
      SELECT COUNT(*)::int INTO v_other_lp_count
      FROM sn_favorite_actresses
      WHERE user_id   = p_user_id
        AND brand_id  = p_brand_id
        AND actress_id != p_actress_id
        AND lp_points > 0;

      IF v_other_lp_count = 0 THEN
        INSERT INTO user_achievements (user_id, brand_id, epithet_id)
        VALUES (p_user_id, p_brand_id, 'invincible_one')
        ON CONFLICT DO NOTHING;
        IF FOUND THEN
          v_new_epithets := v_new_epithets || '["invincible_one"]'::jsonb;
        END IF;
      END IF;
    END IF;
  END IF;

  -- profiles 更新
  UPDATE profiles
  SET lp_balance        = v_new_balance,
      titles_data       = v_titles,
      lp_transfer_count = v_new_transfer_count
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  -- sn_favorite_actresses 更新
  INSERT INTO sn_favorite_actresses
    (user_id, actress_id, brand_id, assigned_lp, lp_points, updated_at)
  VALUES
    (p_user_id, p_actress_id, p_brand_id, v_actual, v_new_lp_pts, now())
  ON CONFLICT (user_id, actress_id, brand_id)
  DO UPDATE SET
    assigned_lp = sn_favorite_actresses.assigned_lp + EXCLUDED.assigned_lp,
    lp_points   = EXCLUDED.lp_points,
    updated_at  = EXCLUDED.updated_at;

  -- LP 転送ログ（battle_general チェック用）
  INSERT INTO sn_user_logs (user_id, brand_id, action_type, target_type, target_id)
  VALUES (p_user_id, p_brand_id, 'lp_transfer', 'actress', p_actress_id::text);

  -- scarlet_maniac: 累計 50 回 LP 付与
  IF v_new_transfer_count >= 50 THEN
    INSERT INTO user_achievements (user_id, brand_id, epithet_id)
    VALUES (p_user_id, p_brand_id, 'scarlet_maniac')
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_new_epithets := v_new_epithets || '["scarlet_maniac"]'::jsonb;
    END IF;
  END IF;

  -- battle_general: 1日に 10 回 LP 付与（今日の転送数）
  SELECT COUNT(*)::int INTO v_daily_transfers
  FROM sn_user_logs
  WHERE user_id     = p_user_id
    AND brand_id    = p_brand_id
    AND action_type = 'lp_transfer'
    AND created_at >= (now() AT TIME ZONE 'Asia/Tokyo')::date AT TIME ZONE 'Asia/Tokyo';

  IF v_daily_transfers >= 10 THEN
    INSERT INTO user_achievements (user_id, brand_id, epithet_id)
    VALUES (p_user_id, p_brand_id, 'battle_general')
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      v_new_epithets := v_new_epithets || '["battle_general"]'::jsonb;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'new_balance',     v_new_balance,
    'lp_points',       v_new_lp_pts,
    'actual_deducted', v_actual,
    'actress_master',  (v_new_lp_pts >= 100 AND v_is_legend),
    'new_epithets',    v_new_epithets
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_lp_to_actress(uuid, text, uuid, int) TO authenticated;

-- ── 6. get_actress_lp_ranking: 女優への LP 捧げランキング ──────────────────────
CREATE OR REPLACE FUNCTION public.get_actress_lp_ranking(
  p_actress_id uuid,
  p_brand_id   text,
  p_limit      int DEFAULT 10
)
RETURNS TABLE(
  rank         bigint,
  display_name text,
  lp_points    int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ROW_NUMBER() OVER (ORDER BY sfa.lp_points DESC)::bigint,
    COALESCE(NULLIF(TRIM(p.display_name), ''), '匿名の推し')::text,
    sfa.lp_points::int
  FROM sn_favorite_actresses sfa
  LEFT JOIN profiles p
    ON p.user_id = sfa.user_id AND p.brand_id = p_brand_id
  WHERE sfa.actress_id = p_actress_id
    AND sfa.brand_id   = p_brand_id
    AND sfa.lp_points  > 0
  ORDER BY sfa.lp_points DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_actress_lp_ranking(uuid, text, int)
  TO authenticated, anon;
