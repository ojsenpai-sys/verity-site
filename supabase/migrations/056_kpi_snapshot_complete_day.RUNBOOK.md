# 056 kpi_daily_snapshot — 正式本番適用 RUNBOOK

対象: `supabase/migrations/056_kpi_snapshot_complete_day.sql`
状態: **未適用（本書はこれから適用するオーナー向け手順書）**。
前提: ROLLBACK前提の production validation（`056_kpi_snapshot_complete_day.VALIDATION*.sql`）が
全フェーズ完了し、**PRODUCTION APPLY READINESS = SAFE TO APPLY** 判定済み
（DDL CREATE成功・`_at()`3関数成功・`snapshot_daily_kpi()`が前日のみ更新・backfill単日成功・
2026-09-06をINSERTしない・ROLLBACK後にDB原状復帰・timeoutなし・production残留変更なし、
以上すべて実DB確認済み）。

本書を`.sql`ではなく`.md`として管理する理由: [[040_social_posts.RUNBOOK.md]]や
[[045_articles_actress_metadata_gin.RUNBOOK.md]]と同じ配置規約（本プロジェクトには
migrationを自動適用するCLI/runnerが存在せず、Supabase SQL Editorでの手動貼り付け実行が
唯一の適用経路）。本書は`056_kpi_snapshot_complete_day.VALIDATION*.sql`（ROLLBACK専用・
本番へは何も残さない検証）とは異なり、**実際にproductionへ反映するための手順書**である。

---

## 0. 正式適用の原則

- 本番反映はSupabase SQL EditorでオーナーStep-by-stepで手動実行する。自動migration
  runnerは使わない。
- secretは一切不要（接続文字列・パスワード等はどのステップにも登場しない）。
- **一括backfillは禁止。** 過去日は必ず1日ずつ実行し、各回ごとに結果とDB healthを
  確認してから次へ進む。
- 各STEPはそれぞれ単独で完結する（ステップ間でトランザクションを跨がない）。
  STEP 2（`snapshot_daily_kpi()`実行）とSTEP 4（`backfill(...)`実行）は
  それぞれ内部で1トランザクションとして実行され、成功時はそのままcommit状態になる
  （このRUNBOOKはROLLBACK前提の検証ではなく、正式な本番反映のため）。
- **重要な運用上の注意（前回セッションの実測に基づく）**: `verity_snapshot_daily_kpi`
  というpg_cron jobが実際には**稼働中**であり、毎日JST 05:00に`snapshot_daily_kpi()`を
  自動実行していることを、本件の初回調査で`cron_status_runs`の実行履歴から確認済み
  （`docs/operations/production-monitoring.md`9節の「analytics cronはactive=falseのまま」
  という記載は、この一連の作業以前の時点の記録であり、現状と乖離している）。
  そのため、**本RUNBOOKはJST 05:00の前後30分を避けて実施すること**
  （STEP 1適用直後、または適用中にcronの自動実行が発火すると、STEP 2の手動実行と
  同じ行への書き込みが重なる。UPSERTのため実害はないが、どちらの実行が反映結果を
  作ったのか切り分けにくくなるため）。

---

## STEP 1 — 056正式適用（function定義のみ）

`supabase/migrations/056_kpi_snapshot_complete_day.sql` の内容をそのまま
Supabase SQL Editorへ貼り付けて実行する。このファイルは：

- **function定義のみ**（`CREATE OR REPLACE FUNCTION` + `GRANT`の羅列）。
- 自動snapshot実行（`SELECT public.snapshot_daily_kpi();`）を**含まない**
  （前回セッションで意図的に分離済み）。
- 自動backfillを**含まない**。
- cronの作成・変更・スケジュール操作を**含まない**（`cron.schedule`/`cron.alter_job`等は
  一切呼ばない）。

### PASS条件

- SQL errorなし。
- 以下の確認SQLで6関数すべて存在し、`security_definer=true`・`config`に
  `search_path=public`を含む。
- EXECUTE権限が`service_role`のみ（`anon`/`authenticated`が1行でも出たらSTOP）。
- cron一覧に変化がない（後述の確認SQLで実行前後を比較）。

### 適用後の確認SQL（読み取りのみ）

