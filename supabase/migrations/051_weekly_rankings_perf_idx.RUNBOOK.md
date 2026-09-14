# mig051 手動適用 手順書（weekly_rankings 性能改善インデックス2本）

対象: `public.user_events` / `public.articles` への索引追加（**`.sql` ファイルは無い。本書のみが実体**）
状態: **適用済み**（Phase WR-1調査中、本番・Supabase SQL エディタで単独実行・EXPLAIN ANALYZEで効果確認済み）。
本書は[[045_articles_actress_metadata_gin.RUNBOOK.md]]と同じ理由（`CREATE INDEX CONCURRENTLY`はトランザクションブロック内で実行不可・本プロジェクトに migration 自動適用ランナーが存在しない）により、`.sql`ではなく`.md`として管理する。

背景: Weekly Rankings（`compute_weekly_rankings` RPC）が2026-08-23/08-30の2週で
`57014 canceling statement due to statement timeout`により失敗（[[incident 相当・Phase WR-0調査]]）。
EXPLAIN (ANALYZE, BUFFERS) による実測調査の結果、以下2つのSeq Scanが主要因と判明し、
対応する索引を適用した:

1. `human_sessions_between()`内の`user_events`スキャンが、`created_at`範囲を絞る既存索引
   （`user_events_created_idx`）はあるものの`session_id`/`user_agent`を含まないため、
   範囲内の全行についてヒープフェッチが発生していた。
2. `compute_weekly_rankings`内の3箇所（actress/newcomer/rising各分岐の「最新作品」LATERAL）が
   `metadata->'actress'->0->>'id' = 値`という等価抽出を行っており、既存の
   `articles_metadata_actress_gin_idx`（`@>`containment専用）では使えずSeq Scanになっていた。

適用後の実測（本番・8/23週相当のデータで検証）: **Execution Time 18,882ms → 10,337ms（約45%改善）**。
- `idx_user_events_human_session_covering`: Index Only Scanで使用確認済み（Heap Fetchesは残るが物理read=0、shared bufferキャッシュヒットのみ）。
- `articles_actress0_id_active_idx`: actress/newcomer/rising 3分岐すべてでSeq Scan→Index Scanへの切替を確認済み。

**本書適用後もSQLロジック（ランキング算出・順位条件・対象期間・human判定ロジック）は一切変更していない。索引追加のみ。**

---

## 0. なぜ `051_*.sql` ではなく RUNBOOK なのか

[[045_articles_actress_metadata_gin.RUNBOOK.md]] §0と同一の理由。要約:

- `CREATE INDEX CONCURRENTLY`はトランザクションブロック内では実行できない（Postgres仕様）。
- 本プロジェクトには migration を自動適用する CLI/runner は存在しない（Supabase SQL Editor での手動貼り付け実行が唯一の適用経路）。
- 将来 migration 自動適用の仕組みが導入された場合に備え、`CREATE INDEX CONCURRENTLY`を含む本書は
  `.sql`glob に一致しない`.md`拡張子のまま維持し、誤って自動実行対象に含まれないようにする。
- 前例: `040_social_posts.RUNBOOK.md`（`user_events_vp_idx`）、`045_articles_actress_metadata_gin.RUNBOOK.md`。

対象2索引はいずれも書き込みが継続的に発生するテーブル（`user_events`は常時INSERT、`articles`は
毎日00:30 JSTのmaker-syncでINSERT）への索引追加のため、ロック回避のため両方とも`CONCURRENTLY`を使用する。

---

## 1. 適用前チェック（読み取りのみ）

```sql
-- (a) 索引が未作成であること（本番では既に作成済みのため、実際には 1 行返る想定 — 冪等性確認用）
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='user_events'
  AND indexname='idx_user_events_human_session_covering';

SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='articles'
  AND indexname='articles_actress0_id_active_idx';

-- (b) 対象カラムの型確認
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='user_events'
  AND column_name IN ('created_at','session_id','user_agent');

SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='articles' AND column_name='metadata';
-- 期待: metadata / jsonb

-- (c) 名前の重複が無いこと（各テーブルの既存索引一覧・本番構成の記録用）
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='user_events' ORDER BY indexname;
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='articles'   ORDER BY indexname;
```

---

## 2. 適用手順（Supabase SQL エディタ・各文を単独実行）

**既に本番へ適用済みのため、通常運用では再実行不要。** 万一ロールバック後の再適用や、別環境（ステージング等）への同一構成の再現が必要な場合に、以下を**1文ずつ個別に**実行する。

```sql
-- 2a. human_sessions_between() 用 covering index
-- 対象: created_at範囲スキャン後にsession_id/user_agentをヒープ再訪せず取得できるようにする。
-- session_id IS NOT NULL は user_events.session_id が NULL 0%（[[029_audience.sql]]で確認済み）だが、
-- 関数側の `where e.session_id is not null` 条件と一致させ、部分索引として意味を明確にする。
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_events_human_session_covering
  ON public.user_events (created_at)
  INCLUDE (session_id, user_agent)
  WHERE session_id IS NOT NULL;
```

