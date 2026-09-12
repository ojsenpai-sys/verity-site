-- ══════════════════════════════════════════════════════════════════════════════
-- 056_kpi_snapshot_complete_day.sql — kpi_daily_snapshot の部分日問題を修正
-- ══════════════════════════════════════════════════════════════════════════════
-- 【背景】052（2026-09-05障害対応）で snapshot_daily_kpi() の呼び出し元が、
--   「refresh_analytics()末尾から30分毎」から「専用cron verity_snapshot_daily_kpi
--   による日次1回・JST 05:00」へ変更された。ところが snapshot_daily_kpi() 自体は
--   `v_today := (now() AT TIME ZONE 'Asia/Tokyo')::date` で「実行時点のJST暦日」を
--   snapshot_date として使い続けており、DAU/WAU/MAU も内部で呼ぶ
--   get_audience_counts()/_v2()/_v3() がいずれも「窓の開始 〜 now()」で計算する
--   （上限が無く、実行時刻がそのまま上限になる）ため、実行時刻が05:00の現在は
--   「その日の00:00〜05:00 JST（5時間分）」しかDAUに算入されない状態になっていた。
--
--   旧cron（30分毎）ではその日の最終実行が23:30頃だったため実質ほぼ丸1日分の値が
--   残っていたが、052以降は同じ「日次スナップショット」という体裁のまま、実際には
--   「実行日のうち経過した5時間だけ」を保存するようになり、KPI Trend表で
--   「ほぼ24時間値の過去行」と「5時間値の直近行」が同じ列に並び、DAUだけ急落して
--   見える表示問題が発生した（実トラフィックは減少していない。read-only調査で
--   2026-09-11のraw user_events全量は直近最多の8,314件と確認済み）。
--
-- 【方針】
--   A. cron実行時刻（JST 05:00）は変更しない。
--   B. snapshot_daily_kpi() が保存する対象を「実行時点」から
--      「直前に完了したJST暦日（＝実行日の前日）」に変更する。
--      例: 2026-09-12 05:00 JST 実行 → snapshot_date = 2026-09-11
--          DAU対象 = 2026-09-11 00:00 〜 2026-09-12 00:00 JST（丸24時間・確定値）
--          WAU対象 = 2026-09-05 00:00 〜 2026-09-12 00:00 JST（直近7完全日）
--          MAU対象 = 2026-08-13 00:00 〜 2026-09-12 00:00 JST（直近30完全日）
--   C. 既存のリアルタイム関数 get_audience_counts() / get_audience_counts_v2() /
--      get_audience_counts_v3() / human_v3_sessions() / is_active_event() /
--      is_auto_event() は一切変更しない（Overview等のリアルタイム表示の挙動を
--      変えないため）。snapshot専用に、明示的な as_of 時刻を受け取る
--      `_at` 版を新規追加し、snapshot_daily_kpi() だけがそれを使う。
--      特に v3 は human_v3_sessions(p_from, p_to) が既に窓を明示指定できる
--      設計だったため、Human v3 の判定ロジックには一切触れず窓の与え方だけを
--      変える（get_audience_counts_v3_at は human_v3_sessions を素通しで呼ぶだけ）。
--   D. 過去の部分日値（2026-09-05: 手動1回実行・約6時間分／2026-09-07以降:
--      日次cronによる約5時間分。2026-09-06は欠測＝該当日の行自体が存在しない）を
--      是正するための backfill_kpi_snapshot_complete_day(p_from, p_to) を追加するが、
--      本migrationでは自動実行しない（過去データの書き換えは別途オーナー判断で
--      手動実行する。RUNBOOK的な位置づけはこのファイル末尾のコメント参照）。
--   E. human_work_views 等の Human Engagement 列（039/044の
--      get_human_engagement_counts()/_v3()）は本migrationの対象外。これらは
--      「直近30日の累計」であり、末尾1日が部分日でも影響が30分の1程度に希釈される
--      ため実害が小さく、既存のnow()依存のまま温存する（将来必要になれば別migration
--      で同様の_at化を検討）。
--
-- 【Phase2ハードニング（SQL Safety Review指摘への対応）】
--   F. get_audience_counts_v2_at() の ev CTE に明示的な30日下限を追加。
--      DAU/WAU/MAUはいずれも30日以内のサブセットのため出力値には影響しない
--      （033由来の無下限フルスキャン特性だけを断つ）。
--   G. *_at() 3関数の窓境界計算を、timestamptz上でのinterval減算
--      (`p_as_of - interval 'N days'`) から、029/033/044と同じ
--      「date型で整数日減算 → 1回だけAT TIME ZONE変換」方式に統一する
--      （ambient session timezone非依存・DST環境でも意味が変わらない）。
--      共通化のため public.jst_midnight_minus_days(timestamptz, int) を新設。
--   H.（後にIで撤回・§K参照）backfill_kpi_snapshot_complete_day() を一時UPSERT化
--      （INSERT ... ON CONFLICT DO UPDATE + generate_series）して2026-09-06の
--      新規作成を試みたが、Historical Backfill Completeness Audit（§K）の結果、
--      「Audience列だけが入りその他がNULLだらけの不完全な行」を新規生成することに
--      なると判明したため撤回し、既存行のみを対象とするUPDATE専用に戻した
--      （最終仕様は§Kおよび関数本体のコメント参照）。
--   I. p_from/p_to を必須化（NULL指定時は例外を送出するfail-closed）。
--      デフォルトNULL＝全履歴対象という誤操作の温床を除去する（この方針はUPSERT化
--      撤回後も維持）。
--
-- 【Historical Backfill Completeness Audit（Phase3・本節が最終方針）】
--   K. kpi_daily_snapshotの全列を「as_ofで過去再計算可能か」で監査した結果:
--        - Audience raw/v2/v3 の DAU/WAU/MAU 9列: 可能（_at()版で実装済み）
--        - members_total / members_active / preference_profiles の3列:
--          不可能（退会・削除の追跡が無い、または「現在保持数」という性質上
--          過去のcount自体が存在しない概念のため）
--        - Human Engagement系（039/044）13列: 理論上は可能だが専用の`_at`版が
--          存在せず、新規実装は本修正のスコープ外
--      → 3列が原理的に再現不可能である以上、「完全な行」を欠測日に新規生成する
--      ことはできない。したがって backfill_kpi_snapshot_complete_day() は
--      【既存行のAudience列のみを是正するUPDATE専用】とし、行が存在しない日
--      （2026-09-06）は意図的に復元しない（欠測日のまま維持する）。
--      「その日について意味の揃ったsnapshot」原則を、一部の日を埋められない
--      犠牲を払ってでも優先する。
--   J. migration末尾の自動シード実行 `SELECT public.snapshot_daily_kpi();` を
--      削除し、function/schema定義のみのmigrationにする。適用後のシードは
--      オーナーが明示的に手動実行する運用に分離する（詳細は末尾コメント参照）。
--
-- 冪等（CREATE OR REPLACE / IF NOT EXISTS のみ、DROPなし）。
-- ══════════════════════════════════════════════════════════════════════════════

