#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// generate-weekly-rankings.mjs — VERITY週間ランキング 生成バッチ（Direct DB接続・非PostgREST）
// ═════════════════════════════════════════════════════════════════════════════
// 「毎週日曜23:30発表」の週間ランキング(5種)を締切後に事前計算しスナップショット保存する。
//   集計締切: 日曜 23:00:00 JST 未満   （23:00〜23:29 は両週から除外）
//   バッチ実行: 日曜 23:10 JST 目安
//   published_at: 日曜 23:30 JST      （フロントは published_at<=now() の週だけ表示）
//
// Phase WR-2: PostgREST(authenticatorロールでログイン、statement_timeout=8s固定・
//   SET ROLEでは再適用されないためservice_role個別設定でも回避不可。Phase WR-1.6実測確認済み)
//   経由の rpc() 呼び出しから、Supabase PostgreSQLへの Direct/Pooler接続 + parameterized
//   query 呼び出しへ変更した。Web API用authenticatorの8秒制限から週次バッチを切り離し、
//   このスクリプト専用のstatement_timeout(60s・無制限にはしない)を設定する。
//   compute_weekly_rankings/apply_weekly_rankings 自体のSQL・ランキング算出ロジック・
//   human判定ロジック・apply_weekly_rankingsの原子性(delete→insert)は一切変更していない。
//   週境界計算/SQL構築/実行制御は scripts/lib/weekly-rankings-window.mjs に分離済み
//   (pure・node:testで直接テスト可能)。
//
// 依存: pg (node-postgres)。ORM等は導入しない。
//
// 使い方:
//   node scripts/generate-weekly-rankings.mjs                 # dry-run（compute のみ・書込なし・既定）
//   node scripts/generate-weekly-rankings.mjs --apply         # apply（当該週を検証→全置換）
//   node scripts/generate-weekly-rankings.mjs --week=2026-07-06   # 対象週(月曜JST)を明示（backfill/再実行）
//   node scripts/generate-weekly-rankings.mjs --newcomer-days=180 # 新人窓（既定180）
//   node scripts/generate-weekly-rankings.mjs --publish-now       # published_at=現在時刻（即時公開・締切後の初回等）
//
// 冪等: 同じ week_key で再実行すると apply_weekly_rankings がトランザクション内で
//   検証→delete→insert する（全置換・all-or-nothing）。検証NGなら旧週データを保持。
//
// TZ非依存: 週境界は常に明示 +09:00 で構築し、サーバーのローカルTZに依存しない。
//
// env 取得順（未設定キーのみ補完）: process.env → ./.env.local → ./.env →
//   ./ecosystem.config.js の apps[].env（本番の権威ソース）
//   必要キー: WEEKLY_RANKINGS_DATABASE_URL（Supabase Session Pooler接続文字列。
//   このバッチ専用の最小権限ログイン verity_weekly_rankings を想定 — 汎用の
//   SUPABASE_DATABASE_URL のような名前にしないのは、この接続文字列が「このバッチ
//   専用の限定ロール」であり他用途に転用してはいけないことをコード上明示するため。
//   Phase WR-3: 変数名を SUPABASE_DATABASE_URL から改名（値の意味・接続方式は変更なし）。
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import pg from 'pg'
import { computeWindow, withClient, runWeeklyRankings, stripSslModeParam } from './lib/weekly-rankings-window.mjs'

const { Client } = pg

const ARGV = process.argv.slice(2)
const APPLY = ARGV.includes('--apply')
const PUBLISH_NOW = ARGV.includes('--publish-now')
const CWD = process.cwd()
const argVal = (name) => {
  const hit = ARGV.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

// ── env ローダ（maker-sync.mjs と同一idiom・未設定キーのみ補完）──────────────────
function loadEnvFile(file) {
  try {
    for (const raw of fs.readFileSync(path.join(CWD, file), 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq === -1) continue
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (k && process.env[k] === undefined) process.env[k] = v
    }
  } catch {}
}
function loadEcosystemEnv(file) {
  try {
    const require = createRequire(import.meta.url)
    const cfg = require(path.join(CWD, file))
    const env = cfg?.apps?.[0]?.env ?? {}
    for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = String(v)
  } catch {}
}
loadEnvFile('.env.local'); loadEnvFile('.env'); loadEcosystemEnv('ecosystem.config.js')

const DB_URL = process.env.WEEKLY_RANKINGS_DATABASE_URL
if (!DB_URL) { console.error('FATAL weekly-rankings missing env WEEKLY_RANKINGS_DATABASE_URL'); process.exit(2) }

// Phase WR-3 STEP7: connectionString内のsslmodeとClient()側ssl設定の競合を避けるため、
// sslmodeだけを除いた接続文字列を使う（実機検証済み・STEP5/5B参照）。DB_URL自体はログしない。
let CLEAN_DB_URL
try {
  CLEAN_DB_URL = stripSslModeParam(DB_URL)
} catch {
  console.error('FATAL weekly-rankings could not parse WEEKLY_RANKINGS_DATABASE_URL')
  process.exit(2)
}

const NEWCOMER_DAYS = Number(argVal('newcomer-days') ?? 180)

// PostgREST/authenticatorの8秒制限から独立した、このバッチ専用の上限。無制限にはしない。
const STATEMENT_TIMEOUT = '60s'
// Session Poolerへの接続確立自体がハングした場合に備えた上限（クエリのstatement_timeoutとは別軸）。
const CONNECTION_TIMEOUT_MS = 10_000

const jstIso = (d = new Date()) =>
  new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '') + '+09:00'

