-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 20: favorite_actresses — 正規化お気に入りテーブル
-- ══════════════════════════════════════════════════════════════════════════════
--
-- 設計方針:
--   · profiles.favorite_actress_ids（配列）を "ソース of truth" として維持
--   · 本テーブルは正規化ログ: タイムスタンプ・ランキング集計・通知連携の基盤
--   · AFTER UPDATE トリガーで自動同期 → 既存 API・UI に変更不要
--   · SECURITY DEFINER 関数でカウント/ランキングを anon/authenticated に公開
--   · favorite_notification_settings はメール通知の将来連携用スタブ

-- ── 1. favorite_actresses テーブル ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.favorite_actresses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  actress_id  uuid        NOT NULL REFERENCES public.actresses(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, actress_id)
);

CREATE INDEX IF NOT EXISTS fav_actresses_user_idx    ON public.favorite_actresses (user_id);
CREATE INDEX IF NOT EXISTS fav_actresses_actress_idx ON public.favorite_actresses (actress_id);
CREATE INDEX IF NOT EXISTS fav_actresses_created_idx ON public.favorite_actresses (created_at DESC);

ALTER TABLE public.favorite_actresses ENABLE ROW LEVEL SECURITY;

-- ユーザー自身の行のみ参照・追加・削除可
CREATE POLICY "fav_actresses_select_own"
  ON public.favorite_actresses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "fav_actresses_insert_own"
  ON public.favorite_actresses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fav_actresses_delete_own"
  ON public.favorite_actresses FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, DELETE ON public.favorite_actresses TO authenticated;

-- ── 2. 既存データ移行: profiles.favorite_actress_ids → favorite_actresses ─────

INSERT INTO public.favorite_actresses (user_id, actress_id)
SELECT p.user_id, unnest(p.favorite_actress_ids) AS actress_id
FROM   public.profiles p
WHERE  cardinality(p.favorite_actress_ids) > 0
ON CONFLICT DO NOTHING;

-- ── 3. 自動同期トリガー: profiles.favorite_actress_ids 変更時に同期 ─────────────

CREATE OR REPLACE FUNCTION public.sync_favorite_actresses_from_profiles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_ids uuid[] := COALESCE(OLD.favorite_actress_ids, '{}');
  v_new_ids uuid[] := COALESCE(NEW.favorite_actress_ids, '{}');
  v_removed uuid[];
  v_added   uuid[];
BEGIN
  -- 削除された女優UUID
  SELECT array_agg(t.id) INTO v_removed
  FROM unnest(v_old_ids) AS t(id)
  WHERE t.id != ALL(v_new_ids);

  -- 追加された女優UUID
  SELECT array_agg(t.id) INTO v_added
  FROM unnest(v_new_ids) AS t(id)
  WHERE t.id != ALL(v_old_ids);

  IF v_removed IS NOT NULL THEN
    DELETE FROM public.favorite_actresses
    WHERE user_id = NEW.user_id AND actress_id = ANY(v_removed);
  END IF;

  IF v_added IS NOT NULL THEN
    INSERT INTO public.favorite_actresses (user_id, actress_id)
    SELECT NEW.user_id, t.id FROM unnest(v_added) AS t(id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- DROP して再作成（冪等）
DROP TRIGGER IF EXISTS profiles_sync_favorite_actresses ON public.profiles;

CREATE TRIGGER profiles_sync_favorite_actresses
  AFTER UPDATE OF favorite_actress_ids ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_favorite_actresses_from_profiles();

-- ── 4. get_actress_favorite_count: 個別女優のお気に入り数取得（公開） ────────────

CREATE OR REPLACE FUNCTION public.get_actress_favorite_count(p_external_id text)
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COUNT(fa.user_id)::int
  FROM   public.favorite_actresses fa
  JOIN   public.actresses a ON a.id = fa.actress_id
  WHERE  a.external_id = p_external_id
    AND  a.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_actress_favorite_count(text)
  TO anon, authenticated;

-- ── 5. get_actress_favorite_ranking: TOP N ランキング（公開） ────────────────────

CREATE OR REPLACE FUNCTION public.get_actress_favorite_ranking(p_limit int DEFAULT 20)
RETURNS TABLE(
  actress_id     uuid,
  external_id    text,
  name           text,
  image_url      text,
  ruby           text,
  favorite_count int
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    a.id               AS actress_id,
    a.external_id,
    a.name,
    a.image_url,
    a.ruby,
    COUNT(fa.user_id)::int AS favorite_count
  FROM   public.actresses a
  LEFT JOIN public.favorite_actresses fa ON fa.actress_id = a.id
  WHERE  a.is_active = true
  GROUP  BY a.id, a.external_id, a.name, a.image_url, a.ruby
  ORDER  BY favorite_count DESC, a.name ASC
  LIMIT  p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_actress_favorite_ranking(int)
  TO anon, authenticated;

-- ── 6. get_my_favorite_actresses: 自身のお気に入り一覧（登録日付き） ──────────────

CREATE OR REPLACE FUNCTION public.get_my_favorite_actresses(p_user_id uuid)
RETURNS TABLE(
  actress_id   uuid,
  external_id  text,
  name         text,
  image_url    text,
  ruby         text,
  metadata     jsonb,
  favorited_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
BEGIN
  -- 呼び出し元が自分自身のデータを取得することを保証
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    a.id           AS actress_id,
    a.external_id,
    a.name,
    a.image_url,
    a.ruby,
    a.metadata,
    fa.created_at  AS favorited_at
  FROM   public.favorite_actresses fa
  JOIN   public.actresses a ON a.id = fa.actress_id
  WHERE  fa.user_id = p_user_id
    AND  a.is_active = true
  ORDER  BY fa.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_favorite_actresses(uuid)
  TO authenticated;

-- ── 7. favorite_notification_settings: メール通知設定（将来連携用） ─────────────
--
-- 将来の通知ユースケース:
--   · notify_new_work  : お気に入り女優の新作発売アラート
--   · notify_sale      : お気に入り女優のセール開始アラート
--   · notify_weekly    : 週次ランキング変動サマリー
--
-- 通知フロー想定:
--   1. cron job が new_articles をチェック → 対象ユーザーの notify_new_work=true を抽出
--   2. Edge Function (Resend/SendGrid) がメール送信
--   3. delivery_log テーブルに送信履歴保存（将来）

CREATE TABLE IF NOT EXISTS public.favorite_notification_settings (
  user_id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL の場合は auth.users.email を使用
  notify_email       text,
  notify_new_work    boolean     NOT NULL DEFAULT false,
  notify_sale        boolean     NOT NULL DEFAULT false,
  notify_weekly      boolean     NOT NULL DEFAULT false,
  -- 通知頻度制限: 最後に通知を送った日時（スパム防止）
  last_notified_at   timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER fav_notif_updated_at
  BEFORE UPDATE ON public.favorite_notification_settings
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

ALTER TABLE public.favorite_notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fav_notif_own"
  ON public.favorite_notification_settings
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.favorite_notification_settings TO authenticated;

-- サービスロールからの一括通知送信のため SERVICE ROLE にも INSERT 許可
GRANT SELECT ON public.favorite_notification_settings TO service_role;
