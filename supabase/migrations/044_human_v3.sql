-- ══════════════════════════════════════════════════════════════════════════════
-- 044_human_v3.sql — Human Analytics v3（能動ベース・additive・既存v2非破壊）
-- ══════════════════════════════════════════════════════════════════════════════
-- 【背景】v2(033/039)の Human 定義 = 「bot UA除外 ∧ 窓内 events>=2」は、トップの
--   自動カルーセル hero_auto_slide_view（1表示で平均3.12回・最大24回 自動発火）だけで
--   閾値>=2 を満たしてしまい、Human を実測で約5倍(30日 MAU: v3実測 1,640 に対し v2 8,817)に
--   過大計上していた。現行 Human の 79.5% が「自動発火だけで>=2達成」、80.9% が「能動0」。
--
-- 【v3 方針】非破壊 additive。Raw / Human v2 / Human v3 を並行運用する。
--   Human v3 = NOT is_bot_ua(UA)  AND  (
--        ① 能動(intent)イベントが 1件以上         is_active_event()
--     OR ② page_view の distinct page_path が 2件以上（複数ページ回遊）
--   )
--   判定に「自動/受動 impression イベント」(is_auto_event) は一切カウントしない。
--
-- 【video_view / actress_view を能動から除外した理由】
--   両者は作品/女優ページの LogView が「ページロード時」に発火するインプレッション型で、
--   実測で video_view の 92% / actress_view の 83% が bot UA。単独で Human 化させると
--   UA未捕捉クローラ（素の Chrome UA）を誤計上する。ただし作品/女優ページは PageViewTracker が
--   page_view も併発する（path=作品/女優URL）ため、複数作品を閲覧した実ユーザーは②で自然に
--   捕捉される。単一作品だけ見て離脱したセッションは意図的に非Human（単一ページクローラと
--   区別不能なため）＝既知の割り切り。
--
-- 既存 033(is_bot_ua / get_audience_counts_v2) / 039(human_sessions_since /
-- get_human_engagement_counts) は一切編集しない（forward-fix）。冪等。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ① 自動/受動 impression イベント判定（除外対象・将来の impression 系も拾う） ──────
-- 明示列挙 ＋ 命名規約サフィックス（*_impression / *_slide_view）で将来の自動系を自動除外。
-- ※ hero_auto_fanza_click（能動クリック）は末尾が _fanza_click のため誤って拾わない。
CREATE OR REPLACE FUNCTION public.is_auto_event(ev text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT ev = ANY (ARRAY[
    'hero_auto_slide_view','spotlight_view','hero_preview_play','hero_preview_complete'
  ])
  OR ev LIKE '%\_impression' ESCAPE '\'
  OR ev LIKE '%\_slide\_view' ESCAPE '\';
$$;

-- ── ② 能動(intent)イベント判定 ────────────────────────────────────────────────
-- クリック/明示操作系のみ。video_view / actress_view / page_view は含めない（上記理由）。
CREATE OR REPLACE FUNCTION public.is_active_event(ev text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT ev = ANY (ARRAY[
    'fanza_click','favorite_work','favorite_actress','unfavorite_work','unfavorite_actress',
    'signup_start','signup_complete','hero_rank_select','hero_preview_open',
    'hero_preview_fanza_click','hero_auto_fanza_click','spotlight_click','storeos_click',
    'weekly_ranking_entity_click','weekly_ranking_fanza_click','weekly_ranking_tab_view'
  ]);
$$;

-- ── ③ Human v3 セッション（窓指定・単一ソース。live も backfill も本関数を使う） ──────
-- bot UA行を除外 → session_id で GROUP → ①能動>=1 OR ②distinct page_path(page_view)>=2。
CREATE OR REPLACE FUNCTION public.human_v3_sessions(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(session_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.session_id
  FROM public.user_events e
  WHERE e.session_id IS NOT NULL
    AND NOT public.is_bot_ua(e.user_agent)
    AND e.created_at >= p_from
    AND e.created_at <  p_to
  GROUP BY e.session_id
  HAVING count(*) FILTER (WHERE public.is_active_event(e.event_name)) >= 1
      OR count(DISTINCT e.page_path) FILTER (WHERE e.event_name = 'page_view' AND e.page_path IS NOT NULL) >= 2;
$$;
GRANT EXECUTE ON FUNCTION public.is_auto_event(text)                       TO service_role;
GRANT EXECUTE ON FUNCTION public.is_active_event(text)                     TO service_role;
GRANT EXECUTE ON FUNCTION public.human_v3_sessions(timestamptz,timestamptz) TO service_role;

-- ── ④ get_audience_counts_v3: v3 DAU/WAU/MAU（033/039 と同一 JST 窓定義） ──────────
CREATE OR REPLACE FUNCTION public.get_audience_counts_v3()
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH b AS (
    SELECT
      ((( now() AT TIME ZONE 'Asia/Tokyo')::date       )::timestamp AT TIME ZONE 'Asia/Tokyo') AS d0,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 6 ))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d7,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 29))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d30,
      now() AS tnow
  )
  SELECT
    (SELECT count(*) FROM public.human_v3_sessions((SELECT d0  FROM b), (SELECT tnow FROM b)))::int,
    (SELECT count(*) FROM public.human_v3_sessions((SELECT d7  FROM b), (SELECT tnow FROM b)))::int,
    (SELECT count(*) FROM public.human_v3_sessions((SELECT d30 FROM b), (SELECT tnow FROM b)))::int;