```sql
-- (1) 6関数の存在・security設定確認
select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig as config,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'jst_midnight_minus_days', 'get_audience_counts_at', 'get_audience_counts_v2_at',
    'get_audience_counts_v3_at', 'snapshot_daily_kpi', 'backfill_kpi_snapshot_complete_day'
  )
order by p.proname;
-- 期待: 6行、全てsecurity_definer=true、configにsearch_path=publicを含む

-- (2) EXECUTE権限がservice_roleのみであること
select distinct p.proname, r.rolname as grantee
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace,
lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and p.proname in (
    'jst_midnight_minus_days', 'get_audience_counts_at', 'get_audience_counts_v2_at',
    'get_audience_counts_v3_at', 'backfill_kpi_snapshot_complete_day'
  )
order by p.proname, r.rolname;
-- 期待: grantee は service_role のみ

-- (3) snapshot_daily_kpi()が056版へ再定義されたこと（実行はしない）
select pg_get_functiondef('public.snapshot_daily_kpi()'::regprocedure) like '%v_snapshot_date%' as redefinition_applied;
-- 期待: true

-- (4) cronに変化が無いこと（本STEPはcronに一切触れていない）
select jobid, jobname, schedule, active from cron.job order by jobid;
-- 期待: 事前に記録した一覧と完全一致
```

**STOP条件に該当すれば、ここでそれ以上進めず本書末尾「STOP CONDITIONS」に従うこと。**

---

## STEP 2 — 前日snapshotを1回実行

```sql
-- 実行前に対象日を確認（現在日時がJST 2026-09-12なら09-11が対象）
select (now() at time zone 'Asia/Tokyo')::date - 1 as expected_snapshot_date;

-- 実行
select public.snapshot_daily_kpi();

-- 確認: 直近5行
select
  snapshot_date,
  audience_raw_dau, audience_raw_wau, audience_raw_mau,
  audience_v2_dau, audience_v2_wau, audience_v2_mau,
  audience_v3_dau, audience_v3_wau, audience_v3_mau,
  updated_at
from public.kpi_daily_snapshot
order by snapshot_date desc
limit 5;
```

### PASS条件

- 上のクエリの`expected_snapshot_date`と一致する1行だけが新しい`updated_at`を持つ。
- その行のDAU/WAU/MAU（raw/v2/v3）が確定日値（NULLでない実数値）。
- それ以外の行（09-10以前）の`updated_at`が変化していない（STEP1実行前に
  必要なら`select snapshot_date, updated_at from public.kpi_daily_snapshot order by snapshot_date desc limit 10;`
  で事前記録しておき、比較する）。
- 2026-09-06は依然欠測（`select snapshot_date from public.kpi_daily_snapshot where snapshot_date='2026-09-06';`が0 rows）。

---

## STEP 3 — DB HEALTH CHECK

新しい重い監視SQLは作らず、`docs/operations/production-monitoring.md` 8節・9節の
既存read-only SQLをそのまま再利用する。

```sql
-- long-running query / blocker確認（読み取りのみ）
select pid, state, wait_event_type, now() - query_start as duration, left(query, 100)
from pg_stat_activity
where state != 'idle'
order by duration desc;

-- cron状態確認（読み取りのみ・変更しない）
select jobname, active
from cron.job
where jobname in ('verity_refresh_scores','verity_refresh_analytics_4h','verity_snapshot_daily_kpi','verity_refresh_user_profiles')
order by jobname;
```

### PASS条件（`docs/operations/production-monitoring.md`の閾値に準拠）

- `pg_stat_activity`に長時間（目安: 数十秒超）実行中のqueryやblockerが無い。
- cronの`active`状態がSTEP1実行前の記録と一致（本STEP群では一切変更していない）。
- Supabase Dashboard上でstatement timeoutエラーの兆候が無い（急増していない）。
- 異常があれば **STOP**（本書末尾「STOP CONDITIONS」参照）。

---

## STEP 4 — historical backfill（1日ずつ・一括禁止）

**一括範囲指定（例: `backfill('2026-09-05','2026-09-11')`）は行わない。**
必ず1日ずつ実行し、各回ごとにSTEP3のhealth checkを挟む。

### 4-1. まず2026-09-05のみ

