# mig058 手動適用 手順書（articles maker expression index）

対象: `public.articles` への索引追加（**`.sql` ファイルは無い。本書のみが実体**）
状態: **未適用**（Phase 1「最新作最速更新情報 Refresh」準備。`057_fastest_releases_candidates_rpc.sql`の性能を支える索引）

本書を`.sql`ではなく`.md`として管理する理由: [[045_articles_actress_metadata_gin.RUNBOOK.md]]・[[051_weekly_rankings_perf_idx.RUNBOOK.md]]と同じ理由（`CREATE INDEX CONCURRENTLY`はトランザクションブロック内で実行不可・本プロジェクトに migration 自動適用ランナーが存在しない）。

---

## 0. 背景・対象式の根拠

`057_fastest_releases_candidates_rpc.sql`の`get_fastest_releases_candidates()`は以下のWHERE句でmakerを絞り込む:

```sql
WHERE a.is_active
  AND (a.metadata ->> 'floor') IN ('videoa', 'dvd')
  AND (a.metadata -> 'maker' -> 0 ->> 'id') = ANY (p_maker_ids)
```

`(metadata -> 'maker' -> 0 ->> 'id')`という等価抽出式は、既存`043_weekly_rankings_maker_fix.sql`（`art.metadata->'maker'->0->>'id' = t.entity_id`）で実際に使われている式と**完全に同一**（盲目的な命名コピーではなく、実際のクエリパターンから確認済み）。

既存の`articles_metadata_actress_gin_idx`（`metadata->'actress'`のcontainment専用GIN）・`articles_actress0_id_active_idx`（`051`、`metadata->'actress'->0->>'id'`の等価抽出専用）はいずれも`actress`用であり、`maker`用の同種索引は存在しない。57メーカー対応でこの式に対するSeq Scanリスクが高まるため、`051`と全く同じ設計思想で`maker`版を追加する。

---

## 1. 適用前チェック（読み取りのみ）

```sql
-- (a) 索引が未作成であること
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='articles'
  AND indexname='articles_maker0_id_active_idx';
-- 期待: 0 行

-- (b) 対象式の型確認（text型であることを確認 — DBはintキャストしない設計のため）
SELECT (metadata -> 'maker' -> 0 ->> 'id') AS maker_id_sample, pg_typeof(metadata -> 'maker' -> 0 ->> 'id')
FROM public.articles
WHERE is_active AND metadata -> 'maker' -> 0 ->> 'id' IS NOT NULL
LIMIT 5;
-- 期待: maker_id_sample が数値文字列（例 '1509'）、型は text

-- (c) 名前の重複が無いこと
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='articles' ORDER BY indexname;
```

---

## 2. 適用手順（Supabase SQL エディタ・単独実行）

```sql
-- 057のget_fastest_releases_candidates()のWHERE句と完全一致する式に索引を張る。
-- is_active に絞った部分索引（051と同じ設計）。
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_maker0_id_active_idx
  ON public.articles ((metadata -> 'maker' -> 0 ->> 'id'))
  WHERE is_active;
```

- **単独で実行すること**（`CREATE INDEX CONCURRENTLY`を他の文とまとめて送るとトランザクションブロック扱いになり失敗する）。
- **BEGIN/COMMITで囲まない**。
- DROP・既存索引の変更は行わない。
- `articles`は`maker-sync.mjs`により継続的にINSERTされるテーブルのため、書き込み負荷を許容できるタイミング（深夜帯等）を選ぶことが望ましいが、`CONCURRENTLY`自体は書き込みをブロックしない。

---

## 3. 適用後の検証クエリ（読み取りのみ）

```sql
-- (1) 索引の存在・定義
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND indexname='articles_maker0_id_active_idx';

-- (2) INVALID になっていないこと（CONCURRENTLY 失敗時は invalid=true のまま残る）
SELECT indexrelid::regclass AS index_name, indisvalid
FROM pg_index
WHERE indexrelid = 'public.articles_maker0_id_active_idx'::regclass;
-- 期待: indisvalid = t

-- (3) 実行計画確認（読み取りのみ・実データは書き換えない。EXPLAIN ANALYZEは
--     実際にクエリを実行してしまうため、まずEXPLAIN (FORMAT TEXT)のみで確認する）
EXPLAIN (FORMAT TEXT)
SELECT public.get_fastest_releases_candidates(ARRAY['1509','3152','1219']::text[], 40);
-- 期待: 索引を使ったプラン（Bitmap Index Scan / Index Scan on articles_maker0_id_active_idx）
--       が現れること。関数呼び出し1行のEXPLAINでは内部プランが見えない場合は、
--       関数本体のSELECT文を直接EXPLAINして確認する:
EXPLAIN (FORMAT TEXT)
SELECT (a.metadata -> 'maker' -> 0 ->> 'id') AS maker_id, a.external_id, a.fetched_at,
       row_number() OVER (PARTITION BY (a.metadata -> 'maker' -> 0 ->> 'id') ORDER BY a.fetched_at DESC, a.external_id DESC) AS rn
FROM public.articles a
WHERE a.is_active
  AND (a.metadata ->> 'floor') IN ('videoa', 'dvd')
  AND (a.metadata -> 'maker' -> 0 ->> 'id') = ANY (ARRAY['1509','3152','1219']::text[]);

-- (4) 索引が実際にスキャンされた回数（運用開始後の確認用）
SELECT schemaname, relname, indexrelname, idx_scan
FROM pg_stat_user_indexes
WHERE indexrelname = 'articles_maker0_id_active_idx';
```

- (2)で`indisvalid = f`の場合は失敗。`DROP INDEX CONCURRENTLY IF EXISTS articles_maker0_id_active_idx;`の上で再実行する。

---

## 4. 失敗時ロールバック

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.articles_maker0_id_active_idx;
```

新規索引の追加のみであり、既存データ・既存索引・既存関数(`057`含む)には一切触れていないため、ロールバックの影響範囲はこの1索引のみ。`057`のRPC自体は本索引が無くても（Seq Scanで）動作する（性能が劣化するのみ）ため、本索引の適用有無はRPCの正しさに影響しない。

---

## 5. 既存索引との役割分担（重複索引ではないことの確認）

| 索引 | 対象 | 用途 | 本索引との関係 |
|---|---|---|---|
| `articles_metadata_actress_gin_idx ((metadata->'actress')) USING gin` | articles | `@>`containment検索専用（SameActressWorks等） | 併存。actress用であり無関係 |
| `articles_actress0_id_active_idx ((metadata->'actress'->0->>'id')) WHERE is_active` | articles | actressの等価抽出専用（weekly_rankings） | 併存。actress用であり無関係 |
| `articles_maker0_id_active_idx ((metadata->'maker'->0->>'id')) WHERE is_active` | articles | **maker**の等価抽出専用（057 get_fastest_releases_candidates） | 新規追加 |

---

## 6. アプリ側との適用順序

`057_fastest_releases_candidates_rpc.sql`はこの索引が無くても正しく動作する（Seq Scanになるだけ）。索引の適用有無はアプリケーションデプロイの前提条件ではないが、57メーカー分のクエリ性能に直結するため、**057適用と同じタイミングでの適用を推奨**する。

> 状態: **未適用**。[[feedback_migration_forward_fix]]の方針に従い、`.RUNBOOK.md`として正式な変更履歴に記録する。