-- ── ⓪ jst_midnight_minus_days: JST暦日境界のN日前を返す共通ヘルパー ────────────
-- p_as_ofのJST暦日（時刻成分は捨てる）からp_days日引いた日の00:00 JSTのinstantを返す。
-- 029/033/044の `((date)::timestamp AT TIME ZONE 'Asia/Tokyo')` と同一技法（date型の
-- 整数日減算 → 1回だけAT TIME ZONE変換）で、timestamptz上でのinterval減算
-- (`p_as_of - interval 'N days'`) のようにambient session timezoneのDST規則に
-- 理論上左右される余地を持たない。Asia/TokyoにDSTは無いため数値上の結果は
-- 従来のinterval減算と一致する（Asia/Tokyo単体では値が変わらないことをtest済み）。
-- 【前提】p_as_ofはJST暦日の境界（00:00 JST）に揃っている呼び出しのみを想定する
-- （本migration内の呼び出し元は全てそう）。境界に揃っていないp_as_ofを渡した場合、
-- 戻り値は「p_as_ofの時刻成分」ではなく「p_as_ofが属するJST暦日の00:00からp_days日前」
-- になる点に注意。
CREATE OR REPLACE FUNCTION public.jst_midnight_minus_days(p_as_of timestamptz, p_days int)
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT (((p_as_of AT TIME ZONE 'Asia/Tokyo')::date - p_days)::timestamp AT TIME ZONE 'Asia/Tokyo');
$$;
GRANT EXECUTE ON FUNCTION public.jst_midnight_minus_days(timestamptz, int) TO service_role;

