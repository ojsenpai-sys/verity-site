# Incident Report: Supabase CPU Saturation / VERITY全面停止

- **発生日**: 2026-09-05（JST）
- **重大度**: Critical（VERITY公開サイト全面応答不能）
- **記録者**: Claude Code（本インシデント対応セッションの記録に基づく）
- **表記方針**: 本レポートは「確定事実」と「推定」を明確に分けて記載する。確定事実は各Phaseでのread-only調査・実測ログで直接確認された内容のみ。推定は根拠を付した上で「推定」と明記する。

---

## 1. Incident Summary（確定事実）

2026-09-05未明、VERITY公開サイト（`https://verity-official.com/` および `/verity`）が外部・VPS内部localhostともにHTTPタイムアウトで応答不能となった。並行してSupabaseプロジェクトがUnhealthy状態となり、DB CPU使用率が90〜100%で高止まりした。根本原因はpg_cronで30分毎に実行されていたAnalytics集計処理（`refresh_tag_scores()` と `refresh_analytics()`末尾の`snapshot_daily_kpi()`）が、`user_events`テーブルの増加（約361,009行・539MB）に伴い実行時間が肥大化し、statement timeoutを超過・DB CPUを飽和させたことである。pg_cron job（jobname: `verity_refresh_scores`）の一時停止、PM2 reload、最終的にSupabase Project Restartを経て復旧した。

## 2. Impact（確定事実）

- VERITY公開サイト（トップページ・`/verity`配下全体）が外部・localhostともに長時間HTTPタイムアウト
- Supabase Dashboard上でプロジェクトステータスが "Unhealthy" 表示
- Supabase Advisorが "HEALTH CRITICAL: Data API error rate is persistently high" を検出
- VPS上のPM2プロセス（verity）がmax_memory_restartによる再起動を繰り返す状態（restart count がインシデント対応開始時点で24、対応完了までに38まで増加）
- 影響範囲は公開サイト全体（VERITYブランドの全ページ）。管理画面（Analytics）は個別に影響評価していないが、DB接続不能である以上同様に影響を受けていたと考えられる

## 3. Detection（確定事実）

ユーザーからの緊急障害調査依頼を契機に調査を開始。調査開始前の外形監視（Uptime監視等）は本インシデント発生時点で未導入であったため、自動検知ではなくユーザー起点の手動検知であった。

## 4. Timeline（すべてJST。UTC由来のログはJSTへ換算して記載）

| 時刻 | 出来事 | 根拠 |
|---|---|---|
| 00:05頃 | `ranking-snapshot` cron（VPS crontab）が504 Gateway Timeoutで失敗 | VPS `cron.log` に504エラーページ本文を確認 |
| 01:30頃（16:30 UTC） | pg_cron job `verity_refresh_scores`（refresh_tag_scores + refresh_analytics）が **statement timeout** で失敗。実行時間2分25秒 | `cron.job_run_details`: `status=failed`, `return_message='ERROR: canceling statement due to statement timeout'` |
| 01:31頃〜 | VPS上PM2（verityプロセス）のrestartが加速（約7〜10分間隔）。それ以前（09/01・09/03・09/04）はmax_memory_restartが数時間〜半日おきだった | VPS `~/.pm2/pm2.log` の `[PM2][WORKER] Process 0 restarted because it exceeds --max-memory-restart value` タイムスタンプ推移 |
| 02:00頃（17:00 UTC） | pg_cron job `verity_refresh_scores` が **job startup timeout** で失敗（起動すら不可） | `cron.job_run_details`: `status=failed`, `return_message='job startup timeout'` |
| 01:58頃 | 調査開始時点で外部HTTP（`/`,`/verity`）が20秒タイムアウト、VPS load average 70.44、PM2 restart count=24を確認 | 本セッションPhase1調査の直接観測 |
| 02:26:54頃 | `pg_stat_statements`の統計リセット時刻を確認（DB全体統計`pg_stat_database.stats_reset`はNULL＝未リセット） | 本セッションPhase2.1調査の直接観測 |
| 02:39〜40頃 | pg_cron job `verity_refresh_scores`（当時jobid=1）を `cron.alter_job(active:=false)` で一時停止 | 本セッションPhase2.2で実施・直後の確認クエリで反映確認 |
| 02:39頃〜 | 停止後15〜20分でDB CPUが16〜21%まで低下。DB接続数31/60、blocking/長時間query/idle-in-transactionいずれもゼロを確認。ただしVERITY localhost/外部は引き続きタイムアウト | 本セッションPhase2.3調査の直接観測 |
| 03:05:53頃 | PM2 reload（1回のみ）実施。以降PM2 restart countの新規増加は停止（安定化）。ただしlocalhost `/`,`/verity`は30秒timeoutでも無応答が継続 | 本セッションPhase2.3で実施・直後の確認 |
| 03:17:33頃 | Supabase Dashboardから Project Restart を実施（1回のみ） | 本セッションPhase2.4で実施 |
| 03:17:33〜03:41頃 | Project Restart所要時間 約24〜26分（Supabase公式案内の「a few minutes」より明確に長い） | 本セッションPhase2.4での継続観測 |
| 03:41〜03:44頃 | Supabase `SELECT 1` 正常応答、Data API（PostgREST経由の軽量GET）HTTP 200・244ms、VPS localhost `/`,`/verity` HTTP 200、外部 `/`,`/verity` HTTP 200 を確認。Supabase Dashboard STATUS が "Healthy" に復帰、Advisor issues 0件 | 本セッションPhase2.4での直接確認 |
| 復旧後 | PM2 restart count 38で以降変化なし（5分間の観測窓で新規restartなし）、memory増加も緩やか | 本セッションPhase2.4での直接確認 |

