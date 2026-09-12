-- ══════════════════════════════════════════════════════════════════════════════
-- 052_analytics_cron_safety.sql — Analytics cron 安全化（2026-09-05 障害対応）
-- ══════════════════════════════════════════════════════════════════════════════
-- 背景（詳細: docs/incidents/2026-09-05_supabase-cpu-saturation.md）:
--   refresh_tag_scores()(026) の user_events×articles 無期限JOINと、
--   refresh_analytics()(027/038/039/044) 末尾の snapshot_daily_kpi() による
--   user_events 未絞り込み COUNT/セッション集計群(実質14回以上のフルスキャン相当)が、
--   同一 pg_cron job（*/30 * * * *）で束ねて実行され続け、user_events増加
--   （調査時点で約361,009行・539MB）に伴い実行時間が肥大化。2026-09-05 未明に
--   statement timeout超過 → Postgres CPU飽和 → PostgREST/API Gateway連鎖劣化 →
--   VERITY(PM2) max_memory_restart ループに至った。
--
-- 本migrationの内容:
--   A. refresh_tag_scores() を定期実行経路(pg_cron)から除外する
--      （function/tag_scores MV自体はDROPしない。srcから未参照＝デッドコードと
--        確認済みだが、rollback/調査用に残置する）。
--   B. refresh_analytics() から snapshot_daily_kpi() 呼び出しを除外する
--      （function本体を再定義。他の処理は完全に同一のまま維持）。
--   C. snapshot_daily_kpi() 自体は一切変更しない（Human Analytics v3の
--      schema/RPC/計算ロジックは無変更。変更されるのは「呼び出し頻度」のみ）。
--
--      【Phase3.1.1で追記】実DBで pg_get_functiondef() を確認した結果、
--      snapshot_daily_kpi() には cron_status_runs への記録・例外処理・
--      duration計測のいずれも存在しないことが判明した（refresh_analytics()と
--      異なり無防備）。そのため新規wrapper関数 run_snapshot_daily_kpi_job()
--      を追加し、cronからはそちら経由で呼び出す（snapshot_daily_kpi()本体は
--      無変更のまま）。
--   D. 新pg_cron jobは既存jobid(旧verity_refresh_scores=1)に一切依存せず、
--      jobname で管理する。DO $$ ... $$ + EXISTS判定により、本migrationを
--      複数回適用してもduplicate jobは作られない（冪等）。
--   E. 各cronコマンドは `SET statement_timeout = ...` をコマンド文字列内に
--      含める（pg_cronジョブは専用セッションで実行されるため、ロール/DB
--      レベルのstatement_timeoutには一切影響しない）。
--   F. 新規cron jobは作成直後 active=false とする。実行時間を実測検証する
--      までは自動実行を開始しない（別Phaseで有効化）。
--
-- 禁止事項の遵守:
--   - tag_scores MV・関連function・get_top_tags_by_period()はDROPしない。
--   - Human Analytics v3（044: is_auto_event / is_active_event /
--     human_v3_sessions / get_audience_counts_v3 /
--     get_human_engagement_counts_v3 / snapshot_daily_kpi /
--     backfill_human_v3_snapshots）・kpi_daily_snapshot schemaは一切変更しない。
--     snapshot_daily_kpi()本体もCREATE OR REPLACEしない（新規wrapperのみ追加）。
--   - 旧cron job（verity_refresh_scores）はUNSCHEDULE/DELETEせず、
--     active=falseのまま残置する（既にPhase2.2で手動でもactive=false済み。
--     本migrationはその状態をコードとして明文化・冪等に再現するもの）。
--   - global role の statement_timeout は変更しない。
--
-- pg_cron / timezone 実測確認（Phase3.1.1、read-only・本番へ影響なし）:
--   - pg_cron拡張バージョン: 1.6.4
--   - cron.timezone設定値: GMT（UTC相当）← 本migrationのschedule文字列は
--     この実測値に基づき設計している（推測ではない）。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── A. 旧cron（verity_refresh_scores = refresh_tag_scores + refresh_analytics）
--       を定期実行経路から除外。jobidはハードコードせずjobnameで解決する。 ──────
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'verity_refresh_scores';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;
END $$;

-- ── B. refresh_analytics() 再定義：snapshot_daily_kpi() 呼び出しのみ除外。 ──────
--       他の処理（upsert_daily_metrics / 4MV REFRESH / cron_status_runs
--       ログ記録）は 038 版と完全に同一。REFRESH CONCURRENTLY化は別Phase。
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
    -- snapshot_daily_kpi() はここから除外（052）。独立の日次専用cronへ分離。
    UPDATE cron_status_runs SET finished_at=now(), status='ok',
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE cron_status_runs SET finished_at=now(), status='error', error=SQLERRM,
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  END;
END; $$;
GRANT EXECUTE ON FUNCTION public.refresh_analytics() TO service_role;

