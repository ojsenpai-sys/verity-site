-- ══════════════════════════════════════════════════════════════════════════════
-- 039_human_engagement.sql — Human版エンゲージメント指標（additive・既存RAW非破壊）
-- ══════════════════════════════════════════════════════════════════════════════
-- 目的: Human Views/MAU 等を「別KPIとして追加」。既存RAW指標・既存snapshot列は不変。
-- Human定義は単一関数 human_sessions_since() に集約し、get_audience_counts_v2() と
-- get_human_engagement_counts() の両方がそれを使う＝定義ドリフト防止。
-- Human版は直近30日 Human Views ÷ 直近30日 Human MAU（30日/30日）。
-- 冪等。
-- ══════════════════════════════════════════════════════════════════════════════

-- ① 定義の単一ソース: human session = bot UA除外 ∧ p_since以降 events>=2
CREATE OR REPLACE FUNCTION public.human_sessions_since(p_since timestamptz)
RETURNS TABLE(session_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.session_id
  FROM public.user_events e
  WHERE e.session_id IS NOT NULL
    AND NOT public.is_bot_ua(e.user_agent)
    AND e.created_at >= p_since
  GROUP BY e.session_id
  HAVING count(*) >= 2;
$$;
GRANT EXECUTE ON FUNCTION public.human_sessions_since(timestamptz) TO service_role;

-- ② get_audience_counts_v2 を単一ソース使用へリファクタ（出力不変・033と同一窓定義）
CREATE OR REPLACE FUNCTION public.get_audience_counts_v2()
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH b AS (
    SELECT
      ((( now() AT TIME ZONE 'Asia/Tokyo')::date       )::timestamp AT TIME ZONE 'Asia/Tokyo') AS d0,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 6 ))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d7,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 29))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d30
  )
  SELECT
    (SELECT count(*) FROM public.human_sessions_since((SELECT d0  FROM b)))::int,
    (SELECT count(*) FROM public.human_sessions_since((SELECT d7  FROM b)))::int,
    (SELECT count(*) FROM public.human_sessions_since((SELECT d30 FROM b)))::int;
$$;

-- ③ Human版エンゲージメント集計（直近30日・human_mau含む・同一ソース）
CREATE OR REPLACE FUNCTION public.get_human_engagement_counts()
RETURNS TABLE(
  human_work_views int, human_actress_views int, human_fanza_clicks int,
  human_total_events int, human_unique_work_viewers int, human_mau int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH w AS (
    SELECT ((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 29)::timestamp AT TIME ZONE 'Asia/Tokyo') AS d30
  ),
  hs AS (SELECT session_id FROM public.human_sessions_since((SELECT d30 FROM w))),
  hev AS (
    SELECT e.session_id, e.event_name
    FROM public.user_events e, w
    WHERE e.created_at >= w.d30
      AND e.session_id IN (SELECT session_id FROM hs)
  )
  SELECT
    count(*) FILTER (WHERE event_name = 'video_view')::int,
    count(*) FILTER (WHERE event_name = 'actress_view')::int,
    count(*) FILTER (WHERE event_name = 'fanza_click')::int,
    count(*)::int,
    count(DISTINCT session_id) FILTER (WHERE event_name = 'video_view')::int,
    (SELECT count(*) FROM hs)::int
  FROM hev;
$$;
GRANT EXECUTE ON FUNCTION public.get_human_engagement_counts() TO service_role;

-- ④ snapshot に Human列を additive 追加（human_mau も保存＝過去日も行内で再現可能）
ALTER TABLE public.kpi_daily_snapshot
  ADD COLUMN IF NOT EXISTS human_work_views          int,
  ADD COLUMN IF NOT EXISTS human_actress_views       int,
  ADD COLUMN IF NOT EXISTS human_fanza_clicks        int,
  ADD COLUMN IF NOT EXISTS human_total_events        int,
  ADD COLUMN IF NOT EXISTS human_unique_work_viewers int,
  ADD COLUMN IF NOT EXISTS human_mau                 int;

-- ⑤ snapshot_daily_kpi に Human集計を追加（★が追加分・既存列の書込は不変）
CREATE OR REPLACE FUNCTION public.snapshot_daily_kpi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
        r1 record; r2 record; h record;   -- ★ h
BEGIN
  SELECT * INTO r1 FROM public.get_audience_counts();
  SELECT * INTO r2 FROM public.get_audience_counts_v2();
  SELECT * INTO h  FROM public.get_human_engagement_counts();   -- ★
  INSERT INTO public.kpi_daily_snapshot AS k (
    snapshot_date, members_total, members_active,
    audience_raw_dau, audience_raw_wau, audience_raw_mau,
    audience_v2_dau, audience_v2_wau, audience_v2_mau,
    preference_profiles, favorite_work_events, favorite_actress_events,
    page_view_total, video_view_total, fanza_click_total, user_events_total,
    human_work_views, human_actress_views, human_fanza_clicks,           -- ★
    human_total_events, human_unique_work_viewers, human_mau,            -- ★
    updated_at
  ) VALUES (
    v_today,
    (SELECT count(*) FROM public.profiles WHERE brand_id = 'verity'),
    (SELECT count(*) FROM public.user_activity_summary),
    r1.dau, r1.wau, r1.mau,
    r2.dau, r2.wau, r2.mau,
    (SELECT count(*) FROM public.user_preference_profiles),
    (SELECT count(*) FROM public.user_events WHERE event_name = 'favorite_work'),
    (SELECT count(*) FROM public.user_events WHERE event_name = 'favorite_actress'),
    (SELECT count(*) FROM public.user_events WHERE event_name = 'page_view'),
    (SELECT count(*) FROM public.user_events WHERE event_name = 'video_view'),
    (SELECT count(*) FROM public.user_events WHERE event_name = 'fanza_click'),
    (SELECT count(*) FROM public.user_events),
    h.human_work_views, h.human_actress_views, h.human_fanza_clicks,     -- ★
    h.human_total_events, h.human_unique_work_viewers, h.human_mau,      -- ★
    now()
  )
  ON CONFLICT (snapshot_date) DO UPDATE SET
    members_total=EXCLUDED.members_total, members_active=EXCLUDED.members_active,
    audience_raw_dau=EXCLUDED.audience_raw_dau, audience_raw_wau=EXCLUDED.audience_raw_wau, audience_raw_mau=EXCLUDED.audience_raw_mau,
    audience_v2_dau=EXCLUDED.audience_v2_dau, audience_v2_wau=EXCLUDED.audience_v2_wau, audience_v2_mau=EXCLUDED.audience_v2_mau,
    preference_profiles=EXCLUDED.preference_profiles,
    favorite_work_events=EXCLUDED.favorite_work_events, favorite_actress_events=EXCLUDED.favorite_actress_events,
    page_view_total=EXCLUDED.page_view_total, video_view_total=EXCLUDED.video_view_total, fanza_click_total=EXCLUDED.fanza_click_total,
    user_events_total=EXCLUDED.user_events_total,
    human_work_views=EXCLUDED.human_work_views, human_actress_views=EXCLUDED.human_actress_views,        -- ★
    human_fanza_clicks=EXCLUDED.human_fanza_clicks, human_total_events=EXCLUDED.human_total_events,      -- ★
    human_unique_work_viewers=EXCLUDED.human_unique_work_viewers, human_mau=EXCLUDED.human_mau,          -- ★
    updated_at=now();
END; $$;
GRANT EXECUTE ON FUNCTION public.snapshot_daily_kpi() TO service_role;

-- 初回: 当日行の Human列を即時 backfill
SELECT public.snapshot_daily_kpi();
