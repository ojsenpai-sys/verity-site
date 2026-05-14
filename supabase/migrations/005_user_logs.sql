-- ── sn_user_logs: ユーザー行動ログ (brand_id 対応) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.sn_user_logs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand_id    text        NOT NULL DEFAULT 'verity',
  action_type text        NOT NULL DEFAULT 'click',
  target_type text        NOT NULL,   -- 'genre' | 'actress'
  target_id   text        NOT NULL,   -- genre name | actress external_id
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 集計クエリ用インデックス
CREATE INDEX sn_user_logs_agg   ON public.sn_user_logs (user_id, brand_id, target_type, target_id);
CREATE INDEX sn_user_logs_time  ON public.sn_user_logs (created_at DESC);

ALTER TABLE public.sn_user_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "logs_insert_own"
  ON public.sn_user_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "logs_select_own"
  ON public.sn_user_logs FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.sn_user_logs TO authenticated;