$$;
GRANT EXECUTE ON FUNCTION public.get_audience_counts_v3() TO service_role;

-- ── ⑤ get_human_engagement_counts_v3: v3 Human の 30日エンゲージメント ──────────────
-- Session Depth v3 の分子 = human_nonauto_events（自動イベントを分子から除外＝整合）。
CREATE OR REPLACE FUNCTION public.get_human_engagement_counts_v3()
RETURNS TABLE(
  human_work_views int, human_actress_views int, human_fanza_clicks int,
  human_total_events int, human_nonauto_events int, human_unique_work_viewers int, human_mau int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH w AS (
    SELECT ((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 29)::timestamp AT TIME ZONE 'Asia/Tokyo') AS d30,
           now() AS tnow
  ),
  hs AS (SELECT session_id FROM public.human_v3_sessions((SELECT d30 FROM w), (SELECT tnow FROM w))),
  hev AS (
    SELECT e.event_name, e.session_id
    FROM public.user_events e, w
    WHERE e.created_at >= w.d30 AND e.created_at < w.tnow
      AND e.session_id IN (SELECT session_id FROM hs)
  )
  SELECT
    count(*) FILTER (WHERE event_name='video_view')::int,
    count(*) FILTER (WHERE event_name='actress_view')::int,
    count(*) FILTER (WHERE event_name='fanza_click')::int,
    count(*)::int,
    count(*) FILTER (WHERE NOT public.is_auto_event(event_name))::int,
    count(DISTINCT session_id) FILTER (WHERE event_name='video_view')::int,
    (SELECT count(*) FROM hs)::int
  FROM hev;
$$;
GRANT EXECUTE ON FUNCTION public.get_human_engagement_counts_v3() TO service_role;

-- ── ⑥ kpi_daily_snapshot に v3 列を additive 追加（v2列は不変） ─────────────────────
ALTER TABLE public.kpi_daily_snapshot
  ADD COLUMN IF NOT EXISTS audience_v3_dau              int,
  ADD COLUMN IF NOT EXISTS audience_v3_wau              int,
  ADD COLUMN IF NOT EXISTS audience_v3_mau              int,
  ADD COLUMN IF NOT EXISTS human_v3_work_views          int,
  ADD COLUMN IF NOT EXISTS human_v3_actress_views       int,
  ADD COLUMN IF NOT EXISTS human_v3_fanza_clicks        int,
  ADD COLUMN IF NOT EXISTS human_v3_total_events        int,
  ADD COLUMN IF NOT EXISTS human_v3_nonauto_events      int,
  ADD COLUMN IF NOT EXISTS human_v3_unique_work_viewers int,
  ADD COLUMN IF NOT EXISTS human_v3_mau                 int;

-- ── ⑦ snapshot_daily_kpi を v3 対応へ（★=v3追加分・既存 v2/human_* 書込は完全保持） ──
CREATE OR REPLACE FUNCTION public.snapshot_daily_kpi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
        r1 record; r2 record; h record; r3 record; h3 record;   -- ★ r3 / h3
BEGIN
  SELECT * INTO r1 FROM public.get_audience_counts();
  SELECT * INTO r2 FROM public.get_audience_counts_v2();
  SELECT * INTO h  FROM public.get_human_engagement_counts();
  SELECT * INTO r3 FROM public.get_audience_counts_v3();              -- ★
  SELECT * INTO h3 FROM public.get_human_engagement_counts_v3();      -- ★
  INSERT INTO public.kpi_daily_snapshot AS k (
    snapshot_date, members_total, members_active,
    audience_raw_dau, audience_raw_wau, audience_raw_mau,
    audience_v2_dau, audience_v2_wau, audience_v2_mau,
    preference_profiles, favorite_work_events, favorite_actress_events,
    page_view_total, video_view_total, fanza_click_total, user_events_total,
    human_work_views, human_actress_views, human_fanza_clicks,
    human_total_events, human_unique_work_viewers, human_mau,
    audience_v3_dau, audience_v3_wau, audience_v3_mau,                                 -- ★
    human_v3_work_views, human_v3_actress_views, human_v3_fanza_clicks,               -- ★
    human_v3_total_events, human_v3_nonauto_events, human_v3_unique_work_viewers, human_v3_mau, -- ★
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
    h.human_work_views, h.human_actress_views, h.human_fanza_clicks,
    h.human_total_events, h.human_unique_work_viewers, h.human_mau,
    r3.dau, r3.wau, r3.mau,                                                            -- ★
    h3.human_work_views, h3.human_actress_views, h3.human_fanza_clicks,               -- ★
    h3.human_total_events, h3.human_nonauto_events, h3.human_unique_work_viewers, h3.human_mau, -- ★
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
    human_work_views=EXCLUDED.human_work_views, human_actress_views=EXCLUDED.human_actress_views,
    human_fanza_clicks=EXCLUDED.human_fanza_clicks, human_total_events=EXCLUDED.human_total_events,
    human_unique_work_viewers=EXCLUDED.human_unique_work_viewers, human_mau=EXCLUDED.human_mau,
    audience_v3_dau=EXCLUDED.audience_v3_dau, audience_v3_wau=EXCLUDED.audience_v3_wau, audience_v3_mau=EXCLUDED.audience_v3_mau,           -- ★
    human_v3_work_views=EXCLUDED.human_v3_work_views, human_v3_actress_views=EXCLUDED.human_v3_actress_views,                             -- ★
    human_v3_fanza_clicks=EXCLUDED.human_v3_fanza_clicks, human_v3_total_events=EXCLUDED.human_v3_total_events,                           -- ★
    human_v3_nonauto_events=EXCLUDED.human_v3_nonauto_events, human_v3_unique_work_viewers=EXCLUDED.human_v3_unique_work_viewers,         -- ★
    human_v3_mau=EXCLUDED.human_v3_mau,                                                                                                   -- ★
    updated_at=now();
END; $$;
GRANT EXECUTE ON FUNCTION public.snapshot_daily_kpi() TO service_role;

-- ── ⑧ 過去スナップショットの v3 backfill（生イベントから各日 as-of 再計算・v2列は不変） ──
-- 各 snapshot_date d について window [d-29 .. d+1)(JST) で v3 を再計算し、v3列のみ UPDATE。
CREATE OR REPLACE FUNCTION public.backfill_human_v3_snapshots(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; n int := 0;
        w_start timestamptz; w_end timestamptz; d0 timestamptz; d7 timestamptz;
BEGIN
  FOR d IN
    SELECT snapshot_date FROM public.kpi_daily_snapshot
    WHERE (p_from IS NULL OR snapshot_date >= p_from)
      AND (p_to   IS NULL OR snapshot_date <= p_to)
    ORDER BY snapshot_date
  LOOP
    w_end   := ((d + 1)::timestamp  AT TIME ZONE 'Asia/Tokyo');
    w_start := ((d - 29)::timestamp AT TIME ZONE 'Asia/Tokyo');
    d7      := ((d - 6 )::timestamp AT TIME ZONE 'Asia/Tokyo');
    d0      := ((d      )::timestamp AT TIME ZONE 'Asia/Tokyo');

    UPDATE public.kpi_daily_snapshot k SET
      audience_v3_dau = (SELECT count(*) FROM public.human_v3_sessions(d0,      w_end)),
      audience_v3_wau = (SELECT count(*) FROM public.human_v3_sessions(d7,      w_end)),
      audience_v3_mau = (SELECT count(*) FROM public.human_v3_sessions(w_start, w_end))
    WHERE k.snapshot_date = d;

    WITH hs AS (SELECT session_id FROM public.human_v3_sessions(w_start, w_end)),
    hev AS (
      SELECT e.event_name, e.session_id FROM public.user_events e
      WHERE e.created_at >= w_start AND e.created_at < w_end
        AND e.session_id IN (SELECT session_id FROM hs)
    )
    UPDATE public.kpi_daily_snapshot k SET
      human_v3_work_views          = (SELECT count(*) FILTER (WHERE event_name='video_view')   FROM hev),
      human_v3_actress_views       = (SELECT count(*) FILTER (WHERE event_name='actress_view') FROM hev),
      human_v3_fanza_clicks        = (SELECT count(*) FILTER (WHERE event_name='fanza_click')  FROM hev),
      human_v3_total_events        = (SELECT count(*) FROM hev),
      human_v3_nonauto_events      = (SELECT count(*) FILTER (WHERE NOT public.is_auto_event(event_name)) FROM hev),
      human_v3_unique_work_viewers = (SELECT count(DISTINCT session_id) FILTER (WHERE event_name='video_view') FROM hev),
      human_v3_mau                 = (SELECT count(*) FROM hs)
    WHERE k.snapshot_date = d;

    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;
GRANT EXECUTE ON FUNCTION public.backfill_human_v3_snapshots(date, date) TO service_role;

-- ── ⑨ 初回: 当日行に v3 を反映 ＋ 既存全 snapshot を v3 backfill ─────────────────────
SELECT public.snapshot_daily_kpi();
SELECT public.backfill_human_v3_snapshots();
