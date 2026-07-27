# mig045 手動適用 手順書（articles_metadata_actress_gin_idx）

対象: `public.articles` への索引追加（**`.sql` ファイルは無い。本書のみが実体**）
状態: **適用済み**（本番・Supabase SQL エディタで単独実行）。
`indisvalid=t` / EXPLAIN で `Bitmap Index Scan on articles_metadata_actress_gin_idx` 使用確認済み
（河北彩花 id=1044864: Execution Time 8.398ms / 星空ねる id=1112549: Execution Time 0.235ms）。

---

## 0. なぜ `045_*.sql` ではなく RUNBOOK なのか

- `CREATE INDEX CONCURRENTLY` はトランザクションブロック内では実行できない（Postgres仕様）。
- 本プロジェクトには migration を自動適用する CLI/runner は存在しない（`deploy.sh` はコード転送のみで
  DB には一切触れない。`.github/workflows` も無し）。現状は Supabase SQL Editor での**手動貼り付け実行**
  が唯一の適用経路。
- とはいえ、将来 Supabase CLI 等の `*.sql` を自動収集して適用する仕組みを導入した場合、
  `supabase/migrations/045_*.sql` として置かれた `CREATE INDEX CONCURRENTLY` はそのランナーの
  トランザクションに巻き込まれて失敗する（＝安全に失敗するとはいえ、原因調査の手間が生じる）。
- 本コードベースには既に同じ判断の前例がある: `040_social_posts.RUNBOOK.md` §7 の
  `user_events_vp_idx`（CONCURRENTLY 索引）は `040_social_posts.sql` 本体には**一切含めず**、
  RUNBOOK 内のコマンドとしてのみ存在する。本ファイルはそれと同じパターンを踏襲する。
- `.md` 拡張子は `*.sql` glob に一致しないため、将来ランナーが導入されても本ファイルが誤って
  自動実行される心配が構造的に無い。

比較した3案（A/B/C）:

| 案 | 内容 | 判定 |
|---|---|---|
| A | `045_*.sql` に通常 `CREATE INDEX IF NOT EXISTS`（CONCURRENTLYなし） | 却下: articles は書き込み中（maker-sync 等）に SHARE ロックで INSERT/UPDATE をブロックする。テーブルは小さい（3万行強）ため短時間の見込みだが、CONCURRENTLY で回避できるロックをあえて許容する理由が無い |
| B | CONCURRENTLY版をSQL Editorで手動実行し、migration履歴にも同期 | 却下: 同期すべき「migration履歴」テーブル自体がこのプロジェクトに存在しない（CLI未導入のため `supabase_migrations.schema_migrations` 等の管理機構が無い）。同期対象が無いため本案は成立しない |
| **C（採用）** | CONCURRENTLY版を migration フォルダ外＝RUNBOOK.md として管理 | 採用: 040 の既存前例と完全に一致。ランナー導入時も自動実行対象にならず安全 |

---

## 1. 適用前チェック（読み取りのみ）

```sql
-- (a) 索引が未作成であること
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='articles'
  AND indexname='articles_metadata_actress_gin_idx';                -- 期待: 0 行

-- (b) 対象カラムが jsonb であること
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema='public' AND table_name='articles' AND column_name='metadata';
-- 期待: metadata / jsonb

-- (c) 名前の重複が無いこと（articles の既存索引一覧）
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='articles' ORDER BY indexname;
-- 期待: articles_category_idx / articles_fts_idx / articles_published_at_idx /
--        articles_slug_idx / articles_source_idx / articles_tags_idx のみ
--        （articles_metadata_actress_gin_idx が含まれていないこと）
```

---

## 2. 適用手順（Supabase SQL エディタ・この 1 文だけを単独実行）

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_metadata_actress_gin_idx
  ON public.articles
  USING gin ((metadata -> 'actress') jsonb_path_ops);
```

- 索引対象は `metadata` 全体ではなく `metadata -> 'actress'` のみに限定（無関係な metadata 更新で
  索引サイズ・書き込みコストが不要に増えるのを避ける）。
- 演算子クラスは `jsonb_path_ops`。本用途で使う演算子は `@>`（containment）のみであり、
  `?`/`?|`/`?&` は使わないため、PostgreSQL 公式推奨どおり `jsonb_ops` より軽量な
  `jsonb_path_ops` を採用（containment 専用最適化）。
- **この SQL 文単体のみを Run すること**（他の DDL と同じ実行枠にまとめない）。CONCURRENTLY は
  複数文をまとめて送るとトランザクションブロック扱いになり失敗するため。
- DROP・既存索引の変更は行わない。
- 対象テーブルは 32,615 行（`is_active=true`。全体は 32,668 行）と小規模。CONCURRENTLY のため
  書き込みロックは発生しないが、索引ビルド自体は数秒〜数十秒かかる場合がある（未実測）。

> psql を使う場合:
> `psql "$DATABASE_URL" -c "CREATE INDEX CONCURRENTLY IF NOT EXISTS articles_metadata_actress_gin_idx ON public.articles USING gin ((metadata -> 'actress') jsonb_path_ops);"`
> （`-f` でファイル一括実行する場合、他の文と混在させないこと）

---

## 3. 適用後の検証クエリ（読み取りのみ）

```sql
-- (1) 索引の存在・定義
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname='public' AND tablename='articles'
  AND indexname='articles_metadata_actress_gin_idx';
