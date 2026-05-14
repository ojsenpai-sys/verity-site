-- ── profiles: per-user, per-brand profile ─────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id              text        NOT NULL DEFAULT 'verity',
  display_name          text,
  avatar_url            text,
  -- お気に入り女優（最大3名、actresses.id を参照）
  favorite_actress_ids  uuid[]      NOT NULL DEFAULT '{}',
  -- 称号: 現在表示中の称号ID
  title                 text,
  -- 解除済み称号リスト: [{"id":"newcomer","unlocked_at":"..."}]
  titles_data           jsonb       NOT NULL DEFAULT '[]',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, brand_id),
  CONSTRAINT profiles_max_3_favorites
    CHECK (cardinality(favorite_actress_ids) <= 3)
);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