```sql
select public.backfill_kpi_snapshot_complete_day('2026-09-05', '2026-09-05');
-- 戻り値 = 1 が期待値

-- 確認: Audience9列のみ変化・他列(members_total等)・2026-09-06は不変
select
  snapshot_date, audience_raw_dau, audience_v2_dau, audience_v3_dau,
  members_total, page_view_total, updated_at
from public.kpi_daily_snapshot
where snapshot_date = '2026-09-05';

select snapshot_date from public.kpi_daily_snapshot where snapshot_date = '2026-09-06';
-- 期待: 0 rows（欠測維持）
```

上記を確認したら、**STEP 3のhealth checkを再実行**してから次へ進む。

### 4-2. 09-07 〜 09-11 を1日ずつ

以下を **1日ずつ・順番に** 実行する（`<date>`部分を毎回書き換える）。
各回の実行後、必ず結果確認 → STEP3 health check → 異常なければ次の日、の順で進める。
**連続して複数日をまとめて流さない。**

```sql
select public.backfill_kpi_snapshot_complete_day('<date>', '<date>');
-- 戻り値 = 1 が期待値

select
  snapshot_date, audience_raw_dau, audience_v2_dau, audience_v3_dau,
  members_total, page_view_total, updated_at
from public.kpi_daily_snapshot
where snapshot_date = '<date>';
```

対象日: `2026-09-07` → `2026-09-08` → `2026-09-09` → `2026-09-10` → `2026-09-11` の順。

### PASS条件（各日共通）

- 戻り値が1（その日1行だけ処理された）。
- Audience9列（raw/v2/v3のDAU/WAU/MAU）のみ変化。
- `members_total` / `page_view_total`等の対象外列・`updated_at`が変化しない
  （`backfill_kpi_snapshot_complete_day()`はAudience9列しかUPDATEしない設計のため）。
- 2026-09-06が常に0 rowsのまま。
- 各回、STEP3のhealth checkで異常が無い。

---

## STEP 5 — final verification（2026-09-04〜09-11 全体確認）

```sql
select
  snapshot_date,
  audience_raw_dau, audience_raw_wau, audience_raw_mau,
  audience_v2_dau, audience_v2_wau, audience_v2_mau,
  audience_v3_dau, audience_v3_wau, audience_v3_mau,
  updated_at
from public.kpi_daily_snapshot
where snapshot_date between '2026-09-04' and '2026-09-11'
order by snapshot_date;

select snapshot_date from public.kpi_daily_snapshot where snapshot_date = '2026-09-06';
-- 期待: 0 rows
```

### 期待結果

| 日付 | 期待される状態 |
|---|---|
| 2026-09-04 | 旧正常値のまま（backfill対象外・変化なし） |
| 2026-09-05 | complete-day値へ修正済み（STEP4-1で処理） |
| 2026-09-06 | **欠測のまま**（0 rows。意図的に復元しない） |
| 2026-09-07〜09-11 | complete-day値へ修正済み（STEP4-2で処理） |
| 全行の`updated_at` | historical backfill対象行では**変更されない**（`backfill_kpi_snapshot_complete_day()`の仕様どおり。`updated_at`が動くのはSTEP2の`snapshot_daily_kpi()`実行対象行のみ） |

---

## STEP 6 — application verification（deploy不要）

DB function変更のみでUIコード変更は無いため、**deployは不要**。VERITY管理画面で
以下を確認する。

1. `/verity/admin/analytics` を開き、**KPI Trend**セクションを確認:
   - 直近日のDAUが不自然な5時間分の値（急落した見た目）ではなく、フルデイの値に
     なっていること。
   - 2026-09-06に対応する行が単純に表として存在しない（欠測日として自然に
     スキップされている）ことを確認。表の描画自体が壊れていないこと
     （`kpiTrend.map(s => ...)`はsnapshot_dateキーの行を単純にmapするだけの実装のため、
     1行欠けても崩れない設計だが、念のため目視確認する）。
2. **Audience v3（能動ベース・beta）**セクションのDAU/WAU/MAUが正常な値であること
   （こちらはkpi_daily_snapshotの最新行を参照する設計のため、STEP2の結果がそのまま
   反映される）。
3. ブラウザの開発者コンソールでJavaScriptエラーが出ていないこと。
4. 必要であれば `GET /api/health` が200を返すことを確認（DB非依存の生存確認のみ）。

---

## STOP CONDITIONS

以下のいずれかが発生した場合、**それ以上先に進めず直ちに停止**し、状況を報告すること。

