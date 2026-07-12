-- ═══════════════════════════════════════════════════════════════════════════════
-- 042_weekly_rankings_execute_lockdown.sql — 041 の EXECUTE 権限を締め直す
-- ═══════════════════════════════════════════════════════════════════════════════
-- 041 は `revoke all ... from public` で PUBLIC 疑似ロールの EXECUTE を外したが、
-- Supabase では CREATE FUNCTION 時に ALTER DEFAULT PRIVILEGES 経由で anon /
-- authenticated へ「明示的な」EXECUTE 付与が入る。PUBLIC への revoke はこれを
-- 取り消さないため、SECURITY DEFINER 関数(特に書込を行う apply_weekly_rankings)を
-- anon が PostgREST /rpc から呼べてしまう状態になっていた。
--
-- 対象3関数は service_role のみが実行可能であるべき(バッチ専用)。
-- 冪等: 何度適用しても最終状態は「service_role のみ EXECUTE」。
-- weekly_cid_group は純粋関数(関数インデックス用・IMMUTABLE)なので対象外=PUBLIC可のまま。
-- ═══════════════════════════════════════════════════════════════════════════════

revoke execute on function
  public.human_sessions_between(timestamptz, timestamptz)
  from anon, authenticated, public;

revoke execute on function
  public.compute_weekly_rankings(timestamptz, timestamptz, timestamptz, timestamptz, text, integer)
  from anon, authenticated, public;

revoke execute on function
  public.apply_weekly_rankings(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, integer)
  from anon, authenticated, public;

-- service_role のみ実行可(041 で付与済みだが冪等のため明示)
grant execute on function
  public.human_sessions_between(timestamptz, timestamptz) to service_role;
grant execute on function
  public.compute_weekly_rankings(timestamptz, timestamptz, timestamptz, timestamptz, text, integer) to service_role;
grant execute on function
  public.apply_weekly_rankings(timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text, integer) to service_role;
