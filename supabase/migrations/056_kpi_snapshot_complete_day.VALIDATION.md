# 056 kpi_daily_snapshot — Production ROLLBACK検証手順書

対象: `supabase/migrations/056_kpi_snapshot_complete_day.sql`
状態: **本書のみが実体（本番未適用）**。本書は056を**本番へ反映するための手順ではない**。
「056が本番Postgres上で構文エラー無く動作するか」を、**必ずROLLBACKして何も残さない**前提で
確認するための、1回限りの検証専用スクリプトである。

本書を`.sql`ではなく`.md`として管理する理由: [[051_weekly_rankings_perf_idx.RUNBOOK.md]]や
[[055_weekly_rankings_dedicated_login.RUNBOOK.md]]と同じ配置規約（本プロジェクトには
migrationを自動適用するCLI/runnerが存在せず、Supabase SQL Editorでの手動貼り付け実行が
唯一の適用経路。誤って自動実行対象`*.sql`globに含めないため）。ただし本書は「適用手順
(RUNBOOK)」ではなく「ROLLBACK前提の検証手順(VALIDATION)」であるため、末尾サフィックスを
`RUNBOOK`ではなく`VALIDATION`とし、性質の違いを名前で明示する。

---

## 0. 最重要事項（実行者は必ず先に読むこと）

- 本書のSQLは **`BEGIN;` で始まり `ROLLBACK;` で終わる**。**`COMMIT` は一切含まれない。**
- 実行後、本番DBの状態は実行前と完全に一致する（新規関数は作られたままにならず、
  `kpi_daily_snapshot` の内容も一切変化しない）。
- 実行者（Claudeではなく人間のオーナー）が Supabase Dashboard の SQL Editor で
  **貼り付けて1回実行するだけ**でよい設計にしてある。
- **途中で予期しないエラーが出た場合は、それ以上先に進めず、`ROLLBACK;` とだけ入力して
  実行し、トランザクションを終了させてから、エラーメッセージをそのまま貼って報告すること。**
  中途半端な状態のままウィンドウを閉じない（開いたままの他のクエリタブがあると
  トランザクションが宙に浮くため、必ずROLLBACKで明示的に終わらせる）。
- 意図的に例外を発生させる fail-closed テスト（STEP 9）は、`DO $$ ... EXCEPTION WHEN OTHERS
  THEN ... END $$;` ブロックで例外をその場で捕捉する設計にしてあるため、
  **SAVEPOINTは使っていない**。これにより「エラー後にトランザクション全体が
  aborted状態になり後続文が実行できなくなる」というSupabase SQL Editor特有のリスクを
  構造的に回避している（詳細は STEP 9 のコメント参照）。
- secret・接続文字列・パスワード等は本書のどこにも含まれておらず、実行結果としても
  出力されない（確認するのは `snapshot_date` / DAU / WAU / MAU / 関数名 / 実行時間など）。

---

## 1. オーナー向け実行手順

**STEP 1.** Supabase Dashboard → 対象プロジェクト → **SQL Editor** を開く。

**STEP 2.** 本書の「§2 検証SQL（メインブロック）」のコード全体をコピーし、SQL Editorの
新規クエリに貼り付ける。

**STEP 3.** 貼り付けた内容が **全文選択（Ctrl+A等）した状態で見えている範囲すべて**で
あることを確認する（スクロールして先頭が `BEGIN;`、末尾が `ROLLBACK;` になっているか
目視で確認する）。

**STEP 4.** 貼り付けた内容の中に **`COMMIT` という文字列が一箇所も無く**、末尾が
`ROLLBACK;` で終わっていることを確認する（Ctrl+Fで`COMMIT`を検索し、0件であることを
確認するのが確実）。

**STEP 5.** 実行する（Supabase SQL Editorの「Run」）。

**STEP 6.** 実行結果（複数のSELECT結果グリッドと、Messages/Notices欄に出る
`RAISE NOTICE`のログ）を記録する。特に以下をメモする:
  - STEP 1(PRE-STATE)で表示された行
  - STEP 4(`_at()`実行)のNOTICEに出るDAU/WAU/MAU値と`duration_ms`
  - STEP 5(snapshot書き込みテスト)の対象日と値
  - STEP 6(backfillテスト)の戻り値（処理件数）
  - STEP 9(fail-closedテスト)のNOTICEが3件とも「PASS」表記になっているか
  - 最後に `ROLLBACK` が正常終了したこと（エラーが出ていないこと）

