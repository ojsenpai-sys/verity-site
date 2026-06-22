-- ══════════════════════════════════════════════════════════════════════════════
-- 038_kpi_daily_snapshot.sql — KPI日次スナップショット（7〜14日トレンド観測用）
-- ══════════════════════════════════════════════════════════════════════════════
-- daily_metrics は会員/閲覧/送客/お気に入り数を日次蓄積するが、Audience v2(Human) と
-- Preference はオンデマンド算出のみで日次記録がない。本テーブルにそれらを含む主要KPIを
-- 1日1行で永続化し、後から日次推移を観測できるようにする。
--
-- 仕組み: snapshot_daily_kpi() が現在値を当日行へ UPSERT。refresh_analytics()(pg_cron
-- 30分間隔)末尾から guarded で呼ぶ（scheduler非依存・snapshot失敗はanalytics本体に波及せず）。
-- 当日行は実行毎に最新値へ更新＝日末に最終値が残る。冪等。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.kpi_daily_snapshot (
  snapshot_date           date PRIMARY KEY,
  members_total           int,
  members_active          int,
  audience_raw_dau        int, audience_raw_wau int, audience_raw_mau int,
  audience_v2_dau         int, audience_v2_wau int, audience_v2_mau int,
  preference_profiles     int,
  favorite_work_events    int,
  favorite_actress_events int,
  page_view_total         int,
  video_view_total        int,
  fanza_click_total       int,
  user_events_total       int,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kpi_daily_snapshot TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_daily_kpi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
        r1 record; r2 record;
BEGIN
  SELECT * INTO r1 FROM public.get_audience_counts();      -- raw (bot含む)
  SELECT * INTO r2 FROM public.get_audience_counts_v2();   -- v2 (Human)
  INSERT INTO public.kpi_daily_snapshot AS k (
    snapshot_date, members_total, members_active,
    audience_raw_dau, audience_raw_wau, audience_raw_mau,
    audience_v2_dau, audience_v2_wau, audience_v2_mau,
    preference_profiles, favorite_work_events, favorite_actress_events,
    page_view_total, video_view_total, fanza_click_total, user_events_total, updated_at
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
    now()
  )
  ON CONFLICT (snapshot_date) DO UPDATE SET
    members_total=EXCLUDED.members_total, members_active=EXCLUDED.members_active,
    audience_raw_dau=EXCLUDED.audience_raw_dau, audience_raw_wau=EXCLUDED.audience_raw_wau, audience_raw_mau=EXCLUDED.audience_raw_mau,
    audience_v2_dau=EXCLUDED.audience_v2_dau, audience_v2_wau=EXCLUDED.audience_v2_wau, audience_v2_mau=EXCLUDED.audience_v2_mau,
    preference_profiles=EXCLUDED.preference_profiles,
    favorite_work_events=EXCLUDED.favorite_work_events, favorite_actress_events=EXCLUDED.favorite_actress_events,
    page_view_total=EXCLUDED.page_view_total, video_view_total=EXCLUDED.video_view_total, fanza_click_total=EXCLUDED.fanza_click_total,
    user_events_total=EXCLUDED.user_events_total, updated_at=now();
END; $$;
GRANT EXECUTE ON FUNCTION public.snapshot_daily_kpi() TO service_role;

-- refresh_analytics() に guarded で snapshot を組み込む（027の本体を保持＋★追加）
CREATE OR REPLACE FUNCTION public.refresh_analytics()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; t0 timestamptz := clock_timestamp();
        v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  INSERT INTO cron_status_runs(job_name) VALUES ('refresh_analytics') RETURNING id INTO v_id;
  BEGIN
    PERFORM public.upsert_daily_metrics(v_today - 1, v_today);   -- 直近2日のみ（過去不変・低コスト）
    REFRESH MATERIALIZED VIEW public.user_activity_summary;
    REFRESH MATERIALIZED VIEW public.tag_popularity;
    REFRESH MATERIALIZED VIEW public.content_popularity;
    REFRESH MATERIALIZED VIEW public.actress_popularity;
    -- ★ KPI日次スナップショット（観測用）。失敗してもanalytics本体を壊さないよう内側で握る。
    BEGIN
      PERFORM public.snapshot_daily_kpi();
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    UPDATE cron_status_runs SET finished_at=now(), status='ok',
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE cron_status_runs SET finished_at=now(), status='error', error=SQLERRM,
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  END;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_analytics() TO service_role;

-- 初回シード（Day-0 を即時記録）
SELECT public.snapshot_daily_kpi();
