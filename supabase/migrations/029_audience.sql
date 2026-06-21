-- ══════════════════════════════════════════════════════════════════════════════
-- 029_audience.sql — Audience KPI（匿名含む・セッション基準）+ P5用 session インデックス
-- ══════════════════════════════════════════════════════════════════════════════
-- 監査: user_events.session_id は NULL 0%（全イベント付与済み）。匿名96.7%を含む
-- 実トラフィックを session_id 単位で計測でき、P5(共起)でも利用する。
--
-- 注意: session_id は sessionStorage 由来＝「セッション/訪問」単位（日跨ぎで別ID）。
--       本KPIは「ユニーク訪問者」ではなく「訪問(セッション)」基準。UIにもその旨を明示。
--       真のユニーク訪問者が必要になれば永続匿名ID(localStorage)を別途導入する。
-- 冪等。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── インデックス (session_id, created_at DESC) ────────────────────────────────
-- 【採用理由】
--  (1) 主目的=P5 共起/行動シーケンス。「あるセッションのイベントを時系列で引く」
--      WHERE session_id = ? ORDER BY created_at DESC が定番アクセスで本複合indexが最適
--      （session_id先頭で対象セッションへ即到達 → created_at降順で時系列取得）。
--  (2) Audience の distinct(session_id) でも session_id 先頭が重複排除に寄与。
--  ※ created_at 範囲フィルタ単体は既存 idx_user_events_created（created_at先頭）が担当。
--    時間範囲が主・セッション集約が従の重い集計は将来 daily 事前集計化を検討。
--  ※ session_id は NULL 0% のため部分インデックスの利得は無し（採用しない）。
CREATE INDEX IF NOT EXISTS idx_user_events_session_created
  ON public.user_events (session_id, created_at DESC);

-- ── Audience DAU/WAU/MAU = distinct session_id（JSTカレンダー: 当日/過去7日/過去30日） ──
-- JST境界: now()→JST壁時計→::date(JST日)→::timestamp(JST0時)→AT TIME ZONE で UTC instant 化。
CREATE OR REPLACE FUNCTION public.get_audience_counts()
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH b AS (
    SELECT
      ((( now() AT TIME ZONE 'Asia/Tokyo')::date       )::timestamp AT TIME ZONE 'Asia/Tokyo') AS d0,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 6 ))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d7,
      (((((now() AT TIME ZONE 'Asia/Tokyo')::date) - 29))::timestamp AT TIME ZONE 'Asia/Tokyo') AS d30
  )
  SELECT
    (SELECT count(DISTINCT e.session_id) FROM public.user_events e, b WHERE e.session_id IS NOT NULL AND e.created_at >= b.d0)::int,
    (SELECT count(DISTINCT e.session_id) FROM public.user_events e, b WHERE e.session_id IS NOT NULL AND e.created_at >= b.d7)::int,
    (SELECT count(DISTINCT e.session_id) FROM public.user_events e, b WHERE e.session_id IS NOT NULL AND e.created_at >= b.d30)::int;
$$;
GRANT EXECUTE ON FUNCTION public.get_audience_counts() TO service_role;
