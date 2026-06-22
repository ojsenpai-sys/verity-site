-- ══════════════════════════════════════════════════════════════════════════════
-- 032_fix_refresh_user_profiles.sql — refresh_user_profiles() の CTE スコープバグ修正
-- ══════════════════════════════════════════════════════════════════════════════
-- 【不具合】(027 で定義) refresh_user_profiles() が毎回 error。
--   cron_status_runs.error = 'relation "agg" does not exist'
--
-- 【原因】1つ目の INSERT 文に付けた WITH(per_user_tag, ranked, agg, tops, final) は
--   その文だけのスコープ。続く 2つ目の INSERT(user_preference_snapshots) が
--   `FROM agg` と参照していたため、スコープ外で relation 不在エラー。
--   EXCEPTION ハンドラがサブトランザクションごと巻き戻すため、1つ目の
--   user_preference_profiles への投入も毎回ロールバック → テーブル常に0件。
--
-- 【修正】per_user_tag を TEMP TABLE(_put, ON COMMIT DROP) に materialize し、
--   profiles 用と snapshots 用の両 INSERT で共有する（「当該 run のユーザーのみ
--   snapshot」という元の意味を保持）。あわせて unnest 由来の NULL タグを除外
--   （jsonb_object_agg の null key エラーを将来にわたり防止）。
--
-- 冪等（CREATE OR REPLACE）。本番へは手動 SQL 適用後、SELECT で動作確認する。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_user_profiles()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; t0 timestamptz := clock_timestamp();
        v_today date := (now() AT TIME ZONE 'Asia/Tokyo')::date;
BEGIN
  INSERT INTO cron_status_runs(job_name) VALUES ('refresh_user_profiles') RETURNING id INTO v_id;
  BEGIN
    -- ① per_user_tag を一時テーブルへ materialize（複数文で共有）
    DROP TABLE IF EXISTS _put;
    CREATE TEMP TABLE _put ON COMMIT DROP AS
      SELECT e.user_id, t.tag,
             SUM(COALESCE(w.weight,0)) AS score,
             COUNT(*)                  AS cnt,
             MAX(e.created_at)         AS last_at
      FROM public.user_events e
      JOIN public.preference_weights w ON w.event_name = e.event_name
      JOIN public.articles a ON a.external_id = e.target_id
      CROSS JOIN LATERAL unnest(a.tags) AS t(tag)
      WHERE e.user_id IS NOT NULL
        AND e.target_type = 'article'
        AND a.tags IS NOT NULL
        AND t.tag IS NOT NULL          -- null key 防止
      GROUP BY e.user_id, t.tag;

    -- ② プロファイル本体 UPSERT
    WITH ranked AS (
      SELECT user_id, tag, score, cnt, last_at,
             row_number() OVER (PARTITION BY user_id ORDER BY score DESC, tag) AS rn
      FROM _put
    ),
    agg AS (
      SELECT user_id,
             jsonb_object_agg(tag, score) AS prefs,
             SUM(cnt)::int                AS event_count,
             MAX(last_at)                 AS last_event_at
      FROM _put GROUP BY user_id
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

    -- ③ 当日スナップショット（_put を再集約。旧コードが参照していた agg と同義）
    INSERT INTO public.user_preference_snapshots (user_id, snapshot_date, prefs, event_count)
    SELECT user_id, v_today, jsonb_object_agg(tag, score), SUM(cnt)::int
    FROM _put GROUP BY user_id
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