- SQL error
- statement timeout / upstream timeout / lock timeout
- DB負荷の異常上昇（`docs/operations/production-monitoring.md`のWarning/Critical閾値超過）
- 対象外のsnapshot行が更新された（backfillが指定日以外に触れている等）
- 2026-09-06が新規にINSERTされた（想定外の動作）
- historical backfill対象行の`updated_at`が変化した（想定外の動作）
- cronの状態（`active`・`schedule`）が変化した
- 想定外のNULL（Audience列がNULLになる等）

---

## ROLLBACK / RESTORE方針

正式適用後は「migrationをROLLBACKする」ことはできない（トランザクション検証とは異なり、
`CREATE OR REPLACE FUNCTION`が実行された時点で本番に反映される）。問題が見つかった場合の
対応は次の2段階で考える。

### Tier 1: STEP1実行直後・STEP2実行前に問題が見つかった場合

まだ`snapshot_daily_kpi()`は誰も呼んでおらず、`kpi_daily_snapshot`には一切書き込みが
発生していない（新規関数が定義されただけの状態）。ただし前述の通り
`verity_snapshot_daily_kpi` cronが稼働中のため、次のJST 05:00に自動実行される点に注意。
急ぎ切り戻したい場合はTier 2の関数復元を行うか、一時的に
`select cron.alter_job((select jobid from cron.job where jobname='verity_snapshot_daily_kpi'), active := false);`
でcronを止める（**DROPは行わない**。`docs/operations/production-monitoring.md`11節の
方針と同じく、cronは`active:=false`のみで対応する）。

### Tier 2: STEP2以降で誤った値の書き込みが確認された場合

`snapshot_daily_kpi()`を056以前（044版）の定義へ戻す。新設した`_at()`系関数・
`backfill_kpi_snapshot_complete_day()`は残置してよい（未使用のまま存在するだけで
実害はない。将来的な削除は別途判断）。**危険な自動DROPは用意しない。**

```sql
-- 044版への復元（v_today基準・now()依存のget_audience_counts()/_v2()/_v3()を使う旧実装）
create or replace function public.snapshot_daily_kpi()
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Asia/Tokyo')::date;
        r1 record; r2 record; h record; r3 record; h3 record;
begin
  select * into r1 from public.get_audience_counts();
  select * into r2 from public.get_audience_counts_v2();
  select * into h  from public.get_human_engagement_counts();
  select * into r3 from public.get_audience_counts_v3();
  select * into h3 from public.get_human_engagement_counts_v3();
  insert into public.kpi_daily_snapshot as k (
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
  ) values (
    v_today,
    (select count(*) from public.profiles where brand_id = 'verity'),
    (select count(*) from public.user_activity_summary),
    r1.dau, r1.wau, r1.mau,
    r2.dau, r2.wau, r2.mau,
    (select count(*) from public.user_preference_profiles),
    (select count(*) from public.user_events where event_name = 'favorite_work'),
    (select count(*) from public.user_events where event_name = 'favorite_actress'),
    (select count(*) from public.user_events where event_name = 'page_view'),
    (select count(*) from public.user_events where event_name = 'video_view'),
    (select count(*) from public.user_events where event_name = 'fanza_click'),
    (select count(*) from public.user_events),
    h.human_work_views, h.human_actress_views, h.human_fanza_clicks,
    h.human_total_events, h.human_unique_work_viewers, h.human_mau,
    r3.dau, r3.wau, r3.mau,
    h3.human_work_views, h3.human_actress_views, h3.human_fanza_clicks,
    h3.human_total_events, h3.human_nonauto_events, h3.human_unique_work_viewers, h3.human_mau,
    now()
  )
  on conflict (snapshot_date) do update set
    members_total=excluded.members_total, members_active=excluded.members_active,
    audience_raw_dau=excluded.audience_raw_dau, audience_raw_wau=excluded.audience_raw_wau, audience_raw_mau=excluded.audience_raw_mau,
    audience_v2_dau=excluded.audience_v2_dau, audience_v2_wau=excluded.audience_v2_wau, audience_v2_mau=excluded.audience_v2_mau,
    preference_profiles=excluded.preference_profiles,
    favorite_work_events=excluded.favorite_work_events, favorite_actress_events=excluded.favorite_actress_events,
    page_view_total=excluded.page_view_total, video_view_total=excluded.video_view_total, fanza_click_total=excluded.fanza_click_total,
    user_events_total=excluded.user_events_total,
    human_work_views=excluded.human_work_views, human_actress_views=excluded.human_actress_views,
    human_fanza_clicks=excluded.human_fanza_clicks, human_total_events=excluded.human_total_events,
    human_unique_work_viewers=excluded.human_unique_work_viewers, human_mau=excluded.human_mau,
    audience_v3_dau=excluded.audience_v3_dau, audience_v3_wau=excluded.audience_v3_wau, audience_v3_mau=excluded.audience_v3_mau,
    human_v3_work_views=excluded.human_v3_work_views, human_v3_actress_views=excluded.human_v3_actress_views,
    human_v3_fanza_clicks=excluded.human_v3_fanza_clicks, human_v3_total_events=excluded.human_v3_total_events,
    human_v3_nonauto_events=excluded.human_v3_nonauto_events, human_v3_unique_work_viewers=excluded.human_v3_unique_work_viewers,
    human_v3_mau=excluded.human_v3_mau,
    updated_at=now();
end; $$;
grant execute on function public.snapshot_daily_kpi() to service_role;
```