**STEP 7.** メインブロックの実行・記録が終わったら、**別のクエリとして**
「§3 ROLLBACK後の確認クエリ」を実行し、結果を記録する。

**STEP 8.** STEP 6とSTEP 7で記録した結果を、この検証を依頼した会話（Claude）に貼り付ける。
貼り付けは値のみでよく、接続情報やダッシュボードのURL等は含めないこと。

---

## 2. 検証SQL（メインブロック・1つのSQL Editorタブに全部貼り付けて一度に実行する）

```sql
-- ══════════════════════════════════════════════════════════════════════════════
-- 056 kpi_daily_snapshot — ROLLBACK前提 production validation
-- 必ず BEGIN で始まり ROLLBACK で終わる。COMMITは一切含まない。
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 1: PRE-STATE（読み取りのみ・値は最小限）
-- ────────────────────────────────────────────────────────────────────────────

-- 1a. 直近のsnapshot行（必要最小列のみ）
SELECT snapshot_date, audience_raw_dau, audience_v2_dau, audience_v3_dau, updated_at
FROM public.kpi_daily_snapshot
WHERE snapshot_date >= '2026-09-04'
ORDER BY snapshot_date DESC
LIMIT 10;

-- 1b. 2026-09-06が欠測であることの確認（0 rows が期待値）
SELECT snapshot_date FROM public.kpi_daily_snapshot WHERE snapshot_date = '2026-09-06';

-- 1c. 056の新規関数がまだ存在しないことの確認（0 rows が期待値）。
--     もし1行でも返った場合は、このブロックの実行をここで止めて
--     『ROLLBACK;』とだけ実行し、「056の関数が既に存在していた」と報告すること。
SELECT proname, pronargs
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'jst_midnight_minus_days', 'get_audience_counts_at',
    'get_audience_counts_v2_at', 'get_audience_counts_v3_at',
    'backfill_kpi_snapshot_complete_day'
  );

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 2: 056 migration本体の適用（このtransaction内のみ・COMMITしない限り本番に残らない）
-- ────────────────────────────────────────────────────────────────────────────
-- 以下は supabase/migrations/056_kpi_snapshot_complete_day.sql の全文と同一である。
-- 実行前に、実際のファイルと本ブロックが一致していることを確認すること
-- （このVALIDATION.mdの作成後にファイルが更新されている可能性があるため）。

-- ── ⓪ jst_midnight_minus_days: JST暦日境界のN日前を返す共通ヘルパー ────────────
CREATE OR REPLACE FUNCTION public.jst_midnight_minus_days(p_as_of timestamptz, p_days int)
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT (((p_as_of AT TIME ZONE 'Asia/Tokyo')::date - p_days)::timestamp AT TIME ZONE 'Asia/Tokyo');
$$;
GRANT EXECUTE ON FUNCTION public.jst_midnight_minus_days(timestamptz, int) TO service_role;

-- ── ① get_audience_counts_at: raw Audience（029）の as_of 版 ──────────────────
CREATE OR REPLACE FUNCTION public.get_audience_counts_at(p_as_of timestamptz)
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    (SELECT count(DISTINCT session_id) FROM public.user_events
       WHERE session_id IS NOT NULL AND created_at >= public.jst_midnight_minus_days(p_as_of, 1)  AND created_at < p_as_of)::int,
    (SELECT count(DISTINCT session_id) FROM public.user_events
       WHERE session_id IS NOT NULL AND created_at >= public.jst_midnight_minus_days(p_as_of, 7)  AND created_at < p_as_of)::int,
    (SELECT count(DISTINCT session_id) FROM public.user_events
       WHERE session_id IS NOT NULL AND created_at >= public.jst_midnight_minus_days(p_as_of, 30) AND created_at < p_as_of)::int;
$$;
GRANT EXECUTE ON FUNCTION public.get_audience_counts_at(timestamptz) TO service_role;

-- ── ② get_audience_counts_v2_at: Human v2（033）の as_of 版 ──────────────────
CREATE OR REPLACE FUNCTION public.get_audience_counts_v2_at(p_as_of timestamptz)
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH ev AS (
    SELECT session_id, created_at
    FROM public.user_events
    WHERE session_id IS NOT NULL
      AND created_at >= public.jst_midnight_minus_days(p_as_of, 30)
      AND created_at <  p_as_of
      AND NOT public.is_bot_ua(user_agent)
  )
  SELECT
    (SELECT count(*) FROM (SELECT session_id FROM ev WHERE created_at >= public.jst_midnight_minus_days(p_as_of, 1)  GROUP BY session_id HAVING count(*) >= 2) s)::int,
    (SELECT count(*) FROM (SELECT session_id FROM ev WHERE created_at >= public.jst_midnight_minus_days(p_as_of, 7)  GROUP BY session_id HAVING count(*) >= 2) s)::int,
    (SELECT count(*) FROM (SELECT session_id FROM ev WHERE created_at >= public.jst_midnight_minus_days(p_as_of, 30) GROUP BY session_id HAVING count(*) >= 2) s)::int;
$$;
GRANT EXECUTE ON FUNCTION public.get_audience_counts_v2_at(timestamptz) TO service_role;

-- ── ③ get_audience_counts_v3_at: Human v3（044）の as_of 版 ──────────────────
CREATE OR REPLACE FUNCTION public.get_audience_counts_v3_at(p_as_of timestamptz)
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    (SELECT count(*) FROM public.human_v3_sessions(public.jst_midnight_minus_days(p_as_of, 1),   p_as_of))::int,
    (SELECT count(*) FROM public.human_v3_sessions(public.jst_midnight_minus_days(p_as_of, 7),   p_as_of))::int,
    (SELECT count(*) FROM public.human_v3_sessions(public.jst_midnight_minus_days(p_as_of, 30),  p_as_of))::int;
$$;
GRANT EXECUTE ON FUNCTION public.get_audience_counts_v3_at(timestamptz) TO service_role;

-- ── ④ snapshot_daily_kpi() 再定義：対象日を「実行日の前日」に変更 ──────────────
CREATE OR REPLACE FUNCTION public.snapshot_daily_kpi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_as_of         timestamptz := ((now() AT TIME ZONE 'Asia/Tokyo')::date::timestamp AT TIME ZONE 'Asia/Tokyo');
  v_snapshot_date date := (now() AT TIME ZONE 'Asia/Tokyo')::date - 1;
  r1 record; r2 record; h record; r3 record; h3 record;
BEGIN
  SELECT * INTO r1 FROM public.get_audience_counts_at(v_as_of);
  SELECT * INTO r2 FROM public.get_audience_counts_v2_at(v_as_of);
  SELECT * INTO h  FROM public.get_human_engagement_counts();
  SELECT * INTO r3 FROM public.get_audience_counts_v3_at(v_as_of);
  SELECT * INTO h3 FROM public.get_human_engagement_counts_v3();
  INSERT INTO public.kpi_daily_snapshot AS k (
    snapshot_date, members_total, members_active,
    audience_raw_dau, audience_raw_wau, audience_raw_mau,
    audience_v2_dau, audience_v2_wau, audience_v2_mau,
    preference_profiles, favorite_work_events, favorite_actress_events,
    page_view_total, video_view_total, fanza_click_total, user_events_total,
    human_work_views, human_actress_views, human_fanza_clicks,
    human_total_events, human_unique_work_viewers, human_mau,
    audience_v3_dau, audience_v3_wau, audience_v3_mau,
    human_v3_work_views, human_v3_actress_views, human_v3_fanza_clicks,
    human_v3_total_events, human_v3_nonauto_events, human_v3_unique_work_viewers, human_v3_mau,
    updated_at
  ) VALUES (
    v_snapshot_date,
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
    r3.dau, r3.wau, r3.mau,
    h3.human_work_views, h3.human_actress_views, h3.human_fanza_clicks,
    h3.human_total_events, h3.human_nonauto_events, h3.human_unique_work_viewers, h3.human_mau,
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
    audience_v3_dau=EXCLUDED.audience_v3_dau, audience_v3_wau=EXCLUDED.audience_v3_wau, audience_v3_mau=EXCLUDED.audience_v3_mau,
    human_v3_work_views=EXCLUDED.human_v3_work_views, human_v3_actress_views=EXCLUDED.human_v3_actress_views,
    human_v3_fanza_clicks=EXCLUDED.human_v3_fanza_clicks, human_v3_total_events=EXCLUDED.human_v3_total_events,
    human_v3_nonauto_events=EXCLUDED.human_v3_nonauto_events, human_v3_unique_work_viewers=EXCLUDED.human_v3_unique_work_viewers,
    human_v3_mau=EXCLUDED.human_v3_mau,
    updated_at=now();
END; $$;
GRANT EXECUTE ON FUNCTION public.snapshot_daily_kpi() TO service_role;

-- ── ⑤ backfill_kpi_snapshot_complete_day: 既存rowのAudience列だけを是正する任意関数 ──
CREATE OR REPLACE FUNCTION public.backfill_kpi_snapshot_complete_day(p_from date, p_to date)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date; n int := 0; v_as_of timestamptz; r1 record; r2 record; r3 record;
BEGIN
  IF p_from IS NULL OR p_to IS NULL THEN
    RAISE EXCEPTION 'backfill_kpi_snapshot_complete_day: p_from/p_to は必須です。全履歴への誤爆を防ぐため、NULLでの実行はできません。明示的な日付範囲を指定してください。';
  END IF;
  IF p_from > p_to THEN
    RAISE EXCEPTION 'backfill_kpi_snapshot_complete_day: p_from(%) は p_to(%) 以前である必要があります。', p_from, p_to;
  END IF;

  FOR d IN
    SELECT snapshot_date FROM public.kpi_daily_snapshot
    WHERE snapshot_date >= p_from AND snapshot_date <= p_to
    ORDER BY snapshot_date
  LOOP
    v_as_of := ((d + 1)::timestamp AT TIME ZONE 'Asia/Tokyo');
    SELECT * INTO r1 FROM public.get_audience_counts_at(v_as_of);
    SELECT * INTO r2 FROM public.get_audience_counts_v2_at(v_as_of);
    SELECT * INTO r3 FROM public.get_audience_counts_v3_at(v_as_of);
    UPDATE public.kpi_daily_snapshot k SET
      audience_raw_dau = r1.dau, audience_raw_wau = r1.wau, audience_raw_mau = r1.mau,
      audience_v2_dau  = r2.dau, audience_v2_wau  = r2.wau, audience_v2_mau  = r2.mau,
      audience_v3_dau  = r3.dau, audience_v3_wau  = r3.wau, audience_v3_mau  = r3.mau
    WHERE k.snapshot_date = d;
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;
GRANT EXECUTE ON FUNCTION public.backfill_kpi_snapshot_complete_day(date, date) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 3: FUNCTION EXISTENCE / SECURITY 確認（読み取りのみ）
-- ────────────────────────────────────────────────────────────────────────────

-- 3a. 6関数すべてが存在し、SECURITY DEFINER + search_path=public であること
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.proconfig AS config,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'jst_midnight_minus_days','get_audience_counts_at','get_audience_counts_v2_at',
    'get_audience_counts_v3_at','snapshot_daily_kpi','backfill_kpi_snapshot_complete_day'
  )
ORDER BY p.proname;
-- 期待: 6行、全てsecurity_definer=true、configに search_path=public を含む

-- 3b. EXECUTE権限がservice_roleのみであること（anon/authenticatedが1行でも出たらFAIL）
SELECT DISTINCT p.proname, r.rolname AS grantee
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public'
  AND p.proname IN ('jst_midnight_minus_days','get_audience_counts_at','get_audience_counts_v2_at','get_audience_counts_v3_at','backfill_kpi_snapshot_complete_day')
ORDER BY p.proname, r.rolname;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 4: *_at() read-only execution（固定as_ofで実行・実行時間をNOTICEで記録）
-- as_of = 2026-09-12 00:00 JST = 2026-09-11 15:00:00+00（固定の過去時刻例。
-- 関数が正しく動くことの確認が目的で、検証を実行する実際の日付には依存しない）。
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t0 timestamptz; t1 timestamptz; r record;
BEGIN
  t0 := clock_timestamp();
  SELECT * INTO r FROM public.get_audience_counts_at('2026-09-11T15:00:00+00'::timestamptz);
  t1 := clock_timestamp();
  RAISE NOTICE 'get_audience_counts_at: dau=%, wau=%, mau=%, duration_ms=%',
    r.dau, r.wau, r.mau, EXTRACT(MILLISECONDS FROM t1 - t0);
END $$;

DO $$
DECLARE t0 timestamptz; t1 timestamptz; r record;
BEGIN
  t0 := clock_timestamp();
  SELECT * INTO r FROM public.get_audience_counts_v2_at('2026-09-11T15:00:00+00'::timestamptz);
  t1 := clock_timestamp();
  RAISE NOTICE 'get_audience_counts_v2_at: dau=%, wau=%, mau=%, duration_ms=% (30日下限ハードニング適用済み)',
    r.dau, r.wau, r.mau, EXTRACT(MILLISECONDS FROM t1 - t0);
END $$;

DO $$
DECLARE t0 timestamptz; t1 timestamptz; r record;
BEGIN
  t0 := clock_timestamp();
  SELECT * INTO r FROM public.get_audience_counts_v3_at('2026-09-11T15:00:00+00'::timestamptz);
  t1 := clock_timestamp();
  RAISE NOTICE 'get_audience_counts_v3_at: dau=%, wau=%, mau=%, duration_ms=%',
    r.dau, r.wau, r.mau, EXTRACT(MILLISECONDS FROM t1 - t0);
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 5: snapshot_daily_kpi() temporary write test（このtransaction内のみの一時的write）
-- ────────────────────────────────────────────────────────────────────────────

-- 5a. 実行前に「今回の対象日（実行日の前日）」がいつになるかを確認しておく
SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS execution_jst_date,
       ((now() AT TIME ZONE 'Asia/Tokyo')::date - 1) AS expected_snapshot_date;

-- 5b. 実行
SELECT public.snapshot_daily_kpi();

-- 5c. 直後の確認: 最新3行（うち1行が5aのexpected_snapshot_dateと一致し、NULLでない値を持つこと）
SELECT snapshot_date, audience_raw_dau, audience_v2_dau, audience_v3_dau, updated_at
FROM public.kpi_daily_snapshot
ORDER BY snapshot_date DESC
LIMIT 3;

-- 5d. 対象日以外の行のupdated_atがSTEP1(1a)の値から変わっていないことの確認
SELECT snapshot_date, updated_at
FROM public.kpi_daily_snapshot
WHERE snapshot_date >= '2026-09-04'
ORDER BY snapshot_date DESC
LIMIT 10;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 6: backfill temporary write test（このtransaction内のみの一時的write）
-- ────────────────────────────────────────────────────────────────────────────

-- 6a. 実行（戻り値=処理件数。09-05,07,08,09,10,11の6件が期待値。09-06は対象行が
--     無いため含まれない＝6件になるはず）
SELECT public.backfill_kpi_snapshot_complete_day('2026-09-05', '2026-09-11') AS rows_updated;

-- 6b. 対象範囲のAudience列が更新されていること
SELECT snapshot_date, audience_raw_dau, audience_v2_dau, audience_v3_dau
FROM public.kpi_daily_snapshot
WHERE snapshot_date BETWEEN '2026-09-05' AND '2026-09-11'
ORDER BY snapshot_date;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 7: 2026-09-06が依然欠測であることの確認（0 rows が期待値）
-- ────────────────────────────────────────────────────────────────────────────

SELECT snapshot_date FROM public.kpi_daily_snapshot WHERE snapshot_date = '2026-09-06';

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 8: range外（p_from/p_toの外側）の行が変化していないことの確認
-- ────────────────────────────────────────────────────────────────────────────

-- 09-04以前の行のupdated_atがSTEP1(1a)の値と一致していること
SELECT snapshot_date, updated_at
FROM public.kpi_daily_snapshot
WHERE snapshot_date < '2026-09-05'
ORDER BY snapshot_date DESC
LIMIT 5;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 9: fail-closed test
-- SAVEPOINTではなく、DO $$ ... EXCEPTION WHEN OTHERS THEN ... END $$; で
-- 例外をその場で捕捉する設計。これによりトランザクション全体がaborted状態に
-- ならず、後続のROLLBACKまで安全に到達できる。
-- ────────────────────────────────────────────────────────────────────────────

-- 9a. p_from が NULL → 例外が発生することを確認
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.backfill_kpi_snapshot_complete_day(NULL, '2026-09-11');
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;
    RAISE NOTICE 'PASS (9a: NULL p_from correctly rejected): %', SQLERRM;
  END;
  IF NOT v_ok THEN
    RAISE NOTICE 'FAIL (9a): backfill(NULL, ...) did NOT raise an exception';
  END IF;
END $$;

-- 9b. p_to が NULL → 例外が発生することを確認
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.backfill_kpi_snapshot_complete_day('2026-09-05', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;
    RAISE NOTICE 'PASS (9b: NULL p_to correctly rejected): %', SQLERRM;
  END;
  IF NOT v_ok THEN
    RAISE NOTICE 'FAIL (9b): backfill(..., NULL) did NOT raise an exception';
  END IF;
END $$;

-- 9c. p_from > p_to（範囲逆転）→ 例外が発生することを確認
DO $$
DECLARE v_ok boolean := false;
BEGIN
  BEGIN
    PERFORM public.backfill_kpi_snapshot_complete_day('2026-09-11', '2026-09-05');
  EXCEPTION WHEN OTHERS THEN
    v_ok := true;
    RAISE NOTICE 'PASS (9c: reversed range correctly rejected): %', SQLERRM;
  END;
  IF NOT v_ok THEN
    RAISE NOTICE 'FAIL (9c): backfill(reversed range) did NOT raise an exception';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- STEP 10: ROLLBACK（絶対にCOMMITしない）
-- ────────────────────────────────────────────────────────────────────────────

ROLLBACK;
```