-- ── ① get_audience_counts_at: raw Audience（029）の as_of 版 ──────────────────
-- 029の get_audience_counts() と同一の集計（distinct session_id、bot除外なし）。
-- 違いは唯一、窓の上限を now() 暗黙依存ではなく明示的な p_as_of にしたこと
-- （p_as_of は過去時刻を渡せる＝「あの時点で締めたらいくつだったか」を再現できる）。
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
-- 033の get_audience_counts_v2() と同一の集計（bot UA除外 ∧ 窓内 events>=2）。
-- 033版との差分は (a) ev CTEに `created_at < p_as_of` の上限を追加、
-- (b) ev CTEに `created_at >= 30日前` の下限を追加（★F・DAU/WAU/MAUいずれも
--     30日以内のサブセットなので出力値は変わらず、user_events全履歴スキャンの
--     将来的な悪化リスクだけを断つ）。
CREATE OR REPLACE FUNCTION public.get_audience_counts_v2_at(p_as_of timestamptz)
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH ev AS (
    SELECT session_id, created_at
    FROM public.user_events
    WHERE session_id IS NOT NULL
      AND created_at >= public.jst_midnight_minus_days(p_as_of, 30)  -- ★F: 30日超は読まない(出力に影響なし)
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
-- 044の human_v3_sessions(p_from, p_to) は元々窓を明示指定できる設計だったため、
-- 判定ロジック(is_bot_ua/is_active_event/distinct page_path)には一切触れず、
-- 窓の境界を now() ではなく p_as_of 由来にして呼ぶだけ。get_audience_counts_v3()本体は無変更。
CREATE OR REPLACE FUNCTION public.get_audience_counts_v3_at(p_as_of timestamptz)
RETURNS TABLE(dau int, wau int, mau int)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
    (SELECT count(*) FROM public.human_v3_sessions(public.jst_midnight_minus_days(p_as_of, 1),   p_as_of))::int,
    (SELECT count(*) FROM public.human_v3_sessions(public.jst_midnight_minus_days(p_as_of, 7),   p_as_of))::int,
    (SELECT count(*) FROM public.human_v3_sessions(public.jst_midnight_minus_days(p_as_of, 30),  p_as_of))::int;
$$;
GRANT EXECUTE ON FUNCTION public.get_audience_counts_v3_at(timestamptz) TO service_role;

-- ── ④ snapshot_daily_kpi() 再定義：対象日を「実行日の前日（完了済みJST暦日）」に変更 ──
-- 044版からの差分は v_today→v_snapshot_date/v_as_of の導入とr1/r2/r3の取得元(_at版)のみ。
-- 列構成・Human Engagement(h/h3)・ON CONFLICT本体は044版から完全に維持する。
CREATE OR REPLACE FUNCTION public.snapshot_daily_kpi()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  -- v_as_of: 実行時点が属するJST暦日の00:00（=「直前に完了した日」の終了時点）。
  v_as_of         timestamptz := ((now() AT TIME ZONE 'Asia/Tokyo')::date::timestamp AT TIME ZONE 'Asia/Tokyo');
  -- v_snapshot_date: 上記の前日＝今回confirmする対象日。
  v_snapshot_date date := (now() AT TIME ZONE 'Asia/Tokyo')::date - 1;
  r1 record; r2 record; h record; r3 record; h3 record;
BEGIN
  SELECT * INTO r1 FROM public.get_audience_counts_at(v_as_of);       -- ★056: now()依存→as_of
  SELECT * INTO r2 FROM public.get_audience_counts_v2_at(v_as_of);    -- ★056
  SELECT * INTO h  FROM public.get_human_engagement_counts();         -- 無変更（対象外・§E参照）
  SELECT * INTO r3 FROM public.get_audience_counts_v3_at(v_as_of);    -- ★056
  SELECT * INTO h3 FROM public.get_human_engagement_counts_v3();      -- 無変更（対象外・§E参照）
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
    v_snapshot_date,                                                  -- ★056: v_today→v_snapshot_date（前日）
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

-- ── ⑤ backfill_kpi_snapshot_complete_day: 既存rowのAudience列だけを確定値へ是正する任意関数 ──
-- 【Historical Backfill Completeness Audit（本ファイル冒頭§K参照）による最終仕様】
--
-- 【重要原則】kpi_daily_snapshotの1行は「その日について意味の揃ったsnapshot」で
-- なければならない。missing dateを埋めること自体を目的にしない。
--
-- 監査の結果、kpi_daily_snapshotの全列のうち Audience(raw/v2/v3) の DAU/WAU/MAU
-- 9列は as_of を明示すれば過去日について正確に再計算できるが、
--   - members_total / members_active: 退会・削除を追跡しておらず、過去時点の
--     正確な値を保証できない
--   - preference_profiles: 性質上「現在保持しているプロファイル数」であり、
--     過去のcountという概念自体が存在しない
-- の3列は原理的に過去再現不可能。残りの Human Engagement 系（039/044）13列は
-- 理論上は`_at`化が可能だが、そのための新規関数実装・レビューは本修正のスコープ外。
--
-- したがって「欠測日について完全な行を新規生成する」ことはできない
-- （一部の列だけ埋めてもNULLだらけの不完全な行になるため、作らない方が安全）。
-- 本関数は既存行（＝snapshot_daily_kpi()により全列が揃った状態で既に存在する行）
-- のAudience列だけを是正するUPDATE専用とし、行が存在しない日（2026-09-06）は
-- 意図的にno-opのまま据え置く。2026-09-06はUIやダッシュボード上、
-- 「その日はsnapshotが存在しない欠測日」として扱う（部分的なAudienceだけの
-- 行を人為的に作らない）。
--
-- p_from/p_to は必須（NOT NULL）。両方またはどちらか未指定時は例外を送出する
-- fail-closed設計（デフォルトNULL＝全履歴対象という誤操作を構造的に排除する）。
-- 対象範囲: DAU/WAU/MAU列(raw/v2/v3)のみ。snapshot_date自体・Human Engagement列・
-- total系累計列には一切触れない（対象外の理由は上記および本ファイル冒頭§E参照）。
-- 【本migrationはこの関数を自動実行しない】過去データの上書きになるため、
-- 実行するかどうか・対象期間はオーナーが判断し、後述のRUNBOOKコメント通り手動で呼ぶ。
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

  -- 対象日の列挙は「既存のkpi_daily_snapshot行」のみ（generate_seriesで日付を
  -- 生成しない）。行が存在しない日（2026-09-06）はこのSELECTに現れないため、
  -- 自動的にno-op＝新規行が作られることは無い（上記の重要原則を構造的に保証する）。
  FOR d IN
    SELECT snapshot_date FROM public.kpi_daily_snapshot
    WHERE snapshot_date >= p_from AND snapshot_date <= p_to
    ORDER BY snapshot_date
  LOOP
    v_as_of := ((d + 1)::timestamp AT TIME ZONE 'Asia/Tokyo');  -- 対象日dの翌日00:00 JST = dの終了時点
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

-- ══════════════════════════════════════════════════════════════════════════════
-- 運用メモ（本migrationはファイル作成のみ・Supabase本番へは未適用。実行は別Phaseで判断）
--
-- 1.【★J】本migrationは function/schema定義のみで、末尾の自動シード実行は含まない。
--    適用後、以下を手動で1回実行し「適用日の前日」1行を確定値でUPSERTする
--    （snapshot_daily_kpi()自体はいつも通りON CONFLICTで安全に冪等）:
--      SELECT public.snapshot_daily_kpi();
--    これを migration本体から分離したのは、migration適用(function定義)の成否と
--    シード実行(集計クエリの実行・タイムアウト)の成否を切り分けて確認できるようにするため。
--
-- 2. 過去の部分日/欠測行（read-only調査で確認済み）:
--      2026-09-05: 手動1回実行・約6時間分（Phase 3.1.2の性能検証実行）← backfill対象
--      2026-09-06: 行自体が欠測（cron未有効化期間の谷間）           ← backfill対象外（下記参照）
--      2026-09-07 〜 適用前日: 日次cron(JST 05:00)による約5時間分     ← backfill対象
--    既存行（09-05, 09-07〜適用前日）のAudience列を確定値へ是正したい場合、
--    上記シード実行後に手動で以下を実行する（本migrationでは実行しない。
--    p_from/p_toは必須・NULLや範囲逆転は例外になる）:
--      SELECT public.backfill_kpi_snapshot_complete_day('2026-09-05', '2026-09-11');
--      -- 実際の終了日は「migration適用前日」まで。既存行のみが対象＝
--      -- 正常な過去日（範囲外の日付）や行が存在しない日には一切影響しない。
--
--    【2026-09-06について】本関数では意図的に復元しない。members_total /
--    members_active / preference_profiles の3列は過去時点の値を正確に
--    再現できず（本ファイル冒頭の Historical Backfill Completeness Audit 参照）、
--    「Audience列だけが入りその他がNULLだらけの不完全な行」を新規生成することは
--    誤解を招くため避ける。2026-09-06はKPI Trend等のUI上、素直に「行が存在しない
--    欠測日」として表示される（表示側の追加対応は本migrationのスコープ外）。
--
-- 3. 適用後の検証クエリ（読み取りのみ）:
--      SELECT snapshot_date, updated_at, audience_v2_dau, audience_v3_dau, audience_v3_wau, audience_v3_mau
--      FROM public.kpi_daily_snapshot ORDER BY snapshot_date DESC LIMIT 5;
--    期待: 最新行のsnapshot_dateが「適用日の前日」になっており、DAUが旧来の
--    5時間分より明らかに大きいこと。backfill後も2026-09-06行は存在しないままでよい。
-- ══════════════════════════════════════════════════════════════════════════════