## 5. Root Cause（確定事実 + 推定を明記）

### 確定事実
1. `refresh_tag_scores()`（migration 026）は `user_events × articles` のJOINを、`created_at`による範囲限定なしで実行する。実行のたびに条件該当行を無期限にフルスキャンする構造。
2. `refresh_analytics()`（027/038/039/044）は末尾で `snapshot_daily_kpi()` を呼び出しており、同functionは`user_events`に対して未絞り込みの`COUNT(*)`を6回、および`get_audience_counts_v2/v3()`・`get_human_engagement_counts()/_v3()`経由でセッション単位の集計を複数窓（d0/d7/d30が入れ子で重複）にわたり実行する。合計で1回の呼び出しあたり14回以上のuser_eventsフルスキャン相当処理を行う。
3. 上記2つの処理は同一pg_cron job（`verity_refresh_scores`、`*/30 * * * *`）で30分毎に連続実行されていた。
4. `user_events`は調査時点で約361,009行・539MBであり、DB全体（697MB）の約77%を占める。テーブルに保持期間ポリシーはなく増加し続ける構造。
5. `cron.job_run_details`の実測で、同job（`verity_refresh_scores`）の実行時間が数週間規模の運用の中で「46〜55秒（安定時）」から「2分25秒（statement timeout）」「起動不能（job startup timeout）」まで段階的に悪化していたことを確認した。
6. Supabaseプロジェクトのコンピュートティアは `t4g.micro`（AWS Graviton2最小クラス）であることを確認した。
7. `refresh_tag_scores()`が生成する`tag_scores`マテリアライズドビュー、および関連RPC `get_top_tags_by_period()` は、リポジトリ全体を検索した結果、フロントエンド・API層のいずれからも参照されていない（デッドコード）ことを確認した。
8. VERITYアプリ側の共通Supabaseクライアント（`src/lib/supabase/server.ts` / `client.ts`）にはタイムアウト・AbortController・リトライが一切設定されていない。

### 推定（根拠を付す）
- **Postgresバックエンドの内部的な不安定化（クラッシュ/再起動相当の事象）が発生していた可能性が高い。** 根拠: `pg_stat_statements`の統計リセット時刻（02:26:54頃）が、`pg_stat_database.stats_reset`（NULL＝未リセット）と非対称であり、これは通常の明示的リセット操作では説明しにくい。本セッションはリセット操作を一切実行していない。ただし、Postgresサーバーログそのものへの直接アクセスは行っておらず、確定的な証拠ではない。
- **DB CPU正常化後もData API/PostgREST層が自然回復しなかった理由**（Phase2.3でPM2 reload後もVERITYが応答しなかった事象）は、PostgREST/API Gateway層に残存した劣化状態がSupabase Project Restartでのみ解消されたと推定される。Supabase管理下のマネージド基盤内部の挙動であり、当方から直接の原因確認はできない。
- **refresh_tag_scores()とsnapshot_daily_kpi()のどちらがより支配的なコスト要因か**は、EXPLAIN ANALYZEを実行していない（本インシデント対応中は禁止事項としていた）ため、定量的な切り分けはできていない。両者とも構造的に無期限フルスキャンを行う点は確定事実として確認済み。

