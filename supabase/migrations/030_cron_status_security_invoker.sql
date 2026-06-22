-- ══════════════════════════════════════════════════════════════════════════════
-- 030_cron_status_security_invoker.sql — public.cron_status_latest 要塞化
-- ══════════════════════════════════════════════════════════════════════════════
-- 【背景】Supabaseセキュリティ診断 (security_definer_view) で
--   public.cron_status_latest が SECURITY DEFINER 相当（PG15+ のview既定）で検出。
--   view はビュー所有者(postgres, bypassrls)権限で実行され、閲覧者の RLS を
--   迂回するため特権昇格の温床になる。
--
-- 【対処】
--   (1) view を security_invoker=true 化 … 閲覧者の権限/RLSで評価させる。
--   (2) 土台テーブル public.cron_status_runs に RLS を有効化（policy無し＝既定拒否）。
--       security_invoker により閲覧者の RLS が効くようになるため、defense-in-depth。
--   (3) anon / authenticated / PUBLIC の権限を明示的に剥奪し、service_role のみ許可。
--
-- 【影響なし】管理ダッシュボードは SUPABASE_SERVICE_ROLE_KEY 経由で参照
--   （src/lib/adminAnalytics.ts getCronStatus）。service_role は RLS を bypass し
--   明示 GRANT も保持するため、本変更後も従来どおり全行取得できる。
--
-- 冪等。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── (1) view を INVOKER 化（閲覧者依存で実行） ───────────────────────────────
ALTER VIEW public.cron_status_latest SET (security_invoker = true);

-- ── (2) 土台テーブルに RLS（policy 無し＝service_role 以外は既定拒否） ─────────
ALTER TABLE public.cron_status_runs ENABLE ROW LEVEL SECURITY;

-- ── (3) ロール制限：anon/authenticated/PUBLIC を剥奪し service_role のみ許可 ──
REVOKE ALL ON public.cron_status_latest FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cron_status_runs   FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.cron_status_latest TO service_role;
GRANT SELECT ON public.cron_status_runs   TO service_role;
