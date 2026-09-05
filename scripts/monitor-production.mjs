#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// scripts/monitor-production.mjs — read-only production early-warning check
// (Phase 3.3)
// ═════════════════════════════════════════════════════════════════════════════
//
// 目的: 2026-09-05 インシデント（DB高負荷→Data API劣化→リクエスト滞留→Node
// メモリ増加→PM2 max_memory_restartループ→全面停止）のような進行を、完全停止に
// 至る前の早期段階で検知できるようにする（docs/incidents/2026-09-05_...md 参照）。
//
// 本スクリプトは「観測のみ」。以下は一切行わない:
//   - DB WRITE / migration / RPC呼び出し
//   - PM2 restart/reload/stop
//   - deploy
//   - 外部通知の自動送信（判定結果を標準出力に出すのみ）
//
// 想定実行環境: VPS上（PM2ログ・localhost:3000 に直接アクセスできる環境）。
// ローカル開発機から実行した場合、PM2/ローカルログのチェックは自動的にスキップされ、
// 外形HTTPチェックのみ実行される。
//
// 使い方:
//   node scripts/monitor-production.mjs
//   node scripts/monitor-production.mjs --json   # 機械可読出力
//
// 終了コード: 0=NORMAL, 1=WARNING, 2=CRITICAL, 3=スクリプト自体のエラー
//
// crontabへの組み込みは本Phaseでは行わない（docs/operations/production-monitoring.md
// に手順を記載し、導入判断はユーザーに委ねる）。
// ═════════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

const JSON_OUTPUT = process.argv.includes('--json')

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
const LOCAL_URL = 'http://127.0.0.1:3000'
const PM2_LOG_DIR = `${process.env.HOME ?? '/home/veritysite'}/.pm2/logs`
const OUT_LOG = `${PM2_LOG_DIR}/verity-out-0.log`
const ERROR_LOG = `${PM2_LOG_DIR}/verity-error-0.log`
const PM2_BIN = process.env.PM2_BIN ?? 'pm2' // VPSではnodebrewパスをPATHへ通した上で実行する想定

// ── 閾値（2026-09-05実測に基づく。docs/operations/production-monitoring.md参照）──
// 正常: CPU 5-20%, memory 150-300MB。インシデント時: CPU 60-100%, memory ~1.7GB
// (max_memory_restart=1800M)。
const THRESHOLDS = {
  cpuWarn:      30,     // %
  cpuCrit:      60,     // %
  memWarnMB:    800,    // max_memory_restart(1800M)まで十分な余裕を残す
  memCritMB:    1400,
  latencyWarnMs: 5000,  // 正常時の実測は概ね2.5-4s
  latencyCritMs: 15000, // インシデント時は20秒超timeout
  restartDelta:  1,     // このスクリプトの前回実行からの増分(将来cron定点観測用。単発実行時は参考値)
}

function log(...args) { if (!JSON_OUTPUT) console.log(...args) }