## 6. Contributing Factors（確定事実）

- `user_events`に18個のインデックスが存在し、複数マイグレーションにわたる重複が見られる（書き込み時のインデックス保守コストに寄与、読み取り側の根本原因ではない）
- `tag_scores`（026）と`tag_popularity`（027）がほぼ同一のJOIN・重み付けロジックを別々に保持しており、同種の計算が実質的に重複していた
- 外形監視（uptime monitoring）・PM2 restart alert・Supabase CPU alertが未導入で、障害の早期検知ができていなかった
- Next.js側にSupabase呼び出しのタイムアウト上限がなく、Supabase側の遅延がそのままVERITY全体のリクエスト滞留・Node memory増加・PM2 restartループへ直結する設計だった

## 7. Mitigation（確定事実・実施順）

1. pg_cron job `verity_refresh_scores`（refresh_tag_scores + refresh_analytics + snapshot_daily_kpi の実行元）を `cron.alter_job(active:=false)` で一時停止（02:39〜40頃）
2. VPS PM2の`verity`プロセスを1回のみreload（03:05:53頃）
3. Supabase Project Restartを1回のみ実施（03:17:33頃）

## 8. Recovery（確定事実）

03:41〜03:44頃、以下すべてを確認して復旧完了と判定した:
- Supabase Dashboard STATUS: Healthy（Advisor issues 0件）
- `SELECT 1` 即時成功
- Data API（PostgREST）軽量GET: HTTP 200・244ms
- VPS localhost `/`,`/verity`: HTTP 200
- 外部 `/`,`/verity`: HTTP 200
- PM2 restart count: 復旧後5分間増加なし、memory増加も緩やか

## 9. Permanent Prevention（本インシデント対応の後続Phaseで設計・一部実装）

- **Phase 3.0**（設計調査）: Analytics基盤の増分化方式比較、cron再設計案、Next.js耐障害性改善案を策定
- **Phase 3.1**（本Phase）: `supabase/migrations/052_analytics_cron_safety.sql` を新規作成（本番未適用）
  - `refresh_tag_scores()` を定期実行経路から除外（tag_scores MV/functionはDROPせず残置）
  - `refresh_analytics()` から `snapshot_daily_kpi()` 呼び出しを分離
  - `snapshot_daily_kpi()` を独立cron（日次1回・JST 05:00予定）へ分離（function自体は無変更）
  - `refresh_analytics()` を4時間毎（JST 03/07/11/15/19/23時予定）へ頻度低減
  - 各cronコマンドに `SET statement_timeout`（120秒/300秒）をセッションスコープで設定
  - 新規cron jobは実行時間実測検証まで `active=false` で待機
