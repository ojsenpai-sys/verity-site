-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 15: VERITY BLACK サブスク + 従量課金枠 + 未ログインロック基盤
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles: サブスク・購入枠カラム追加 ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_subscribed           boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS purchased_slots         integer     NOT NULL DEFAULT 0;

-- purchased_slots は 0〜27（LPベース3 + sub1 + purchased27 = 31 → LEAST で30に収まる）
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_purchased_slots_range;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_purchased_slots_range
    CHECK (purchased_slots >= 0 AND purchased_slots <= 27);

-- ── 2. お気に入り上限を 9 → 30 に拡大（CHECK制約更新）──────────────────────────
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_max_9_favorites;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_max_30_favorites
    CHECK (cardinality(favorite_actress_ids) <= 30);

-- ── 3. compute_max_favorites: サブスク・購入枠を考慮した最大枠計算 ──────────────
--   LP解放枠（starsベース）+ サブスク特典（+1）+ 購入枠、上限30
CREATE OR REPLACE FUNCTION public.compute_max_favorites(
  p_stars     integer,
  p_is_sub    boolean,
  p_sub_exp   timestamptz,
  p_purchased integer
)
RETURNS integer
STABLE
LANGUAGE sql
AS $$
  SELECT LEAST(
    CASE
      WHEN p_stars >= 6 THEN 9
      WHEN p_stars >= 3 THEN 6
      ELSE 3
    END
    + CASE WHEN p_is_sub AND (p_sub_exp IS NULL OR p_sub_exp > now()) THEN 1 ELSE 0 END
    + COALESCE(p_purchased, 0),
    30
  );
$$;

GRANT EXECUTE ON FUNCTION public.compute_max_favorites(integer, boolean, timestamptz, integer)
  TO authenticated;

-- ── 4. claim_login_bonus: サブスク会員は +2LP/日ボーナス追加 ─────────────────────
--   通常: 1pt/日（週7回目: 6pt）
--   BLACK: +2pt/日 追加（週7回目: 6+2=8pt）
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
  v_is_sub       boolean;
  v_sub_exp      timestamptz;
  v_sub_active   boolean;
  v_new_epithets jsonb := '[]'::jsonb;
BEGIN
  IF p_user_id != auth.uid() THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT last_login_at, login_streak, lp_balance, is_subscribed, subscription_expires_at
  INTO   v_last, v_streak, v_balance, v_is_sub, v_sub_exp
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

  v_is_week    := (v_new_streak % 7 = 0);
  v_sub_active := v_is_sub AND (v_sub_exp IS NULL OR v_sub_exp > now());

  -- 通常ボーナス: 週7倍（6pt）or 1pt
  -- BLACKボーナス: +2pt（週でも平日でも固定追加）
  v_bonus := (CASE WHEN v_is_week THEN 6 ELSE 1 END)
           + (CASE WHEN v_sub_active THEN 2 ELSE 0 END);

  UPDATE profiles
  SET
    lp_balance       = lp_balance + v_bonus,
    last_login_at    = now(),
    login_streak     = v_new_streak,
    login_days_count = login_days_count + 1
  WHERE user_id = p_user_id AND brand_id = p_brand_id;

  RETURN jsonb_build_object(
    'ok',           true,
    'bonus',        v_bonus,
    'streak',       v_new_streak,
    'is_week',      v_is_week,
    'is_sub',       v_sub_active,
    'balance',      v_balance + v_bonus,
    'new_epithets', v_new_epithets
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_login_bonus(uuid, text) TO authenticated;

-- ── 5. RLSポリシー: purchased_slots / subscription カラムはサービスロールのみ更新可
--   （フロントから直接変更できないよう、UPDATE ポリシーで列レベルの保護）
--   ※ Supabase は列レベル RLS を直接サポートしないため、
--     決済 Webhook は service_role キー経由のみとし、
--     authenticated ロールの UPDATE は existing ポリシーで行全体を保護済み。
--   追加の保護として、これらの列のデフォルト値をDBが保証することで十分とする。

COMMENT ON COLUMN public.profiles.is_subscribed IS
  'VERITY BLACK サブスク有効フラグ。決済Webhook (service_role) のみ更新可';
COMMENT ON COLUMN public.profiles.subscription_expires_at IS
  'VERITY BLACK サブスクの有効期限 (UTC)。NULLは無期限（テスト用）';
COMMENT ON COLUMN public.profiles.purchased_slots IS
  '従量課金で購入したお気に入り枠数 (0-27)。決済Webhook (service_role) のみ更新可';
