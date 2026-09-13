# mig055 手動適用 手順書（Weekly Rankings 専用ログイン `verity_weekly_rankings`）

対象: 新規ロール `verity_weekly_rankings`（LOGIN・最小権限）
状態: **適用済み**（Phase WR-3。`.sql` ファイルは無い。本書のみが実体）
本書を `.sql` ではなく `.md` として管理する理由: `CREATE ROLE ... PASSWORD '...'` を
平文でgitに含めることは絶対に避けるため。本書はプレースホルダのまま管理し、
**実行者が手元でパスワードを生成してから該当行だけ書き換えて実行する**。

---

## 0. 背景・目的

Weekly Rankings バッチ（`scripts/generate-weekly-rankings.mjs`）が Session Pooler 経由で
`compute_weekly_rankings` / `apply_weekly_rankings`（041/043、`SECURITY DEFINER`）を直接呼ぶための
専用ログインを作る。`service_role`（Postgres superuser相当ではないが強い権限を持つ既定ロール）を
バッチの直接DB接続に使い回さないことで、認証情報の権限範囲をこのバッチの用途だけに絞る。

**この2関数は `SECURITY DEFINER` かつ `search_path=public` であるため、呼び出し側ロールに必要な
権限は「関数のEXECUTE」のみで足りる。** 関数内部の `user_events` / `articles` / `weekly_rankings` /
`actresses` へのSELECT・INSERT・DELETEは、関数所有者（`postgres`）の権限で実行されるため、
`verity_weekly_rankings` にテーブル直接権限を一切付与する必要が無い（本番で実際に
`prosecdef=true` であることは読み取り専用クエリで確認済み — §5参照）。

---

## 1. 適用前チェック（読み取りのみ）

```sql
-- (a) ロールが未作成であること
SELECT rolname FROM pg_roles WHERE rolname = 'verity_weekly_rankings';
-- 期待: 0 rows

-- (b) 対象2関数がSECURITY DEFINERであること（前提の再確認）
SELECT proname, prosecdef, proconfig
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('compute_weekly_rankings','apply_weekly_rankings');
-- 期待: 両方 prosecdef = true, proconfig に search_path=public
```

---

## 2. パスワード生成（実行者の手元で行う。Claude/チャットに貼り付けない）

ローカル端末で強力なランダムパスワードを生成する（例）:

```bash
openssl rand -base64 32
```

生成した値は、以下の用途にのみ使う:
1. §3 の `CREATE ROLE` 文の `REPLACE_WITH_STRONG_RANDOM_PASSWORD_BEFORE_RUNNING` を置換する
2. VPS の `ecosystem.config.js`（gitignore済み・本番のみ）に
   `WEEKLY_RANKINGS_DATABASE_URL` として設定する（§6）

**パスワードそのものをClaudeに送らないこと。** SQL文中のプレースホルダ置換も、
Supabase SQL Editor上で実行者自身が行う。

---

## 3. 適用手順（Supabase SQL エディタ）

```sql
-- 3a. ロール作成（LOGIN・最小権限）。パスワードは必ず上で生成した値に置換してから実行。
--     CONNECTION LIMIT は週1回だけ動くバッチが暴走した場合の防御的上限（必須ではないが推奨）。
CREATE ROLE verity_weekly_rankings
  WITH LOGIN
  PASSWORD '<YOUR_PASSWORD>'
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION
  CONNECTION LIMIT 3;

-- 3b. ロール既定のstatement_timeout（スクリプト側のSET LOCAL '60s'と二重防御。
--     スクリプトの設定が万一漏れても、ロール既定でも60sで強制打ち切りされる）
ALTER ROLE verity_weekly_rankings SET statement_timeout = '60s';

-- 3c. 接続・スキーマ利用権限
GRANT CONNECT ON DATABASE postgres TO verity_weekly_rankings;
GRANT USAGE ON SCHEMA public TO verity_weekly_rankings;

-- 3d. 実行権限（対象2関数のみ。テーブル直接権限は付与しない — §0参照）
GRANT EXECUTE ON FUNCTION
  public.compute_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,text,integer)
  TO verity_weekly_rankings;
GRANT EXECUTE ON FUNCTION
  public.apply_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,integer)
  TO verity_weekly_rankings;
```

- 各文は単独実行でも一括実行でも構わない（`CREATE INDEX CONCURRENTLY` のような制約はない）。
- `weekly_rankings` / `user_events` / `articles` / `actresses` に対する `GRANT SELECT/INSERT/...` は
  意図的に行わない。

---

## 4. 適用後の検証クエリ（読み取りのみ）