- **実施済み（Phase 3.1.2）**: `052_analytics_cron_safety.sql` を本番適用（新規cron jobは`active=false`のまま）。手動1回実行での性能実測（確定事実）: `refresh_analytics()` 8.5秒、`run_snapshot_daily_kpi_job()`（`snapshot_daily_kpi()`のラッパー）39.3秒。いずれも設定したstatement_timeout（120秒/300秒）を大きく下回る。
- **実施済み（Phase 3.1.3）**: Supabaseから受信した「Disk IO Budget depleting」警告メールと本インシデントの相関を調査。結論（推定）: Disk IO Budget消費は本インシデントの直接の原因であるという証拠は確認できなかった。CPU/IOwait主導の障害メカニズム（本レポート5節）とは別軸の事象であり、今回の警告のみを理由にした即時コンピュートティアアップグレードは見送った（確定事実として、警告受信時点のDisk IO関連メトリクスと本インシデント期間のメトリクスを比較し、明確な因果を示す証拠は得られなかった）。
- **実施済み（Phase 3.2 / 3.2.1、本番反映: 2026-09-05）**: Next.js側のSupabase呼び出しに耐障害化を実装。
  - `src/lib/supabase/server.ts` の共通fetchへ8秒のAbortController based timeoutを追加（`src/lib/supabase/timeout.ts`）。呼び出し元signalとの合成・timer/listener cleanupを実装。
  - 主要な公開ページ（`/verity`, `/verity/features`ほか）およびHero/Trending/Weekly Rankings/最新作最速レビュー等のsectionコンポーネントに、Supabase失敗時のsection単位グレースフルフォールバックを実装。
  - Next.js内部制御フロー例外（`cookies()`由来の`DynamicServerError`等）を握り潰さないよう`unstable_rethrow()`を全catchブロックへ適用（実装中にbuildログから握り潰しの実バグを発見・修正）。
  - ローカル障害シミュレーション（本番DB/URL不使用、localhost上の自作TCPリスナーで代替）にて2件の実バグを発見・修正:
    1. `@supabase/postgrest-js`の`executeWithRetry`が独自timeout例外を「リトライ可能なnetwork error」と誤判定し、最大3回の指数バックオフリトライで実質39秒（意図した8秒の約5倍）に膨れていた問題。timeout例外のnameを`'AbortError'`として認識されるよう修正（`DOMException`継承）し解消。
    2. `HeroSection.tsx`の`getHeroArticle()`が3段のSupabaseクエリを`error`チェックなしに順次実行し、失敗時に最大24秒(3×8秒)を要していた問題。加えて`HeroV21Section`のフォールバック構造と合わせ最大32秒超に達していた。各段に`error`チェックを追加し即時return化して解消。
    3. 修正後のローカル障害シミュレーション実測（確定事実）: Supabase全面応答不能を模擬した状態で`/verity`はHTTP 200を維持し、TTFB（shell到達）約8.6秒・TOTAL（全section描画完了）約24.6秒。10回連続requestで応答時間は安定（変動±0.3秒以内）、プロセスメモリの単調増加なし、unhandled rejectionなし。
  - 既知の残課題（推定含む）: 上記TOTAL約24.6秒は複数sectionが3段構成で順次timeoutする構造に起因し、理想値（全体8〜10秒程度）には未到達。また実Supabase環境でも`get_top_works_ranked` RPCがstatement_timeoutでキャンセルされる事象が観測されており（Phase 3.2.1のローカル正常系回帰確認時）、DB側に本インシデントとは別の潜在的な遅延要因が残っている可能性がある（原因未特定・将来調査候補）。
- **未実施（別Phase以降で検討）**:
  - `REFRESH MATERIALIZED VIEW CONCURRENTLY` 化
  - `user_events` インデックス整理・保持期間ポリシー導入
  - 新規cron job（`verity_refresh_analytics_4h` / `verity_snapshot_daily_kpi`）の`active=true`化（実行時間実測は完了済みだが、有効化は別Phaseで判断）
  - 外形監視・PM2 restart alert・Supabase CPU/Data APIアラートの導入
  - コンピュートティア（t4g.micro）のアップグレード要否再評価（上記対策実施後に判断。Phase 3.1.3時点では今回の警告のみを理由にした即時アップグレードは見送り）
  - `get_top_works_ranked` RPCの実行時間調査（Phase 3.2.1で観測された潜在的な遅延要因）

## 10. Lessons Learned

- **「日次スナップショット」という名称の処理が実際には30分毎に実行されていた**ことが今回の主要な見落とし。処理の名称・意図と実際の実行頻度が乖離していないか、cron設計時に確認すべきだった。
- **未消費（デッドコード）のマテリアライズドビュー更新処理が本番負荷を発生させ続けていた。** 定期的に「このcron jobの出力を実際に読んでいるコードはどこか」を棚卸しする運用が必要。
- **user_eventsのような増加し続けるログテーブルに対する集計処理は、テーブルサイズの増加を前提に設計する必要がある。** 「実装時は軽量だったが、データ増加で徐々に重くなる」パターンは、実行時間の傾向監視（`cron_status_runs.duration_ms`の推移等）で早期検知できた可能性がある。
- **Supabase Project Restartは「a few minutes」という公式案内より大幅に時間がかかる場合がある**（今回約24〜26分）。復旧作業の所要時間見積もりに反映すべき。
- **アプリ側にタイムアウトがないと、依存先（Supabase）の障害がそのままアプリ全体の障害に直結する。** 外部サービス呼び出しには常にタイムアウト上限を設けるべき、という一般原則が今回のインシデントで具体的な被害として顕在化した。
- **外形監視の欠如により、障害検知がユーザー通報頼みになっていた。** 過去のインシデント（2026-07-05, 2026-07-09の全面503障害）でも同じ課題が指摘されていたが、今回も未対応のまま同種の問題（検知の遅れ）が再発した。

---

*本レポートは2026-09-05のインシデント対応セッション記録に基づき作成。追記・訂正が必要な場合は本ファイルを更新すること。*
