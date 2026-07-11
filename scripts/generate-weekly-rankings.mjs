#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// generate-weekly-rankings.mjs — VERITY週間ランキング 生成バッチ（HTTP/nginx非経由）
// ═════════════════════════════════════════════════════════════════════════════
// 「毎週日曜23:30発表」の週間ランキング(5種)を締切後に事前計算しスナップショット保存する。
//   集計締切: 日曜 23:00:00 JST 未満   （23:00〜23:29 は両週から除外）
//   バッチ実行: 日曜 23:10 JST 目安
//   published_at: 日曜 23:30 JST      （フロントは published_at<=now() の週だけ表示）
//
// 依存: なし（Node v18+ の global fetch のみ）。Supabase は PostgREST /rpc を直叩き。
//   041 migration の compute_weekly_rankings / apply_weekly_rankings（service_role限定）を呼ぶ。
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
//   必要キー: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

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

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
for (const [k, v] of [['NEXT_PUBLIC_SUPABASE_URL', SB_URL], ['SUPABASE_SERVICE_ROLE_KEY', SB_KEY]]) {
  if (!v) { console.error(`FATAL weekly-rankings missing env ${k}`); process.exit(2) }
}
const NEWCOMER_DAYS = Number(argVal('newcomer-days') ?? 180)

// ── JST 週境界の算出（TZ非依存: 常に +09:00 で明示構築）─────────────────────────
// 与えられた now(UTC) から「現在のJST週」の月曜(00:00)を求める。--week=YYYY-MM-DD で上書き可。
const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
const jstIso = (d = new Date()) =>
  new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '') + '+09:00'

function computeWindow() {
  const weekArg = argVal('week')
  let monday // UTC Date whose UTC y/m/d == JST暦の月曜日
  if (weekArg) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekArg)) { console.error('FATAL --week must be YYYY-MM-DD'); process.exit(2) }
    const [y, m, d] = weekArg.split('-').map(Number)
    monday = new Date(Date.UTC(y, m - 1, d))
  } else {
    // 現在時刻を JST 壁時計に変換（UTCフィールドがJST日時になる）
    const jstNow = new Date(Date.now() + 9 * 3600 * 1000)
    const y = jstNow.getUTCFullYear(), m = jstNow.getUTCMonth(), d = jstNow.getUTCDate()
    const dow = jstNow.getUTCDay() // 0=Sun..6=Sat (JST基準)
    const deltaToMonday = dow === 0 ? -6 : 1 - dow
    monday = new Date(Date.UTC(y, m, d) + deltaToMonday * 86400 * 1000)
  }
  const sunday = new Date(monday.getTime() + 6 * 86400 * 1000)
  const prevMonday = new Date(monday.getTime() - 7 * 86400 * 1000)
  const weekKey = isoDate(monday)
  return {
    weekKey,
    periodStart: `${isoDate(monday)}T00:00:00+09:00`,
    periodEnd:   `${isoDate(sunday)}T23:00:00+09:00`,
    prevStart:   `${isoDate(prevMonday)}T00:00:00+09:00`,
    prevEnd:     `${isoDate(monday)}T00:00:00+09:00`,
    publishedAt: PUBLISH_NOW ? jstIso() : `${isoDate(sunday)}T23:30:00+09:00`,
  }
}

// ── Supabase PostgREST /rpc（service_role・supabase-js不要）─────────────────────
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
async function rpc(fn, args) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: SB_HEADERS, body: JSON.stringify(args),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`RPC ${fn} HTTP ${res.status}: ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

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
const w = computeWindow()
console.log(`\nSTART weekly-rankings started_at=${jstIso()} mode=${APPLY ? 'APPLY' : 'DRY'} host=${new URL(SB_URL).host}`)
console.log(`  week_key=${w.weekKey} newcomer_days=${NEWCOMER_DAYS}`)
console.log(`  period_start=${w.periodStart}  period_end=${w.periodEnd}`)
console.log(`  prev_start=${w.prevStart}  prev_end=${w.prevEnd}`)
console.log(`  published_at=${w.publishedAt}`)

try {
  // 1) 集計（compute は読み取りのみ。dry-run/apply どちらでも実行して内容を表示）
  const rows = await rpc('compute_weekly_rankings', {
    p_period_start: w.periodStart, p_period_end: w.periodEnd,
    p_prev_start: w.prevStart, p_prev_end: w.prevEnd,
    p_week_key: w.weekKey, p_newcomer_days: NEWCOMER_DAYS,
  })
  const list = Array.isArray(rows) ? rows : []
  console.log(`\ncompute_weekly_rankings -> ${list.length} rows`)
  summarize(list)

  // 2) 書き込み（--apply のみ。all-or-nothing で当該週を置換）
  if (APPLY) {
    const result = await rpc('apply_weekly_rankings', {
      p_period_start: w.periodStart, p_period_end: w.periodEnd,
      p_prev_start: w.prevStart, p_prev_end: w.prevEnd,
      p_published_at: w.publishedAt, p_week_key: w.weekKey, p_newcomer_days: NEWCOMER_DAYS,
    })
    console.log(`\nAPPLIED weekly-rankings ${JSON.stringify(result)}`)
  } else {
    console.log(`\n(dry-run: 書き込みなし。公開するには --apply を付けて再実行)`)
  }

  console.log(`\nDONE weekly-rankings mode=${APPLY ? 'APPLY' : 'DRY'} week_key=${w.weekKey} rows=${list.length} finished_at=${jstIso()} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`)
  process.exit(0)
} catch (err) {
  console.error(`FAILED weekly-rankings week_key=${w.weekKey} error=${String(err?.message ?? err)}`)
  process.exit(1)
}
