-- ══════════════════════════════════════════════════════════════════════════════
-- 037_user_events_page_path_nullable.sql — user_events.page_path を nullable 化
-- ══════════════════════════════════════════════════════════════════════════════
-- 【続・スキーマdrift】036(session_id)に続き、本番 user_events.page_path にも
--   NOT NULL 制約が付いていた（migration 024 では nullable と文書化＝drift）。
--   PostgREST OpenAPI の required(NOT NULL w/o default) = {id, event_name, page_path,
--   created_at}。id/created_at は default 有・locale は default 'ja' のため、server由来
--   イベントが値を持てず詰まる残る1列は page_path のみ。
--
-- 【影響】034 RPC / 差分トリガ / 035 backfill はいずれも page_path を持たない server
--   イベントを INSERT するため NOT NULL に違反 → favorite 保存破損・backfill失敗。
--
-- 【対処】page_path を nullable 化（024 文書・合意設計に整合。server事象はpage無し）。
--   ※ 適用順: 034 → 036 → **037** → 035(backfill)。
-- 冪等。
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_events ALTER COLUMN page_path DROP NOT NULL;
