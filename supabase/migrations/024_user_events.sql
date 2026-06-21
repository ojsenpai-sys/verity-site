-- ══════════════════════════════════════════════════════════════════════════════
-- 024_user_events.sql — 既存稼働中 user_events のスキーマを version-control
-- ══════════════════════════════════════════════════════════════════════════════
--
-- user_events は本番DBで既に稼働しているが、CREATE 文がリポジトリに欠落していた。
-- 本 migration は **非破壊**（全て IF NOT EXISTS / 冪等）で、既存データ・列は変更しない。
-- 行動ログの正本としてスキーマ・index・RLS を明文化する。
--
-- イベント名（5正規 + signup）:
--   view_work     = video_view   (target_type=article, target_id=CID)
--   view_actress  = actress_view (target_type=actress, target_id=dmm-actress-<id>)
--   click_fanza   = fanza_click  (target_type=article)
--   favorite_work    (新規 Phase4, target_type=article)
--   favorite_actress (新規 Phase4, target_type=actress)
--   signup_start / signup_complete (target_type=NULL)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.user_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,  -- 匿名は NULL
  session_id  text,                                                       -- sessionStorage.verity_sid
  event_name  text        NOT NULL,
  target_type text,                                                       -- 'article' | 'actress' | NULL
  target_id   text,                                                       -- CID / dmm-actress-<id>
  metadata    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  page_path   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 基本 index（023 の article scoring index は別途存在）
CREATE INDEX IF NOT EXISTS user_events_created_idx     ON public.user_events (created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_user_idx        ON public.user_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_events_name_target_idx ON public.user_events (event_name, target_type, target_id, created_at DESC);

ALTER TABLE public.user_events ENABLE ROW LEVEL SECURITY;

-- クライアント（匿名含む）が自分のイベントを INSERT できる。読み取りは service ロールのみ。
DROP POLICY IF EXISTS "user_events_insert_any" ON public.user_events;
CREATE POLICY "user_events_insert_any"
  ON public.user_events FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

GRANT INSERT ON public.user_events TO anon, authenticated;
GRANT SELECT ON public.user_events TO service_role;
