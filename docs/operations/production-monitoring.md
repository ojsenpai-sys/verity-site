# VERITY Production Monitoring — Runbook

Phase 3.3で新設。2026-09-05インシデント（`docs/incidents/2026-09-05_supabase-cpu-saturation.md`）を根拠に、
「完全停止する前に検知する」ための最低限の観測手段と閾値をまとめる。

**本書は観測とrunbookのみを扱う。自動修復（auto restart/auto remediation）は一切含まない。**

---

## 1. Normal baseline（2026-09時点の実測に基づく）

| 指標 | 正常範囲 |
|---|---|
| PM2 process CPU | 約5〜20%（瞬間値。デプロイ直後は一時的に50-100%まで跳ねるが数分で収束する） |
| PM2 memory | 約150〜300MB |
| PM2 restart count | デプロイ1回につき+1のみ。デプロイなしでの増加は異常 |
| 外部HTTP（`/`, `/verity`） | 200、TTFB概ね2.5〜4秒 |
| `/api/health` | 200、50ms前後（Supabaseに依存しないため常に高速） |
| Supabase DB CPU（Observability, Last 60 minutes） | 概ね10〜20% |
| Supabase timeout / statement timeout | 0が理想。低頻度の散発は許容、急増は異常 |
| HTTP 5xx | 0 |

## 2. Warning thresholds

| 指標 | Warning |
|---|---|
| PM2 process CPU | 30%以上（持続） |
| PM2 memory | 800MB以上 |
| PM2 restart | デプロイなしで直近ウィンドウ内に+1 |
| 外部HTTP latency | 5秒以上 |
| エラーログ（`verity-error-0.log`直近5000行） | statement timeout 1件以上、または auth-unavailable 1件以上、または section-fallback系ログ5件超 |
| Supabase Service Health "DATABASE" | 個別のエラー率上昇のみでは即断しない（低トラフィック時は分母が小さくノイズが出やすい実測済みの既知挙動）。Logs（Postgres, Last 60 minutes）で実際の行数を確認すること |

## 3. Critical thresholds

| 指標 | Critical | 根拠 |
|---|---|---|
| PM2 process CPU | 60%以上（持続） | インシデント時 60-100% |
| PM2 memory | 1.4GB以上 | `max_memory_restart=1800M`到達前に介入余地を残す |
| PM2 restart | デプロイなしで短時間に+2以上 | インシデント時は7〜10分間隔でrestartが加速 |
| 外部HTTP | 5xx、またはtimeout（15秒超） | インシデント時は20秒超timeout |
| エラーログ | statement timeout 10件超、auth-unavailable 10件超、unhandled rejection 1件以上、DynamicServerError 1件以上 | — |

`max_memory_restart=1800M`との関係: WarningとCriticalの間（800MB〜1.4GB）に十分な観測・介入余地を残す設計。1.4GBを超えた時点で人間が対応を検討し、1800MBのPM2自動再起動に「後手で」対応する事態を避ける。

## 4. Health endpoint

`GET /api/health` を新設（`src/app/api/health/route.ts`）。

- Supabase等の外部依存を一切呼ばない。「Next.jsプロセスが生きていて応答できるか」のみを示す。
- `src/proxy.ts`の`config.matcher`から除外済み — proxyは全リクエストで`supabase.auth.getUser()`（8秒timeout付き）を実行するため、除外しないとAuth基盤障害時にヘルスチェック自体が巻き添えで遅延する。
- secret・バージョン番号・内部インフラ情報は返さない（`{"status":"ok"}`のみ）。
- DBの健全性はここでは見ない（意図的に分離。第8節参照）。

## 5. External uptime monitoring（設定手順・未導入）

**本Phaseでは外部アカウントの新規作成は行っていない。** 導入する場合の推奨構成:

- 監視対象: `/`, `/verity`, `/api/health` の3つ
- 間隔: 5分（`/api/health`はSupabase非依存で軽量なので高頻度でも負荷源にならないが、`/`・`/verity`は5分間隔に留める — 監視自体が負荷源化しないため）
- UptimeRobot等のフリープランで概ね対応可能（5分間隔監視は無料枠の標準機能であることが多い。詳細は導入時に各サービスの現行プランを確認）
- 通知先はサービスのUI上でメール/Slack Webhook等を設定（本書は手順の整理のみ。実際の登録・APIキー発行はユーザー自身が行うこと）

## 6. PM2 monitoring — check commands

```bash
# ssh先(VPS)で実行
export PATH=/home/veritysite/.nodebrew/node/v20.11.1/bin:$PATH
pm2 jlist | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);const p=j.find(x=>x.name==='verity');console.log('uptime_min='+Math.round((Date.now()-p.pm2_env.pm_uptime)/60000));console.log('restarts='+p.pm2_env.restart_time);console.log('mem_mb='+(p.monit.memory/1024/1024).toFixed(1));console.log('cpu='+p.monit.cpu);})"
```