-- ── C. snapshot_daily_kpi() は本migrationで一切CREATE OR REPLACEしない。
--       044版のまま利用する（Human Analytics v3ロジック完全無変更）。 ─────────
--
--       wrapper: run_snapshot_daily_kpi_job()
--       snapshot_daily_kpi()自体にcron_status_runsロギングが存在しないため
--       （Phase3.1.1で実測確認）、既存のrefresh_analytics()と同一パターンの
--       開始/成功/失敗ログ記録を行うwrapperを新設する。既存cron function群と
--       同じsecurity model（SECURITY DEFINER・SET search_path = public）に
--       揃える。GRANTはservice_roleのみ（cron専用・anon/authenticatedへは
--       公開しない）。
--
--       失敗時の扱い: cron_status_runsへstatus='error'を記録した後、
--       捕捉した例外をRAISEで再送出する。refresh_analytics()は現状
--       例外を握り潰し関数はvoidで正常終了する設計（pg_cron側からは
--       成功に見える）だが、本wrapperは「pg_cron側にもfailedとして残る」
--       ことを優先する設計とする（既存のrefresh_analytics()自体は本Phaseの
--       スコープ外のため変更しない）。
CREATE OR REPLACE FUNCTION public.run_snapshot_daily_kpi_job()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id bigint; t0 timestamptz := clock_timestamp();
BEGIN
  INSERT INTO cron_status_runs(job_name) VALUES ('snapshot_daily_kpi') RETURNING id INTO v_id;
  BEGIN
    PERFORM public.snapshot_daily_kpi();
    UPDATE cron_status_runs SET finished_at=now(), status='ok',
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN
    UPDATE cron_status_runs SET finished_at=now(), status='error', error=SQLERRM,
      duration_ms=EXTRACT(MILLISECONDS FROM clock_timestamp()-t0)::int WHERE id=v_id;
    RAISE;  -- cron_status_runsへの記録後、pg_cron側にもfailedを残すため再送出
  END;
END; $$;
GRANT EXECUTE ON FUNCTION public.run_snapshot_daily_kpi_job() TO service_role;

-- ── D. 新pg_cron job（jobname管理・冪等・作成直後は active=false）。 ─────────
--
-- VPS既存cron（Phase1調査で確認済み・JST基準）:
--   00:05 ranking-snapshot / 00:30 maker-sync / 00:35 メイン同期 /
--   01:00 generate-news / 02:00 generate-actress-profile / 04:00 sale-top30 /
--   日曜 23:10 週間ランキング確定
-- これらと重複しない時間帯を選定した（pg_cronのスケジュールはUTC基準で解釈される
-- ため、JST時刻をUTCへ変換した値をschedule文字列に用いる）。

-- verity_refresh_analytics_4h: JST 03:00/07:00/11:00/15:00/19:00/23:00
--   （= UTC 18:00(前日)/22:00(前日)/02:00/06:00/10:00/14:00 → schedule上は
--     "0 2,6,10,14,18,22 * * *" の6スロットが上記JST時刻に対応）。
--   02:00(generate-actress-profile)・04:00(sale-top30)の中間である03:00、
--   および日曜23:10の週間ランキング確定より10分前倒しの23:00を含むが、
--   本functionの目標実行時間(statement_timeout 120秒以下)であれば
--   23:10開始までに確実に完了し重複しない。
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'verity_refresh_analytics_4h';
  IF v_jobid IS NULL THEN
    v_jobid := cron.schedule(
      'verity_refresh_analytics_4h',
      '0 2,6,10,14,18,22 * * *',
      $cron$SET statement_timeout = '120s'; SELECT public.refresh_analytics();$cron$
    );
    -- 実行時間の実測検証前のため作成直後はactive=false（別Phaseで有効化）
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;
END $$;

-- verity_snapshot_daily_kpi: JST 05:00（= UTC 20:00）。
--   00:05〜04:00 JSTの重いbatch群がすべて完了した後、翌日00:05の
--   ranking-snapshotより前という、既存cronと重ならない閑散時間帯。
--   snapshot_daily_kpi()自体ではなくwrapper run_snapshot_daily_kpi_job()を
--   呼ぶ（cron_status_runsへのログ記録・timeout時RAISEのため）。
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'verity_snapshot_daily_kpi';
  IF v_jobid IS NULL THEN
    v_jobid := cron.schedule(
      'verity_snapshot_daily_kpi',
      '0 20 * * *',
      $cron$SET statement_timeout = '300s'; SELECT public.run_snapshot_daily_kpi_job();$cron$
    );
    -- 実行時間の実測検証前のため作成直後はactive=false（別Phaseで有効化）
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 運用メモ（本migrationはファイル作成のみ・Supabase本番へは未適用）
--
--   適用後の確認手順（別Phaseで実施）:
--   1. 状態確認:
--        SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
--      → verity_refresh_scores(旧) が active=false のまま、
--        verity_refresh_analytics_4h / verity_snapshot_daily_kpi が
--        active=false で新規追加されていることを確認する。
--
--   2. 低負荷時間帯に手動で1回のみ実行し、cron_status_runsで所要時間を確認:
--        SELECT public.refresh_analytics();
--        SELECT public.run_snapshot_daily_kpi_job();  -- snapshot_daily_kpi()を直接ではなくwrapper経由
--        SELECT * FROM cron_status_runs ORDER BY started_at DESC LIMIT 5;
--      （本Phaseでは実行しない）
--
--   3. duration_msがtimeout（120s=120,000ms / 300s=300,000ms）を
--      十分下回ることを確認した上で、有効化する:
--        SELECT cron.alter_job(
--          (SELECT jobid FROM cron.job WHERE jobname='verity_refresh_analytics_4h'),
--          active := true);
--        SELECT cron.alter_job(
--          (SELECT jobid FROM cron.job WHERE jobname='verity_snapshot_daily_kpi'),
--          active := true);
--
--   4. 旧job（verity_refresh_scores）・tag_scores関連MV/functionは
--      active=false / 残置のまま維持する。十分な安定運用実績が得られた後、
--      別PhaseでDROPを検討する（本Phaseでは実施しない）。
-- ══════════════════════════════════════════════════════════════════════════════
