-- ══════════════════════════════════════════════════════════════════════════════
-- Phase 8: My Gallery + SNS Search Notification
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. profiles: ギャラリー既読管理 ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_gallery_checked_at timestamptz;

-- ── 2. actresses: X スクリーンネーム管理 ─────────────────────────────────────
ALTER TABLE public.actresses
  ADD COLUMN IF NOT EXISTS twitter_screen_name text;

-- ── 3. sn_sns_search_requests: 捜索依頼メール送信履歴（24h 重複防止） ──────────
CREATE TABLE IF NOT EXISTS public.sn_sns_search_requests (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actress_id  uuid        NOT NULL REFERENCES public.actresses(id) ON DELETE CASCADE,
  brand_id    text        NOT NULL DEFAULT 'verity',
  user_id     uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sn_search_req_actress_time_idx
  ON public.sn_sns_search_requests (actress_id, user_id, created_at DESC);

ALTER TABLE public.sn_sns_search_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can read own search requests"
  ON public.sn_sns_search_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users can insert own search requests"
  ON public.sn_sns_search_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT ON public.sn_sns_search_requests TO authenticated;