---

## 3. ROLLBACK後の確認クエリ（§2とは別に、ROLLBACK完了後に実行する）

```sql
-- (a) 056の新規関数が消えていること（0 rows が期待値）
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'jst_midnight_minus_days', 'get_audience_counts_at',
    'get_audience_counts_v2_at', 'get_audience_counts_v3_at',
    'backfill_kpi_snapshot_complete_day'
  );

-- (b) kpi_daily_snapshotがPRE-STATE(§2 STEP1)と完全に一致していること
SELECT snapshot_date, audience_raw_dau, audience_v2_dau, audience_v3_dau, updated_at
FROM public.kpi_daily_snapshot
WHERE snapshot_date >= '2026-09-04'
ORDER BY snapshot_date DESC
LIMIT 10;

-- (c) 2026-09-06が引き続き欠測であること（0 rows が期待値）
SELECT snapshot_date FROM public.kpi_daily_snapshot WHERE snapshot_date = '2026-09-06';

-- (d) pg_cronのjob一覧に変化が無いこと（本検証はcronに一切触れていないため、
--     verity_refresh_scores / verity_refresh_analytics_4h / verity_snapshot_daily_kpi
--     等の状態が検証前と同じであることの確認用・読み取りのみ）
SELECT jobid, jobname, schedule, active FROM cron.job ORDER BY jobid;
```