```sql
-- (1) ロール属性
SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolconnlimit
FROM pg_roles WHERE rolname = 'verity_weekly_rankings';
-- 期待: rolcanlogin=t, rolsuper=f, rolcreatedb=f, rolcreaterole=f, rolreplication=f, rolconnlimit=3

-- (2) 付与された権限が「対象2関数のEXECUTEのみ」であること
SELECT p.proname, a.privilege_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace,
LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
JOIN pg_roles r ON r.oid = a.grantee
WHERE n.nspname = 'public' AND r.rolname = 'verity_weekly_rankings';
-- 期待: compute_weekly_rankings/apply_weekly_rankings の EXECUTE 2行のみ

-- (3) テーブル直接権限が無いこと（0行が期待値）
SELECT table_name, privilege_type
FROM information_schema.role_table_grants
WHERE grantee = 'verity_weekly_rankings';
-- 期待: 0 rows

-- (4) ロール既定statement_timeout
SELECT rolname, setconfig FROM pg_db_role_setting drs
JOIN pg_roles r ON r.oid = drs.setrole
WHERE r.rolname = 'verity_weekly_rankings';
-- 期待: setconfig に statement_timeout=60s
```

---

## 5. 前提事実（Phase WR-3 STEP2/3で読み取り専用確認済み・参考記録）

- `compute_weekly_rankings` / `apply_weekly_rankings` は本番で `prosecdef=true`,
  `proconfig=["search_path=public"]` を確認済み。
- 現状の EXECUTE 権限保持者は `postgres`（所有者）と `service_role` のみ（`anon`/`authenticated` には
  041/042/043で明示的に revoke 済み）。
- 本ロール追加は「`service_role` に加えて `verity_weekly_rankings` にもEXECUTEを追加付与する」操作であり、
  既存の `service_role` 経路・RLS・他のバッチ（`refresh_works_ranking_cache` 等、無関係）には一切影響しない。

---

## 6. VPS環境変数の設定（本書の適用者が実施。値はClaudeに送らない）

VPS の `/home/veritysite/verity-official.com/app/ecosystem.config.js`（gitignore済み・
デプロイでは転送されない本番専用ファイル）の `env` に、既存の `SUPABASE_SERVICE_ROLE_KEY` 等と
同じ並びで以下を追記する:

```js
// ── Weekly Rankings 専用DB接続（Session Pooler・least-privilege） ──────
WEEKLY_RANKINGS_DATABASE_URL: 'postgresql://verity_weekly_rankings:<§2で生成したパスワード>@<Session Poolerホスト>:5432/postgres?sslmode=require',
```

- `<Session Poolerホスト>` は Supabase ダッシュボード Connect → Direct → Session pooler に表示される
  正確な値を使う（Phase WR-3 STEP4で確認: `aws-1-ap-northeast-1.pooler.supabase.com` 系統。
  最終確認値は本体レポート参照）。
- パスワードに `@` `:` `/` 等の記号が含まれる場合は URL エンコードすること。
- 追記後、`pm2 startOrReload ecosystem.config.js --update-env` でcronジョブ自体ではなく
  **PM2アプリの env** が更新される点に注意（cronはPM2配下ではなく直接 `node` 実行のため、
  cron側は §7 の通り別途 `.env` 等が必要）。

### cron実行時のenv供給について

`scripts/generate-weekly-rankings.mjs` は既存の `maker-sync.mjs` 等と同じ `loadEnvFile`/
`loadEcosystemEnv` idiom を使い、`process.env` → `.env.local` → `.env` →
`ecosystem.config.js` の順で未設定キーのみ補完する。crontab は `cd ${VPS_APP} && node scripts/...`
という形で直接 `node` を起動するため（PM2経由ではない）、`ecosystem.config.js` に追記した
`WEEKLY_RANKINGS_DATABASE_URL` は `loadEcosystemEnv('ecosystem.config.js')` によって
このバッチ実行時にも自動的に補完される（PM2のreloadを待つ必要はない）。

---

## 7. 失敗時ロールバック

```sql
REVOKE EXECUTE ON FUNCTION
  public.compute_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,text,integer)
  FROM verity_weekly_rankings;
REVOKE EXECUTE ON FUNCTION
  public.apply_weekly_rankings(timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text,integer)
  FROM verity_weekly_rankings;
REVOKE USAGE ON SCHEMA public FROM verity_weekly_rankings;
REVOKE CONNECT ON DATABASE postgres FROM verity_weekly_rankings;
DROP ROLE verity_weekly_rankings;
```

ロールバック後は VPS の `ecosystem.config.js` から `WEEKLY_RANKINGS_DATABASE_URL` を削除
（または旧値のまま放置しても、ロール自体が存在しないため接続はfail-closedで失敗するのみ — 既存の
`get_top_works_ranked`/`works_ranking_cache`（RANK-2b）や notification 関連には一切影響しない）。

---

## 8. このロールが影響しない範囲（確認事項）

- `get_top_works_ranked` / `works_ranking_cache` / `verity_refresh_works_ranking`（RANK-2b）
- Favorite通知関連（`notify-actress-new-release.mjs` 等）
- migration 047 / 052
- Latest Releases / Hero 関連
- `service_role` の既存権限・既存の全RLSポリシー

新規ロールの追加とEXECUTE grantのみであり、上記のいずれも変更しない。