## 7. Application log monitoring — 重要な訂正

**console.error()はstdout(`verity-out-0.log`)ではなくstderr(`verity-error-0.log`)に出力される。**
本Phase監査で判明: Phase 3.2.4〜3.2.7の完了報告で集計していた「`[profile]`等のエラーログ件数」は
`verity-out-0.log`のみをgrepしており、実際の`console.error`出力先である`verity-error-0.log`を
見ていなかった。そのため過去の報告における「エラーログ0件」は**stdoutが静かだったことの確認に過ぎず、
stderrの状態は未確認だった**。本書と`scripts/monitor-production.mjs`は両方のログを対象にする。

また、Phase 3.2.6で判明した教訓（URLに含まれる数字列の"503"をHTTP 503と誤検出）を踏まえ、
**HTTP 5xxはログgrepでは判定しない。** production実行では`next dev`のようなアクセスログ行
（`GET /path 200 in Xms`形式）が出力されないため、grepで正確な5xx検出は原理的にできない。
5xxは外形HTTPプローブ（実際にリクエストを送りステータスコードを見る）でのみ判定する。

チェック対象パターン（`verity-error-0.log`）:

| パターン | 意味 |
|---|---|
| `canceling statement due to statement timeout` | Postgres statement timeout（RPC/クエリ側） |
| `Supabase fetch timed out` | Phase 3.2クライアント側8秒timeout発火 |
| `[auth-unavailable]` / `[proxy] auth check unavailable` | Auth基盤障害 |
| `[works-ranking]` / `[same-actress-works]` / `[related-works-scored]` / `[related-articles-section]` / `[positioning-block]` / `[profile]` | 各sectionのgraceful fallback発火（＝Data API劣化の早期signal） |
| `DynamicServerError` | Next.js内部の制御フロー例外の握り潰し漏れ（本来発生してはいけない） |
| `UnhandledPromiseRejection` / `unhandledRejection` | 未捕捉のPromise reject（要調査） |

```bash
# 直近5000行から件数を見る例
tail -n 5000 ~/.pm2/logs/verity-error-0.log | grep -c 'canceling statement due to statement timeout'
tail -n 5000 ~/.pm2/logs/verity-error-0.log | grep -c -E '\[auth-unavailable\]|\[profile\]|\[works-ranking\]'
```

**既知の限界**: PM2ログに行ごとのタイムスタンプが付与されていないため（`ecosystem.config.js`に
`log_date_format`未設定）、「直近5000行」が実際に何分・何時間分に相当するかは実行時の
ログ増加速度に依存し一定しない。時間軸での正確な傾向分析が必要な場合は
`log_date_format: 'YYYY-MM-DD HH:mm:ss Z'`等の追加を検討（本Phaseでは変更していない — 別Phase候補）。

## 8. DB / Supabase monitoring（Supabase Dashboard、優先順位順）

1. **Observability > Overview の Service Health「DATABASE」** — ただし単独のエラー率%は低トラフィック時にノイズが出やすい（実測済み: PostgREST 360 requests/60分程度の時間帯でもエラー率が数十%表示になることがある）。**必ずLogs（Log Type=Postgres）で実際の行数を確認してから判断する。**
2. **CPU** — インシデントでは90-100%で高止まり。60%超が数分継続したら要注意。
3. **Data API / PostgREST error** — CPU高騰と同時に発生している場合のみ重大signalとして扱う（単独のDisk IO警告は原因と断定しない — Phase 3.1.3で相関なしと確認済み）。
4. **Slow Queries** — 件数の推移を見る（本書執筆時点で112件、単発の数字に一喜一憂しない。増加トレンドを見る）。
5. **pg_stat_activity**（read-only）:
   ```sql
   select pid, state, wait_event_type, now() - query_start as duration, left(query, 100)
   from pg_stat_activity
   where state != 'idle'
   order by duration desc;
   ```

**重大signalの組み合わせ**: 「DB CPU高騰」+「Data API/PostgRESTエラー」+「アプリ側timeout急増」が
同時に発生した場合のみCRITICALとして扱う。Disk IO警告単体はインシデント原因と断定しない。

## 9. cron monitoring

```sql
-- read-only. 現在の状態確認（変更しない）
select jobname, active
from cron.job
where jobname in ('verity_refresh_scores','verity_refresh_analytics_4h','verity_snapshot_daily_kpi','verity_refresh_user_profiles')
order by jobname;

-- 失敗・timeout・実行時間の推移（analytics cron再開後に必ず見ること）
select jobid, status, return_message, start_time, end_time,
       extract(epoch from (end_time - start_time)) as duration_sec
from cron.job_run_details
where jobid in (select jobid from cron.job where jobname like 'verity_%')
order by start_time desc
limit 50;
```