---

## 4. PASS / FAIL 判定基準

| # | 項目 | PASS条件 |
|---|---|---|
| 1 | §2 STEP1 (PRE-STATE) | 056の6関数が0件（未適用）、2026-09-06が0件（欠測）であることを確認できた |
| 2 | §2 STEP2 (CREATE FUNCTION) | エラー無く完了（構文・依存関係エラーが無い） |
| 3 | §2 STEP3 (関数存在/権限) | 6関数すべて存在・全てsecurity_definer=true・configにsearch_path=public・EXECUTE権限がservice_roleのみ |
| 4 | §2 STEP4 (`_at()`実行) | 3関数とも例外なく完了し、`duration_ms`が明らかに30秒未満（数百ms〜数秒程度が目安） |
| 5 | §2 STEP5 (snapshot書き込み) | 対象日（前日）のみが更新され、DAU/WAU/MAUがNULLでない実数値。他日付のupdated_atが不変 |
| 6 | §2 STEP6 (backfill書き込み) | 戻り値=6（09-05,07,08,09,10,11）。09-05〜09-11のAudience列が更新される |
| 7 | §2 STEP7 (09-06確認) | 0 rows（新規行が作られていない） |
| 8 | §2 STEP8 (range外不変) | 09-04以前のupdated_atがSTEP1と一致（変化なし） |
| 9 | §2 STEP9 (fail-closed) | NOTICEが3件とも `PASS` 表記（`FAIL`が1件でも出たら要報告） |
| 10 | §2 STEP10 (ROLLBACK) | エラー無く完了 |
| 11 | §3 (a) | 0 rows（056の関数が消えている） |
| 12 | §3 (b) | §2 STEP1の値と完全一致 |
| 13 | §3 (c) | 0 rows（09-06が引き続き欠測） |
| 14 | §3 (d) | 検証前と同じjob一覧（cronに変化なし） |

**全14項目がPASSした場合のみ、`PRODUCTION APPLY READINESS = SAFE TO APPLY` と判定する。**
1件でもFAIL・想定外のエラー・statement_timeout/lock_timeout・実行時間が異常に長い
（30秒に近い、または超える）場合は、そのままでは適用せず、該当箇所を報告すること。

---

## 5. 検証結果の報告時に含めてほしい情報

- 上記PASS/FAIL判定基準の表（14項目）それぞれの結果
- STEP4の3つの`duration_ms`
- STEP9の3件のNOTICE文言（PASS/FAILどちらか）
- エラーが出た場合はそのエラーメッセージ全文（secret/接続情報が含まれていないか一度確認してから貼ること）