-- 期待 indexdef（PostgreSQLの正規化で多少表記が変わって構わない）:
--   ... USING gin ((metadata -> 'actress'::text) jsonb_path_ops)

-- (2) INVALID になっていないこと（CONCURRENTLY 失敗時は invalid=true のまま残る）
SELECT indexrelid::regclass AS index_name, indisvalid
FROM pg_index
WHERE indexrelid = 'public.articles_metadata_actress_gin_idx'::regclass;
-- 期待: indisvalid = t

-- (3) 索引が使われることの確認（EXPLAIN・河北彩花 id=1044864・715件想定の多出演女優）
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM public.articles
WHERE
  (metadata -> 'actress') @> '[{"id":1044864}]'::jsonb
  AND is_active = true
ORDER BY published_at DESC
LIMIT 24;

-- (3b) 少数出演女優でも確認（星空ねる id=1112549・4件想定）
--      索引なし時に既存 published_at 索引でのスキャン量が伸びやすかったケース
--      （ローカル調査時参考値: 索引なしで中央値170ms・DBクエリ+ネットワーク込み）
EXPLAIN (ANALYZE, BUFFERS)
SELECT id
FROM public.articles
WHERE
  (metadata -> 'actress') @> '[{"id":1112549}]'::jsonb
  AND is_active = true
ORDER BY published_at DESC
LIMIT 24;

-- (4) 索引が実際にスキャンされた回数（適用直後は0、上記EXPLAINやアプリアクセス後に増える）
SELECT
  schemaname,
  relname,
  indexrelname,
  idx_scan
FROM pg_stat_user_indexes
WHERE indexrelname = 'articles_metadata_actress_gin_idx';
```

期待する確認内容（(3)(3b)共通）:
- 実行計画に `articles_metadata_actress_gin_idx` が現れること。
- `Bitmap Index Scan on articles_metadata_actress_gin_idx`、またはそれを内側に持つ
  `Bitmap Heap Scan` が確認できること。
- `Seq Scan` のみになっていないこと（プランナーが件数・統計次第で Seq Scan を選ぶ場合もあるため、
  もし Seq Scan のみであれば「なぜ索引が使われなかったか」を `ANALYZE` 後の統計・行数見積もりから
  分析すること。`enable_seqscan` 等のプランナー設定を勝手に変更して索引利用を強制しない）。
- `Planning Time` / `Execution Time` を両方記録すること。
- `Buffers` 出力（shared hit/read 等）も記録し、キャッシュ経由かディスク読みかの参考にする。

- (2) で `indisvalid = f` の場合は失敗（CONCURRENTLY作成中にエラーが起きた痕跡）。
  `DROP INDEX CONCURRENTLY IF EXISTS public.articles_metadata_actress_gin_idx;` の上で再実行する。

---

## 3.5 本番適用時の注意（厳守）

- SQL Editor で **1 文ずつ単独実行**する（本書 §2 の CREATE INDEX、検証クエリもそれぞれ個別に実行）。
- **BEGIN / COMMIT で囲まない**（CONCURRENTLY はトランザクションブロック内では失敗するため）。
- 可能であれば maker-sync 等の書き込みジョブと**時間帯をずらす**（CONCURRENTLY 自体は書き込みを
  ブロックしないが、索引ビルド中は対象テーブルへの書き込み負荷が両者で競合しうる）。
- **失敗時はエラー全文を保存**し、原因を確認する。**通常の `CREATE INDEX`（CONCURRENTLYなし）へ
  勝手に変更しない**（このRUNBOOK §0 の A/B/C比較で却下済みの案に無断で切り替えない）。
- **インデックス作成の成功確認（本書 §3 の (1)(2)）が取れる前にコードをデプロイしない**。
  索引なしでも機能はするが、順序としては索引を先に適用する（本書 §5 参照）。

---

## 4. 失敗時ロールバック

```sql
DROP INDEX CONCURRENTLY IF EXISTS public.articles_metadata_actress_gin_idx;
```

- 新規索引の追加のみであり、既存データ・既存索引には一切触れていないため、ロールバックの影響範囲は
  この索引 1 本のみ。

---

## 5. アプリ側との適用順序

1. 本索引を先に適用（本書 §2）。
2. `SameActressWorks.tsx` の ID 方式クエリをデプロイ。
3. 索引適用前でも既存 `articles_published_at_idx` により機能はする（動作確認済み・Phase 1-2.3 完了報告参照）ため、
   順序が前後しても機能上の破綻は無いが、出演数が少ない女優のケースで索引適用前は応答が伸びる
   （実測: 星空ねる=中央値170ms、河北彩花=中央値56ms、いずれも索引なし）。索引を先に適用する方が安全。

> 状態: **索引作成は完了**（本番）。アプリのデプロイは別途 Phase 1-2.3 完了報告を参照。