この復元により、次回cron実行（またはこのRUNBOOK自体を後日やり直す場合）は044版の
挙動（部分日問題が再発する）に戻る。復元後、056の根本原因を再調査し、forward-fix
migration（新しい連番）として再設計・再度validationを経てから再適用すること。
既存migrationファイル（056含む）自体は書き換えない（[[feedback_migration_forward_fix]]方針）。

もしSTEP4のbackfillだけで問題が見つかった場合（`snapshot_daily_kpi()`自体は正常）、
`backfill_kpi_snapshot_complete_day()`を呼ばなければ良いだけであり、関数の復元は不要。
既に実行してしまった特定日の誤ったUPDATEを個別に戻したい場合は、その日について
本番のraw `user_events`から手動で正しい値を再計算し`UPDATE`する必要がある
（`backfill_kpi_snapshot_complete_day()`はUPDATEのみで履歴を保持しないため、
自動的な「1つ前の値に戻す」機能は無い。事前に該当日の値を記録しておくことを推奨）。

---

## Git（正式DB適用が成功した後にのみcommitする）

**今回はcommitしない。** 以下は次回、正式適用が成功した後の提案。

### 提案するcommit対象

1. `supabase/migrations/052_analytics_cron_safety.sql`（本番適用済みだが現在git未追跡。
   056が052に依存する背景を持つため、052→056の順序をGit履歴上でも成立させるために
   056より先または同時にcommitする）
2. `supabase/migrations/056_kpi_snapshot_complete_day.sql`
3. `supabase/migrations/056_kpi_snapshot_complete_day.RUNBOOK.md`（本書）
4. `scripts/lib/kpi-snapshot-window.mjs`
5. `scripts/__tests__/kpi-snapshot-window.test.mjs`

commit順序: 052 → 056関連一式（1コミットにまとめるか052とは別コミットにするかは
オーナー判断。ただしGit上のcommit順は052が056より先であること）。

### 提案（決定はしない）: VALIDATION系ファイルの扱い

- `056_kpi_snapshot_complete_day.VALIDATION.md`
- `056_kpi_snapshot_complete_day.VALIDATION.sql`
- `056_kpi_snapshot_complete_day.VALIDATION_A.sql` 〜 `VALIDATION_D.sql`（6ファイル）

これらはROLLBACK前提の一度限りの事前検証用であり、正式適用完了後は実用上の
価値が下がる（`040`/`045`のRUNBOOK.mdは「どう適用したか」の恒久記録として
committed済みだが、VALIDATION系は「適用前に何を確かめたか」の記録に近い）。

- **committするメリット**: 将来似た変更（他のanalytics関数の`_at()`化等）をする際の
  テンプレートとして再利用できる。「SAFE TO APPLYと判定した根拠」の監査証跡になる。
- **committしないメリット**: リポジトリの恒久ファイルとしては役目を終えており、
  RUNBOOK.md（本書）に要点は既に転記されている。ファイル数が増えすぎる。

本書ではどちらか一方を推奨するのではなく、上記2つの観点を提示するのみとし、
**決定はオーナーに委ねる**。今回はいずれもcommitしない。