// ── HTTPプローブ ──────────────────────────────────────────────────────────────
async function probe(url, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const started = Date.now()
  try {
    const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
    return { url, ok: true, status: res.status, ms: Date.now() - started }
  } catch (err) {
    return { url, ok: false, status: null, ms: Date.now() - started, error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

function classifyHttp(result) {
  if (!result.ok) return 'CRITICAL' // timeout / network error
  if (result.status >= 500) return 'CRITICAL'
  if (result.status >= 400) return 'WARNING' // 4xxは通常想定外(age-gate等のredirectは3xxで正常)
  if (result.ms >= THRESHOLDS.latencyCritMs) return 'CRITICAL'
  if (result.ms >= THRESHOLDS.latencyWarnMs) return 'WARNING'
  return 'NORMAL'
}

// ── PM2 ──────────────────────────────────────────────────────────────────────
function readPm2Status() {
  try {
    const raw = execFileSync(PM2_BIN, ['jlist'], { encoding: 'utf8', timeout: 10000 })
    const list = JSON.parse(raw)
    const proc = list.find((p) => p.name === 'verity')
    if (!proc) return { available: false, reason: 'process "verity" not found in pm2 jlist' }
    return {
      available: true,
      status:    proc.pm2_env?.status ?? 'unknown',
      restarts:  proc.pm2_env?.restart_time ?? null,
      memMB:     proc.monit?.memory != null ? proc.monit.memory / 1024 / 1024 : null,
      cpu:       proc.monit?.cpu ?? null,
      uptimeMin: proc.pm2_env?.pm_uptime != null ? Math.round((Date.now() - proc.pm2_env.pm_uptime) / 60000) : null,
    }
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) }
  }
}

function classifyPm2(pm2) {
  if (!pm2.available) return { status: 'UNKNOWN', reason: pm2.reason }
  if (pm2.status !== 'online') return { status: 'CRITICAL', reason: `pm2 status = ${pm2.status}` }
  let level = 'NORMAL'
  if (pm2.memMB != null) {
    if (pm2.memMB >= THRESHOLDS.memCritMB) level = 'CRITICAL'
    else if (pm2.memMB >= THRESHOLDS.memWarnMB) level = 'WARNING'
  }
  if (pm2.cpu != null) {
    if (pm2.cpu >= THRESHOLDS.cpuCrit) level = 'CRITICAL'
    else if (pm2.cpu >= THRESHOLDS.cpuWarn && level === 'NORMAL') level = 'WARNING'
  }
  return { status: level }
}

// ── ログ監視 ──────────────────────────────────────────────────────────────────
// 重要(Phase3.2.6の教訓 + 本Phaseでの追加確認): HTTP 5xxはproduction実行では
// アクセスログ行(next dev特有の"GET /path 200 in Xms"形式)が存在しないため
// grepで検出できない。5xxは上のHTTPプローブ(実測ステータスコード)でのみ判定する。
// またconsole.error()はstdoutではなくstderrへ出るため、Node/PM2は自動的に
// verity-error-0.log へ分離する。本Phase監査で判明: 過去のPhase 3.2.x完了報告で
// 集計していた「[profile]等のエラーログ件数」はverity-out-0.log(stdout)のみを
// grepしており、実際のconsole.error出力(verity-error-0.log)を見ていなかった
// ため常に過小(0)報告になっていた可能性がある。本スクリプトは両方を見る。
const ERROR_PATTERNS = {
  authUnavailable:   /\[auth-unavailable\]|\[proxy\] auth check unavailable/,
  statementTimeout:  /canceling statement due to statement timeout/,
  supabaseTimeout:   /\[supabase-timeout\]|Supabase fetch timed out/,
  sectionFallback:   /\[works-ranking\]|\[same-actress-works\]|\[related-works-scored\]|\[related-articles-section\]|\[positioning-block\]|\[profile\]/,
  dynamicServerError: /DynamicServerError/,
  unhandledRejection: /UnhandledPromiseRejection|unhandledRejection/i,
}

function tailLines(filePath, maxLines) {
  try {
    const stat = fs.statSync(filePath)
    // 大きいログの全読みを避ける: 末尾の一定バイト数だけ読む(粗いが十分)
    const readBytes = Math.min(stat.size, 2 * 1024 * 1024) // 2MB
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(readBytes)
    fs.readSync(fd, buf, 0, readBytes, stat.size - readBytes)
    fs.closeSync(fd)
    const lines = buf.toString('utf8').split('\n')
    return lines.slice(-maxLines)
  } catch (err) {
    return null
  }
}

function scanErrorLog(maxLines = 5000) {
  const lines = tailLines(ERROR_LOG, maxLines)
  if (lines === null) return { available: false }
  const counts = {}
  for (const key of Object.keys(ERROR_PATTERNS)) counts[key] = 0
  for (const line of lines) {
    for (const [key, pattern] of Object.entries(ERROR_PATTERNS)) {
      if (pattern.test(line)) counts[key]++
    }
  }
  return { available: true, linesScanned: lines.length, counts }
}

function classifyErrorLog(scan) {
  if (!scan.available) return { status: 'UNKNOWN' }
  const { counts } = scan
  // statement timeout / auth unavailable の頻発はDB/Auth基盤劣化の直接signal
  if (counts.statementTimeout > 10 || counts.authUnavailable > 10 || counts.unhandledRejection > 0 || counts.dynamicServerError > 0) {
    return { status: 'CRITICAL' }
  }
  if (counts.statementTimeout > 0 || counts.authUnavailable > 0 || counts.sectionFallback > 5) {
    return { status: 'WARNING' }
  }
  return { status: 'NORMAL' }
}

const LEVEL_ORDER = { NORMAL: 0, UNKNOWN: 0, WARNING: 1, CRITICAL: 2 }
function worse(a, b) { return LEVEL_ORDER[a] >= LEVEL_ORDER[b] ? a : b }

async function main() {
  const result = { generatedAt: new Date().toISOString(), checks: {}, overall: 'NORMAL' }

  // 1. 外形HTTP(external)
  const externalTargets = [`${SITE_URL}/`, `${SITE_URL}/verity`, `${SITE_URL}/api/health`]
  const externalProbes = await Promise.all(externalTargets.map((u) => probe(u)))
  result.checks.externalHttp = externalProbes.map((p) => ({ ...p, level: classifyHttp(p) }))

  // 2. localhost HTTP(VPS上でのみ意味を持つ。到達不可なら単にUNKNOWNにする)
  const localProbes = await Promise.all([probe(`${LOCAL_URL}/verity`), probe(`${LOCAL_URL}/api/health`)])
  const localReachable = localProbes.some((p) => p.ok)
  result.checks.localHttp = localReachable
    ? localProbes.map((p) => ({ ...p, level: classifyHttp(p) }))
    : { note: 'localhost:3000 unreachable — probably not running on the VPS itself', level: 'UNKNOWN' }

  // 3. PM2
  const pm2 = readPm2Status()
  result.checks.pm2 = { ...pm2, ...classifyPm2(pm2) }

  // 4. エラーログ (stdout + stderr 両方)
  const errScan = scanErrorLog()
  result.checks.errorLog = { ...errScan, ...classifyErrorLog(errScan) }
  // out-0.log は[proxy]/[middleware]の生ログ量が多いだけで、console.errorはstderrにしか出ない
  // ため、追加のsignalとしては「out-0.logが全く増えていない」＝プロセスが応答していない
  // 可能性の補助signalにのみ使う(今回は簡易化のため件数のみ参考記録)。
  const outLines = tailLines(OUT_LOG, 200)
  result.checks.outLogReachable = outLines !== null

  // ── 総合判定 ──────────────────────────────────────────────────────────────
  let overall = 'NORMAL'
  for (const p of result.checks.externalHttp) overall = worse(overall, p.level)
  if (Array.isArray(result.checks.localHttp)) {
    for (const p of result.checks.localHttp) overall = worse(overall, p.level)
  }
  overall = worse(overall, result.checks.pm2.status)
  overall = worse(overall, result.checks.errorLog.status)
  result.overall = overall

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    log('=== VERITY Production Monitor (read-only) ===')
    log('generatedAt:', result.generatedAt)
    log('')
    log('-- External HTTP --')
    for (const p of result.checks.externalHttp) {
      log(`  [${p.level}] ${p.url} -> ${p.ok ? p.status : 'ERROR:' + p.error} (${p.ms}ms)`)
    }
    log('')
    log('-- Local HTTP (VPS only) --')
    if (Array.isArray(result.checks.localHttp)) {
      for (const p of result.checks.localHttp) {
        log(`  [${p.level}] ${p.url} -> ${p.ok ? p.status : 'ERROR:' + p.error} (${p.ms}ms)`)
      }
    } else {
      log('  [UNKNOWN]', result.checks.localHttp.note)
    }
    log('')
    log('-- PM2 --')
    if (result.checks.pm2.available) {
      log(`  [${result.checks.pm2.status}] status=${result.checks.pm2.status === 'CRITICAL' ? pm2.status : 'online'} restarts=${pm2.restarts} mem=${pm2.memMB?.toFixed(1)}MB cpu=${pm2.cpu}% uptime=${pm2.uptimeMin}min`)
    } else {
      log('  [UNKNOWN]', result.checks.pm2.reason)
    }
    log('')
    log('-- Error log (verity-error-0.log tail) --')
    if (result.checks.errorLog.available) {
      log(`  [${result.checks.errorLog.status}] scanned last ${result.checks.errorLog.linesScanned} lines:`, result.checks.errorLog.counts)
    } else {
      log('  [UNKNOWN] error log not reachable from this environment')
    }
    log('')
    log(`=== OVERALL: ${result.overall} ===`)
  }

  process.exit(result.overall === 'CRITICAL' ? 2 : result.overall === 'WARNING' ? 1 : 0)
}

main().catch((err) => {
  console.error('[monitor-production] fatal error:', err)
  process.exit(3)
})
