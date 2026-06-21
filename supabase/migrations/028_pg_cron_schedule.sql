-- ══════════════════════════════════════════════════════════════════════════════
-- 028_pg_cron_schedule.sql — 分析の定期更新（任意・pg_cron 有効環境のみ）
-- ══════════════════════════════════════════════════════════════════════════════
-- pg_cron が使えない環境では本ファイルは適用せず、外部cron（VPS crontab 等）で
-- GET /verity/api/cron/refresh-analytics を Bearer CRON_SECRET で叩く方式に代替。
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 既存スケジュールがあれば貼り替え（冪等）
SELECT cron.unschedule('verity_refresh_scores')        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='verity_refresh_scores');
SELECT cron.unschedule('verity_refresh_user_profiles') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='verity_refresh_user_profiles');

-- 30分ごと: タグスコア(026) + 分析(daily_metrics/MV)
SELECT cron.schedule('verity_refresh_scores', '*/30 * * * *', $$
  SELECT public.refresh_tag_scores();
  SELECT public.refresh_analytics();
$$);

-- 60分ごと(毎時15分): ユーザー嗜好プロファイル
SELECT cron.schedule('verity_refresh_user_profiles', '15 * * * *', $$
  SELECT public.refresh_user_profiles();
$$);