// ── 集計結果の要約表示（dry-run / apply 共通）────────────────────────────────────
const RANK_LABEL = {
  actress: '① 最も読まれた女優', work: '② 最も読まれた作品', maker: '③ 人気メーカー',
  newcomer: '④ 新人女優', rising: '⑤ 急上昇女優',
}
function summarize(rows) {
  const byType = {}
  for (const r of rows) (byType[r.ranking_type] ??= []).push(r)
  for (const type of ['actress', 'work', 'maker', 'newcomer', 'rising']) {
    const list = (byType[type] ?? []).sort((a, b) => a.rank - b.rank)
    console.log(`\n${RANK_LABEL[type]}  (${list.length}件)`)
    for (const r of list) {
      const md = r.metadata ?? {}
      let extra = ''
      if (type === 'work') extra = `[${md.floor ?? '?'}] ${md.maker_name ?? ''} rep=${md.representative_cid ?? ''}`
      else if (type === 'maker') extra = `rep=${md.rep_cid ?? ''}`
      else if (type === 'newcomer') extra = `basis=${md.newcomer_basis ?? ''} first=${md.first_work_date ?? ''}`
      else if (type === 'rising') extra = `${md.previous_sessions ?? 0}→${md.current_sessions ?? 0} Δ${md.absolute_growth ?? ''}${md.is_new_vs_prev ? ' NEW' : ''}`
      const chg = r.is_new_entry ? 'NEW' : (r.rank_change > 0 ? `↑${r.rank_change}` : r.rank_change < 0 ? `↓${-r.rank_change}` : '→')
      console.log(`  #${String(r.rank).padStart(2)}  ${String(r.entity_name).slice(0, 22).padEnd(22)} u=${String(r.unique_sessions).padStart(3)} v=${String(r.total_views).padStart(3)} ${chg.padEnd(4)} ${extra}`)
    }
  }
}

// ── メイン ───────────────────────────────────────────────────────────────────
const t0 = Date.now()
let w
try {
  w = computeWindow({ weekArg: argVal('week'), publishNow: PUBLISH_NOW })
  console.log(`\nSTART weekly-rankings started_at=${jstIso()} mode=${APPLY ? 'APPLY' : 'DRY'} connection=direct`)
  console.log(`  week_key=${w.weekKey} newcomer_days=${NEWCOMER_DAYS}`)
  console.log(`  period_start=${w.periodStart}  period_end=${w.periodEnd}`)
  console.log(`  prev_start=${w.prevStart}  prev_end=${w.prevEnd}`)
  console.log(`  published_at=${w.publishedAt}`)

  const tCompute0 = Date.now()
  const { rows: list, applyResult } = await withClient(
    () => new Client({
      connectionString: CLEAN_DB_URL,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    }),
    STATEMENT_TIMEOUT,
    (client) => runWeeklyRankings(client, { w, newcomerDays: NEWCOMER_DAYS, apply: APPLY }),
  )
  const computeDuration = ((Date.now() - tCompute0) / 1000).toFixed(1)

  console.log(`\ncompute_weekly_rankings -> ${list.length} rows (compute_duration=${computeDuration}s)`)
  summarize(list)

  if (APPLY) {
    console.log(`\nAPPLIED weekly-rankings ${JSON.stringify(applyResult)}`)
  } else {
    console.log(`\n(dry-run: 書き込みなし。公開するには --apply を付けて再実行)`)
  }

  console.log(
    `\nDONE weekly-rankings mode=${APPLY ? 'APPLY' : 'DRY'} connection=direct week_key=${w.weekKey} ` +
    `rows=${list.length} finished_at=${jstIso()} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`
  )
  process.exit(0)
} catch (err) {
  console.error(`FAILED weekly-rankings week_key=${w?.weekKey ?? '?'} error=${String(err?.message ?? err)}`)
  process.exit(1)
}
