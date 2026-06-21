-- ══════════════════════════════════════════════════════════════════════════════
-- 027_analytics_foundation.sql — VERITY 分析基盤 v1（Phase4.5）
-- ══════════════════════════════════════════════════════════════════════════════
-- 管理KPI/将来P5(共起)/P6(Netflix型reco)で再利用する事前集計層。
-- 画面は raw user_events を表示時に走査しない（本ファイルのMV/表/viewのみ参照）。
-- 冪等。日付は JST(Asia/Tokyo) で集計。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. user_events 追加インデックス（P5/P6で効く。今のうちに） ──────────────────
CREATE INDEX IF NOT EXISTS idx_user_events_user_created   ON public.user_events (user_id,    created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_event_created  ON public.user_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_events_target_created ON public.user_events (target_id,  created_at DESC);

-- ── 1. preference_weights（重みをDB駆動化。関数を書き換えずチューニング可） ────────
CREATE TABLE IF NOT EXISTS public.preference_weights (
  event_name text PRIMARY KEY,
  weight     numeric NOT NULL
);
-- view_work=video_view / click_fanza=fanza_click（既存DB名にマップ）
INSERT INTO public.preference_weights(event_name, weight) VALUES
  ('video_view', 1), ('favorite_work', 3), ('fanza_click', 5)
ON CONFLICT (event_name) DO NOTHING;
GRANT SELECT ON public.preference_weights TO service_role;

-- ── 2. daily_metrics（日次蓄積TABLE。MVにせず数年スケール対応） ───────────────────
CREATE TABLE IF NOT EXISTS public.daily_metrics (
  date          date PRIMARY KEY,
  new_users     int NOT NULL DEFAULT 0,
  total_members int NOT NULL DEFAULT 0,   -- 各日付時点の累計会員 = count(profiles where created_at<=date)
  dau           int NOT NULL DEFAULT 0,
  work_views    int NOT NULL DEFAULT 0,
  actress_views int NOT NULL DEFAULT 0,
  fanza_clicks  int NOT NULL DEFAULT 0,
  fav_works     int NOT NULL DEFAULT 0,
  fav_actresses int NOT NULL DEFAULT 0,
  total_events  int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.daily_metrics TO service_role;

-- 指定期間を日別に再計算してUPSERT（過去行は本式で不変・現在countで上書きしない）
CREATE OR REPLACE FUNCTION public.upsert_daily_metrics(p_from date, p_to date)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO public.daily_metrics AS dm
    (date, new_users, total_members, dau, work_views, actress_views, fanza_clicks, fav_works, fav_actresses, total_events)
  SELECT
    g.d,
    (SELECT count(*) FROM profiles p           WHERE (p.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d),
    (SELECT count(*) FROM profiles p           WHERE (p.created_at AT TIME ZONE 'Asia/Tokyo')::date <= g.d),
    (SELECT count(DISTINCT e.user_id) FROM user_events e WHERE e.user_id IS NOT NULL AND (e.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d),
    (SELECT count(*) FROM user_events e        WHERE e.event_name='video_view'   AND (e.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d),
    (SELECT count(*) FROM user_events e        WHERE e.event_name='actress_view' AND (e.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d),
    (SELECT count(*) FROM user_events e        WHERE e.event_name='fanza_click'  AND (e.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d),
    (SELECT count(*) FROM favorite_articles f  WHERE (f.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d),
    (SELECT count(*) FROM favorite_actresses f WHERE (f.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d),
    (SELECT count(*) FROM user_events e        WHERE (e.created_at AT TIME ZONE 'Asia/Tokyo')::date = g.d)
  FROM (SELECT generate_series(p_from, p_to, interval '1 day')::date AS d) g
  ON CONFLICT (date) DO UPDATE SET
    new_users=EXCLUDED.new_users, total_members=EXCLUDED.total_members, dau=EXCLUDED.dau,
    work_views=EXCLUDED.work_views, actress_views=EXCLUDED.actress_views, fanza_clicks=EXCLUDED.fanza_clicks,
    fav_works=EXCLUDED.fav_works, fav_actresses=EXCLUDED.fav_actresses, total_events=EXCLUDED.total_events;
$$;
GRANT EXECUTE ON FUNCTION public.upsert_daily_metrics(date, date) TO service_role;

-- 初回バックフィル（全履歴）
SELECT public.upsert_daily_metrics(
  LEAST(
    COALESCE((SELECT min((created_at AT TIME ZONE 'Asia/Tokyo')::date) FROM public.user_events), (now() AT TIME ZONE 'Asia/Tokyo')::date),
    COALESCE((SELECT min((created_at AT TIME ZONE 'Asia/Tokyo')::date) FROM public.profiles),     (now() AT TIME ZONE 'Asia/Tokyo')::date)
  ),
  (now() AT TIME ZONE 'Asia/Tokyo')::date
);

-- ── 3. user_activity_summary（per-user MV・PII→service_role限定） ─────────────────
DROP MATERIALIZED VIEW IF EXISTS public.user_activity_summary CASCADE;
CREATE MATERIALIZED VIEW public.user_activity_summary AS
SELECT
  e.user_id,
  count(*)                                              AS total_events,
  count(*) FILTER (WHERE e.event_name='video_view')     AS work_views,
  count(*) FILTER (WHERE e.event_name='actress_view')   AS actress_views,
  count(*) FILTER (WHERE e.event_name='fanza_click')    AS fanza_clicks,
  count(*) FILTER (WHERE e.event_name='favorite_work')    AS fav_works,
  count(*) FILTER (WHERE e.event_name='favorite_actress') AS fav_actresses,
  count(DISTINCT (e.created_at AT TIME ZONE 'Asia/Tokyo')::date)
    FILTER (WHERE e.created_at >= now() - interval '30 days') AS active_days_30d,
  min(e.created_at) AS first_event_at,
  max(e.created_at) AS last_event_at
FROM public.user_events e
WHERE e.user_id IS NOT NULL
GROUP BY e.user_id;
CREATE UNIQUE INDEX user_activity_summary_pk   ON public.user_activity_summary (user_id);
CREATE INDEX        user_activity_summary_last ON public.user_activity_summary (last_event_at DESC);
CREATE INDEX        user_activity_summary_first ON public.user_activity_summary (first_event_at);
GRANT SELECT ON public.user_activity_summary TO service_role;

-- ── 4. tag_popularity（人気/急上昇タグ MV。026式 + prior窓 + rising比） ────────────
DROP MATERIALIZED VIEW IF EXISTS public.tag_popularity CASCADE;
CREATE MATERIALIZED VIEW public.tag_popularity AS
WITH weighted AS (
  SELECT a.tags, e.created_at,
    CASE e.event_name
      WHEN 'favorite_work' THEN 8 WHEN 'fanza_click' THEN 5
      WHEN 'video_view' THEN 2 WHEN 'page_view' THEN 1 ELSE 0 END AS w
  FROM public.user_events e
  JOIN public.articles a ON a.external_id = e.target_id
  WHERE e.target_type='article' AND e.target_id IS NOT NULL
    AND e.event_name IN ('favorite_work','fanza_click','video_view','page_view')
    AND a.tags IS NOT NULL
),
exploded AS (SELECT unnest(tags) AS tag, created_at, w FROM weighted)
SELECT
  tag,
  COALESCE(SUM(w) FILTER (WHERE created_at >= now()-interval '7 days'),0)  AS score_7d,
  COALESCE(SUM(w) FILTER (WHERE created_at >= now()-interval '30 days'),0) AS score_30d,
  COALESCE(SUM(w) FILTER (WHERE created_at >= now()-interval '90 days'),0) AS score_90d,
  COALESCE(SUM(w),0)                                                       AS score_all,
  COALESCE(SUM(w) FILTER (WHERE created_at >= now()-interval '14 days' AND created_at < now()-interval '7 days'),0) AS score_prior7d,
  ROUND(
    COALESCE(SUM(w) FILTER (WHERE created_at >= now()-interval '7 days'),0)::numeric
    / (COALESCE(SUM(w) FILTER (WHERE created_at >= now()-interval '14 days' AND created_at < now()-interval '7 days'),0) + 1)
  , 2) AS rising
FROM exploded
GROUP BY tag;
CREATE UNIQUE INDEX tag_popularity_pk     ON public.tag_popularity (tag);
CREATE INDEX        tag_popularity_30d    ON public.tag_popularity (score_30d DESC NULLS LAST);
CREATE INDEX        tag_popularity_rising ON public.tag_popularity (rising DESC NULLS LAST);
GRANT SELECT ON public.tag_popularity TO anon, authenticated, service_role;

-- ── 5. content_popularity / actress_popularity（MVを読むVIEW・REFRESH不要） ────────
CREATE OR REPLACE VIEW public.content_popularity AS
SELECT s.external_id, a.title, a.slug, a.image_url, s.score_7d, s.score_30d, s.score_all
FROM public.article_scores s JOIN public.articles a ON a.external_id = s.external_id;
GRANT SELECT ON public.content_popularity TO service_role;

CREATE OR REPLACE VIEW public.actress_popularity AS
SELECT s.external_id, ac.name, ac.image_url, s.score_7d, s.score_30d, s.score_all
FROM public.actress_scores s JOIN public.actresses ac ON ac.external_id = s.external_id
WHERE ac.is_active;
GRANT SELECT ON public.actress_popularity TO service_role;

-- ── 6. user_preference_profiles（行動学習・将来reco土台。診断genre_scoresとは別物） ──
CREATE TABLE IF NOT EXISTS public.user_preference_profiles (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  prefs          jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {"恋愛":42,"人妻":31}
  top_tags       text[]      NOT NULL DEFAULT '{}',          -- 上位5タグ名
  top_tags_count jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- 上位5（重み付き・Explainability用）
  dominant_tag   text,                                        -- top_tags[1]（セグメント分析用）
  event_count    int         NOT NULL DEFAULT 0,
  last_event_at  timestamptz,                                 -- 将来の差分更新用に保持
  version        int         NOT NULL DEFAULT 1,              -- 重み/アルゴリズム世代
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_preference_profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.user_preference_snapshots (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  prefs         jsonb NOT NULL DEFAULT '{}'::jsonb,
  event_count   int   NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, snapshot_date)
);
GRANT SELECT ON public.user_preference_snapshots TO service_role;

-- ── 7. cron_status_runs（履歴型）+ cron_status_latest ────────────────────────────
CREATE TABLE IF NOT EXISTS public.cron_status_runs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_name    text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status      text,
  duration_ms int,
  error       text
);
CREATE INDEX IF NOT EXISTS cron_status_runs_job_idx ON public.cron_status_runs (job_name, started_at DESC);
GRANT SELECT ON public.cron_status_runs TO service_role;

CREATE OR REPLACE VIEW public.cron_status_latest AS
SELECT DISTINCT ON (job_name) job_name, started_at, finished_at, status, duration_ms, error
FROM public.cron_status_runs
ORDER BY job_name, started_at DESC;
GRANT SELECT ON public.cron_status_latest TO service_role;

-- ── 8. refresh_analytics() — daily_metrics直近2日UPSERT + 2MV REFRESH + ログ ──────
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
    UPDATE cron_status_runs SET finished_at=now(), status='ok',
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE cron_status_runs SET finished_at=now(), status='error', error=SQLERRM,
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  END;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_analytics() TO service_role;

-- ── 9. refresh_user_profiles() — 行動由来嗜好を全件再計算 + 当日snapshot + ログ ────
-- 重みは preference_weights を参照（固定値にしない）。
-- 【将来の差分更新】現状は全件再計算。P6で次のように対象ユーザーのみ再集計へ移行可能:
--   WHERE e.created_at > upp.last_event_at（user_preference_profiles.last_event_at を利用）
CREATE OR REPLACE FUNCTION public.refresh_user_profiles()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; t0 timestamptz := clock_timestamp();
        v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  INSERT INTO cron_status_runs(job_name) VALUES ('refresh_user_profiles') RETURNING id INTO v_id;
  BEGIN
    WITH per_user_tag AS (
      SELECT e.user_id, t.tag,
             SUM(COALESCE(w.weight,0)) AS score,
             COUNT(*)                  AS cnt,
             MAX(e.created_at)         AS last_at
      FROM public.user_events e
      JOIN public.preference_weights w ON w.event_name = e.event_name
      JOIN public.articles a ON a.external_id = e.target_id
      CROSS JOIN LATERAL unnest(a.tags) AS t(tag)
      WHERE e.user_id IS NOT NULL AND e.target_type='article' AND a.tags IS NOT NULL
      GROUP BY e.user_id, t.tag
    ),
    ranked AS (
      SELECT user_id, tag, score, cnt, last_at,
             row_number() OVER (PARTITION BY user_id ORDER BY score DESC, tag) AS rn
      FROM per_user_tag
    ),
    agg AS (
      SELECT user_id,
             jsonb_object_agg(tag, score)          AS prefs,
             SUM(cnt)::int                          AS event_count,
             MAX(last_at)                           AS last_event_at
      FROM per_user_tag GROUP BY user_id
    ),
    tops AS (
      SELECT user_id,
             array_agg(tag ORDER BY rn) FILTER (WHERE rn<=5)        AS top_tags,
             jsonb_object_agg(tag, score) FILTER (WHERE rn<=5)      AS top_tags_count,
             max(tag) FILTER (WHERE rn=1)                           AS dominant_tag
      FROM ranked GROUP BY user_id
    ),
    final AS (
      SELECT a.user_id, a.prefs, COALESCE(t.top_tags,'{}') AS top_tags,
             COALESCE(t.top_tags_count,'{}'::jsonb) AS top_tags_count,
             t.dominant_tag, a.event_count, a.last_event_at
      FROM agg a LEFT JOIN tops t USING (user_id)
    )
    INSERT INTO public.user_preference_profiles AS upp
      (user_id, prefs, top_tags, top_tags_count, dominant_tag, event_count, last_event_at, version, updated_at)
    SELECT user_id, prefs, top_tags, top_tags_count, dominant_tag, event_count, last_event_at, 1, now()
    FROM final
    ON CONFLICT (user_id) DO UPDATE SET
      prefs=EXCLUDED.prefs, top_tags=EXCLUDED.top_tags, top_tags_count=EXCLUDED.top_tags_count,
      dominant_tag=EXCLUDED.dominant_tag, event_count=EXCLUDED.event_count,
      last_event_at=EXCLUDED.last_event_at, updated_at=now();

    INSERT INTO public.user_preference_snapshots (user_id, snapshot_date, prefs, event_count)
    SELECT a.user_id, v_today, a.prefs, a.event_count FROM agg a
    ON CONFLICT (user_id, snapshot_date) DO UPDATE SET
      prefs=EXCLUDED.prefs, event_count=EXCLUDED.event_count;

    UPDATE cron_status_runs SET finished_at=now(), status='ok',
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE cron_status_runs SET finished_at=now(), status='error', error=SQLERRM,
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  END;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_user_profiles() TO service_role;

-- ── 10. 集計ヘルパ RPC（REST集計が難しいものだけ関数化） ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_favorite_user_stats()
RETURNS TABLE(fav_any int, fav_work int, fav_actress int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    (SELECT count(*) FROM (SELECT user_id FROM favorite_articles UNION SELECT user_id FROM favorite_actresses) u)::int,
    (SELECT count(DISTINCT user_id) FROM favorite_articles)::int,
    (SELECT count(DISTINCT user_id) FROM favorite_actresses)::int;
$$;
GRANT EXECUTE ON FUNCTION public.get_favorite_user_stats() TO service_role;

-- 全ユーザーの行動由来嗜好を合算した上位タグ分布（匿名集計・Preference画面用）
CREATE OR REPLACE FUNCTION public.get_preference_distribution(p_limit int DEFAULT 12)
RETURNS TABLE(tag text, total numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT kv.key AS tag, SUM((kv.value)::numeric) AS total
  FROM public.user_preference_profiles upp, jsonb_each_text(upp.prefs) kv
  GROUP BY kv.key
  ORDER BY total DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_preference_distribution(int) TO service_role;