analytics cron（`verity_refresh_analytics_4h` / `verity_snapshot_daily_kpi`）は本Phaseでも
`active=false`のまま — 再開はPhase 3.4以降で別途判断する。

## 10. Alert design（設計のみ・未導入）

本Phaseでは実際の外部通知サービスへの自動送信は実装していない。導入する場合の候補:

| 重大度 | 条件 | 通知候補 |
|---|---|---|
| INFO | WARNING閾値の単発超過 | 任意（ログのみでも可） |
| WARNING | 本書2節の条件が継続 | Slack / Discord Webhook |
| CRITICAL | 本書3節の条件、または外形HTTPが5xx/timeout | Email + Slack/Discord + UptimeRobot通知（多重化） |

- 既存の技術基盤として `scripts/lib/notification-mailer.mjs`（Resend経由メール送信、`notify-actress-new-release.mjs`等で使用中）が既にあるため、新規メール送信基盤を追加せずとも将来的に再利用できる可能性がある（本Phaseでは配線していない）。
- LINE通知が必要な場合はLINE Notify等の個人アカウント連携が必要 — ユーザー自身の設定が必要。
- **どの経路を選ぶ場合も、実際のWebhook URL/APIキー発行・外部サービスへの登録はユーザー自身が行うこと。**

## 11. してはいけないこと

- CPU高騰だけを理由にSupabase Project Restartをしない（まずCPU+Data APIエラー+アプリtimeoutの組み合わせを確認）
- PM2 memory増加だけを理由に即座にrestart/reloadしない（正常なキャッシュウォームアップ後の自然な増加と区別する）
- cronを原因確認せずdisableしない（disableする場合は`cron.alter_job(active:=false)`のみ、DROP禁止）
- インシデント中にDB indexを追加しない（負荷追加のリスク、平常時に計画的に実施する）
- インシデント中に`EXPLAIN ANALYZE`を実行しない（実際にクエリを実行してしまう。`EXPLAIN (FORMAT TEXT)`のみ可）
- 監視スクリプト自身がDB writeやRPC実行を行わない（本書のscriptは読み取り専用）
- 監視閾値超過だけを理由に自動でPM2 restart/reload/deployを実行する仕組みを組み込まない（本Phaseの方針: 検知と通知のみ、対応は人間が判断する）

## 12. 5分クイックチェック（インシデント疑い時）

1. 外部HTTP: `Invoke-WebRequest -UseBasicParsing https://verity-official.com/`, `/verity`, `/api/health`
2. Latency: 上記のレスポンス時間（5秒超で要注意、15秒超でCritical）
3. PM2: `pm2 jlist`でstatus/uptime確認
4. Memory: 同上、800MB/1.4GBの閾値と比較
5. Restart count: 直前の既知値と比較（増えていれば要注意）
6. 直近エラー: `tail -n 5000 verity-error-0.log`を本書7節のパターンでgrep
7. Supabase CPU: Observability > Overview（Last 60 minutes）
8. Service Health: 同画面のDATABASE行 → 疑わしければLogs（Postgres）で実件数を確認
9. pg_stat_activity: 本書8節のクエリ（read-only）
10. cron状態: 本書9節のクエリ（read-only、変更しない）

これらすべては`scripts/monitor-production.mjs`（1〜6相当）+ 本書のSupabase SQL（7〜10相当）でカバーされる。

## 13. 実行方法

```bash
# VPS上で（推奨）
cd /home/veritysite/verity-official.com/app
node scripts/monitor-production.mjs        # 人間可読
node scripts/monitor-production.mjs --json # 機械可読

# ローカルから実行した場合は外形HTTPチェックのみ実行され、
# PM2/ローカルログ関連はUNKNOWNとして扱われる（自動的にスキップ）。
```

cron登録は本Phaseでは行っていない。導入する場合の例（5分間隔、ログ肥大化を避けるため
`--json`ではなく通常出力をローテーション付きで保存することを推奨）:

```
*/5 * * * * cd /home/veritysite/verity-official.com/app && node scripts/monitor-production.mjs >> $HOME/logs/verity/monitor.log 2>&1
```

**このcrontab行は本Phaseでは追加していない。** 追加はユーザーの判断で行うこと（healthcheck-start.shと役割が異なることに注意 — healthcheck-start.shはPM2 downを検知して自動起動する既存の自動復旧スクリプト、本スクリプトは観測専用で一切のアクションを取らない）。
