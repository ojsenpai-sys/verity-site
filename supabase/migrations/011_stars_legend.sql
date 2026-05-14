-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 8: Stars System & Legend of Verity
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles: stars_count カラム追加 ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stars_count int NOT NULL DEFAULT 0;

-- ── 2. sn_favorite_actresses: lp_points カラム追加 ────────────────────────────
ALTER TABLE public.sn_favorite_actresses
  ADD COLUMN IF NOT EXISTS lp_points int NOT NULL DEFAULT 0;

-- ── 3. 既存レコードを lp_points に移行（assigned_lp の上限 30 を初期値とする）──
UPDATE public.sn_favorite_actresses
SET lp_points = LEAST(assigned_lp, 30)
WHERE lp_points = 0 AND assigned_lp > 0;

-- ── 4. profiles のお気に入り上限を 3→9 に緩和 ─────────────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_max_3_favorites;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_max_9_favorites
    CHECK (cardinality(favorite_actress_ids) <= 9);

-- ── 5. sync_user_stars: 王冠数に応じて stars_count 更新 & LEGEND 解放 ──────────
CREATE OR REPLACE FUNCTION public.sync_user_stars(
  p_user_id     uuid,
  p_brand_id    text,
  p_crown_count int
)
RETURNS jsonb
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_stars  int;
  v_titles     jsonb;
  v_has_legend boolean;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- 3/6/9 のマイルストーンに切り捨て
  v_new_stars := CASE
    WHEN p_crown_count >= 9 THEN 9
    WHEN p_crown_count >= 6 THEN 6
    WHEN p_crown_count >= 3 THEN 3
    ELSE 0
  END;

  SELECT titles_data INTO v_titles
  FROM profiles
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  IF v_titles IS NULL THEN
    RETURN jsonb_build_object('error', 'profile_not_found');
  END IF;

  -- LEGEND OF VERITY 未解放なら付与
  v_has_legend := v_titles @> '[{"id":"legend_of_verity"}]'::jsonb;
  IF p_crown_count >= 9 AND NOT v_has_legend THEN
    v_titles := v_titles || jsonb_build_array(
      jsonb_build_object('id', 'legend_of_verity', 'unlocked_at', now())
    );
  END IF;

  -- stars_count は減らさない（ratchet）
  UPDATE profiles
  SET
    stars_count = GREATEST(stars_count, v_new_stars),
    titles_data = v_titles
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  RETURN jsonb_build_object('ok', true, 'new_stars', v_new_stars);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_user_stars(uuid, text, int) TO authenticated;

-- ── 6. transfer_lp_to_actress: lp_points キャップ対応 + actress_master 付与 ────
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
  v_balance       int;
  v_is_legend     boolean;
  v_titles        jsonb;
  v_lp_cap        int;
  v_cur_lp_pts    int;
  v_new_lp_pts    int;
  v_actual        int;
  v_new_balance   int;
  v_actress_name  text;
  v_master_id     text;
  v_has_master    boolean;
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
    titles_data
  INTO v_balance, v_is_legend, v_titles
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

  v_new_lp_pts  := LEAST(v_cur_lp_pts + p_amount, v_lp_cap);
  v_actual      := v_new_lp_pts - v_cur_lp_pts;  -- 実際に消費する LP
  v_new_balance := v_balance - v_actual;

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
    END IF;
  END IF;

  -- profiles: 残高 & タイトルを一括更新
  UPDATE profiles
  SET lp_balance = v_new_balance,
      titles_data = v_titles
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  -- sn_favorite_actresses: assigned_lp（累計）+ lp_points（キャップ付き）更新
  INSERT INTO sn_favorite_actresses
    (user_id, actress_id, brand_id, assigned_lp, lp_points, updated_at)
  VALUES
    (p_user_id, p_actress_id, p_brand_id, v_actual, v_new_lp_pts, now())
  ON CONFLICT (user_id, actress_id, brand_id)
  DO UPDATE SET
    assigned_lp = sn_favorite_actresses.assigned_lp + EXCLUDED.assigned_lp,
    lp_points   = EXCLUDED.lp_points,
    updated_at  = EXCLUDED.updated_at;

  RETURN jsonb_build_object(
    'ok',             true,
    'new_balance',    v_new_balance,
    'lp_points',      v_new_lp_pts,
    'actual_deducted', v_actual,
    'actress_master', (v_new_lp_pts >= 100 AND v_is_legend)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_lp_to_actress(uuid, text, uuid, int) TO authenticated;