```sql
-- 2b. compute_weekly_rankings の actress/newcomer/rising 分岐「最新作品」LATERAL 用
-- 対象式: a.metadata->'actress'->0->>'id' = <女優ID>（等価抽出）
-- 既存 articles_metadata_actress_gin_idx は (metadata->'actress') @> '[...]' という containment 専用の
-- GIN索引であり、本箇所の等価抽出パターンには使えない。用途が完全に異なるため重複索引ではない。
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_actress0_id_active_idx
  ON public.articles ((metadata->'actress'->0->>'id'))
  WHERE is_active;
```

- **この2文は同じ実行枠にまとめず、それぞれ単独でRunすること**（CONCURRENTLYは複数文をまとめて送るとトランザクションブロック扱いになり失敗する）。
- **BEGIN/COMMITで囲まない**。
- DROP・既存索引の変更は行わない。
- 可能であれば`user_events`側はクライアントからの書き込みが常時発生するため、索引ビルド中の書き込み負荷を許容できるタイミング（深夜帯等）を選ぶことが望ましいが、CONCURRENTLY自体は書き込みをブロックしない。

---

## 3. 適用後の検証クエリ（読み取りのみ）

```sql
-- (1) 索引の存在・定義
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname IN
  ('idx_user_events_human_session_covering', 'articles_actress0_id_active_idx');

-- (2) INVALID になっていないこと（CONCURRENTLY 失敗時は invalid=true のまま残る）
SELECT indexrelid::regclass AS index_name, indisvalid
FROM pg_index
WHERE indexrelid IN (
  'public.idx_user_events_human_session_covering'::regclass,
  'public.articles_actress0_id_active_idx'::regclass
);
-- 期待: 両方 indisvalid = t

-- (3) 索引が実際にスキャンされた回数
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE indexrelname IN ('idx_user_events_human_session_covering', 'articles_actress0_id_active_idx');
```

- (2)で`indisvalid = f`の場合は失敗（CONCURRENTLY作成中にエラーが起きた痕跡）。
  `DROP INDEX CONCURRENTLY IF EXISTS <index_name>;`の上で再実行する。

**Phase WR-1調査時点の実測確認済み事項（参考記録）**:
- `idx_user_events_human_session_covering`: `EXPLAIN (ANALYZE, BUFFERS)`で`Index Only Scan using idx_user_events_human_session_covering`を確認。`Heap Fetches`は残存するが`Buffers: shared hit=...`のみで物理read無し。
- `articles_actress0_id_active_idx`: 同様に`compute_weekly_rankings`のactress/newcomer/rising 3分岐で`Seq Scan`から`Index Scan`への切替を確認。

---

## 4. 失敗時ロールバック

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.idx_user_events_human_session_covering;
DROP INDEX CONCURRENTLY IF EXISTS public.articles_actress0_id_active_idx;
```

新規索引の追加のみであり、既存データ・既存索引・`compute_weekly_rankings`等の関数本体には一切触れていないため、ロールバックの影響範囲はこの2索引のみ。

---

## 5. 既存索引との役割分担（重複索引ではないことの確認）

| 索引 | 対象 | 用途 | 本索引との関係 |
|---|---|---|---|
| `user_events_created_idx (created_at DESC)` | user_events | created_atのみで足りる他クエリ用の軽量索引 | 併存。削除しない |
| `idx_user_events_human_session_covering (created_at) INCLUDE (session_id, user_agent)` | user_events | `human_sessions_between()`専用のcovering index | 新規追加 |
| `articles_metadata_actress_gin_idx ((metadata->'actress')) USING gin` | articles | `@>`containment検索専用（SameActressWorks等） | 併存。用途が異なり重複しない |
| `articles_actress0_id_active_idx ((metadata->'actress'->0->>'id')) WHERE is_active` | articles | `->0->>'id' = 値`の等価抽出専用（weekly_rankings） | 新規追加 |

---

## 6. アプリ側との適用順序

本索引は`compute_weekly_rankings`（[[041_weekly_rankings.sql]] / [[043_weekly_rankings_maker_fix.sql]]）の
SQL本体を一切変更せず、既存クエリが選択する実行戦略のみを改善する。アプリケーションコードのデプロイは不要。

> 状態: **索引作成は完了**（本番）。本書はPhase WR-1調査で実施した本番SQL Editor操作を、
> [[feedback_migration_forward_fix]]の方針（適用済みmigrationは書き換えず、新連番でforward-fixとして記録し、
> 空DBへの順次適用と最終スキーマが一致することを保証する）に従い、正式な変更履歴として記録するものである。
