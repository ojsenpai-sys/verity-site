# mig040 手動適用 手順書（social_posts）

対象: `supabase/migrations/040_social_posts.sql`
状態: **未適用**。本手順書に沿って手動適用する。適用は Supabase SQL エディタ推奨。

---

## 0. 適用対象の概要（何が作られるか）

このマイグレーションが作成/変更するのは **`public.social_posts` 新表とその付随物のみ**：

- テーブル `public.social_posts`（投稿履歴・成果記録）
- CHECK 制約 5 件（`post_type` / `lang` / `status` / `metrics_nonneg` / `posted_at_chk`）
- インデックス 3 件（`social_posts_list_idx` / `social_posts_type_lang_idx` / `track_code` UNIQUE）＋ PK
- RLS 有効化 ＋ `REVOKE ALL FROM anon, authenticated` ＋ `GRANT ALL TO service_role`（ポリシーは作らない＝完全遮断）

### ⚠ user_events には一切触れない
- 本 SQL 内に **`user_events` への能動的な DDL は存在しない**（`§5` は後日用のコメントのみ）。
- 確認: `grep -nE '^[^-].*CREATE INDEX.*user_events' 040_social_posts.sql` → **0 件**であること。
- したがって適用中に既存の計測 INSERT（page_view / fanza_click 等）を**ブロックしない**。

---

## 1. 適用前チェック（読み取りのみ）

Supabase SQL エディタで実行:

```sql
-- (a) social_posts が未作成であること（NULL なら未作成＝適用可）
SELECT to_regclass('public.social_posts') AS social_posts_exists;   -- 期待: NULL

-- (b) 必要ロールが存在すること（Supabase では標準で存在）
SELECT rolname FROM pg_roles
WHERE rolname IN ('anon','authenticated','service_role')
ORDER BY rolname;                                                   -- 期待: 3 行

-- (c) gen_random_uuid() が利用可能なこと（既存 articles も使用）
SELECT gen_random_uuid() IS NOT NULL AS uuid_ok;                    -- 期待: t
```

- (a) が NULL 以外（既存）の場合は**適用を中止**し、既存定義との差分を確認する
  （`CREATE TABLE IF NOT EXISTS` は既存表の定義変更を反映しないため）。

---

## 2. 適用手順（Supabase SQL エディタ）

1. Supabase ダッシュボード → 対象プロジェクト（`janoaissungtmkdngmnf`）→ **SQL Editor**。
2. `supabase/migrations/040_social_posts.sql` の**全文**を貼り付ける。
3. **Run** を実行。
   - 本 SQL に `CONCURRENTLY` は無いため、単一トランザクションでの実行で問題ない。
   - `social_posts` は新規・空テーブルのため、索引作成も即時（ロック影響なし）。
4. エラーなく完了することを確認（`Success. No rows returned`）。

> psql を使う場合:
> `psql "$DATABASE_URL" -f supabase/migrations/040_social_posts.sql`
> （`user_events` への `CONCURRENTLY` は含まれないので通常実行で可）

---

## 3. 適用後の検証クエリ（読み取りのみ）

```sql
-- (1) テーブル存在
SELECT to_regclass('public.social_posts');                          -- 期待: public.social_posts

-- (2) カラム定義
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='social_posts'
ORDER BY ordinal_position;

-- (3) CHECK 制約 5 件
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid='public.social_posts'::regclass AND contype='c'
ORDER BY conname;
-- 期待: social_posts_lang_chk / _metrics_nonneg / _post_type_chk / _posted_at_chk / _status_chk

-- (4) 索引（PK + list + type_lang + track_code UNIQUE）
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public' AND tablename='social_posts'
ORDER BY indexname;

-- (5) RLS 有効
SELECT relrowsecurity AS rls_enabled
FROM pg_class WHERE oid='public.social_posts'::regclass;            -- 期待: t

-- (6) ポリシーが 0 件（＝完全遮断）
SELECT policyname FROM pg_policies
WHERE schemaname='public' AND tablename='social_posts';            -- 期待: 0 行
```

---

## 4. anon / authenticated 遮断の確認

```sql
-- テーブル権限に anon / authenticated が現れないこと（service_role のみ）
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='social_posts'
ORDER BY grantee, privilege_type;
-- 期待: grantee は service_role（と table owner）のみ。anon / authenticated は 0 行。
```

補強確認（任意・REST 経由の読み取り試行＝書き込みなし）:

```bash
# anon キーで直接 SELECT → 遮断されること（PGRST/permission denied または空+エラー）
curl -s -o /dev/null -w "%{http_code}\n" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/social_posts?select=id" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_ANON_KEY"
# 期待: 401/403 相当（200 で行が返ってはいけない）
```

- RLS 有効 ＋ ポリシー無し ＋ table 権限剥奪の三重で、anon/authenticated からは読めない。

---

## 5. service_role / admin action 前提の確認

- 管理画面の Server Action（`saveSocialPost` / `markSocialPostPosted` / `updateSocialPostMetrics` / `listSocialPosts`）は
  **service_role クライアント `svc()`** で接続し、RLS をバイパスして読み書きする。全関数が `requireAdmin()`（`ADMIN_EMAIL` 許可制）を通過する。
- アプリ動作での確認（本番/ステージング）:
  1. 管理者で `/verity/admin/social-posts` を開く。
  2. **「履歴・成果」タブ**が「mig040未適用」案内 → **空一覧（正常表示）** に切り替わること。
  3. 「生成」タブで生成 → **「履歴に保存」** → 成功し `?vp=` 付きテキストが返ること。
  4. 保存した投稿を **「投稿済みにする」** → `posted_at` が入り、成果欄（送客/PV/登録/訪問数）が表示されること。

---

## 6. 失敗時ロールバック

```sql
-- social_posts 一式（表・索引・制約）を削除。FK 被参照なしのため CASCADE の波及なし。
DROP TABLE IF EXISTS public.social_posts CASCADE;
```

- analytics が書き込む `user_events.metadata.vp` は「データ」であり DDL ロールバック不要（無害に残置）。
- 後日 vp 索引を適用済みだった場合のみ: `DROP INDEX CONCURRENTLY IF EXISTS public.user_events_vp_idx;`

---

## 7. user_events_vp_idx は「後日・CONCURRENTLY で別途」

- 本マイグレーションには**含めない**（hot 表 `user_events` への書き込みロック回避）。
- vp タグ付きイベント（`metadata.vp`）が十分溜まり、成果集計のコストが顕在化してから、
  **トランザクション外で単独実行**する:

```sql
-- SQL エディタで「この 1 文だけ」を実行すること（CONCURRENTLY は txn ブロック内不可）。
CREATE INDEX CONCURRENTLY IF NOT EXISTS user_events_vp_idx
  ON public.user_events ((metadata->>'vp'))
  WHERE metadata ? 'vp';
```

- 適用後の確認:
```sql
SELECT indexname FROM pg_indexes
WHERE schemaname='public' AND tablename='user_events' AND indexname='user_events_vp_idx';
```
- 失敗（INVALID 索引が残った）時: `DROP INDEX CONCURRENTLY IF EXISTS public.user_events_vp_idx;` して再実行。

---

## 適用順序（全体）

1. 本手順で **mig040 を適用**（新表のみ）。
2. アプリを**デプロイ**（`analytics.ts` / `layout.tsx` の vp 捕捉を本番反映）。
3. 数日運用して vp データを蓄積。
4. 必要になったら **user_events_vp_idx を CONCURRENTLY で追加**（§7）。

> 注意: 現時点では **DDL 適用・デプロイ・本番DB書き込みはいずれも未実施**。本書は手順のみ。
