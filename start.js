#!/usr/bin/env node
'use strict'

/**
 * Next.js Standalone 起動ラッパー
 *
 * 使い方（本番サーバー）:
 *   node start.js
 *
 * このファイルは .next/standalone/server.js の隣にデプロイしてください。
 * サーバーのディレクトリ構造:
 *   /app/
 *     start.js          ← このファイル
 *     server.js         ← .next/standalone/server.js をコピー
 *     node_modules/     ← .next/standalone/node_modules/ をコピー
 *     .next/static/     ← ビルド成果物
 *     public/           ← 静的アセット
 */

const fs   = require('fs')
const path = require('path')

// ── 1. .env ファイルの読み込み ────────────────────────────────────────
// 本番では PM2 ecosystem.config.js か systemd EnvironmentFile= を推奨。
// .env / .env.local が存在する場合のみ読み込み（未設定キーのみ追加）。
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return 0
  let count = 0
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq  = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key && !(key in process.env)) {
      process.env[key] = val
      count++
    }
  }
  return count
}

const rootDir = __dirname
;['.env', '.env.local'].forEach((f) => {
  const n = loadEnvFile(path.join(rootDir, f))
  if (n > 0) console.log(`[start] ${f} loaded (${n} vars)`)
})

// ── 2. 環境変数チェック ───────────────────────────────────────────────
const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
]
const OPTIONAL = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'DMM_API_ID',
  'AFFILIATE_ID',
  'NEXT_PUBLIC_SITE_URL',
  'SYNC_SECRET',
  'CRON_SECRET',
  'X_RAPIDAPI_KEY',
  'X_RAPIDAPI_HOST',
]

console.log('\n[start] ── environment ──────────────────────────────────────')
let abort = false
for (const k of REQUIRED) {
  if (process.env[k]) {
    console.log(`[start]  ✅  ${k}`)
  } else {
    console.error(`[start]  ❌  REQUIRED missing: ${k}`)
    abort = true
  }
}
for (const k of OPTIONAL) {
  const v = process.env[k]
  console.log(`[start]  ${v ? '✅ ' : '⚠️  '} ${k}${v ? '' : '  (not set)'}`)
}

// ── 3. 起動設定 ───────────────────────────────────────────────────────
const PORT     = parseInt(process.env.PORT     || '3000', 10)
const HOSTNAME = process.env.HOSTNAME          || '127.0.0.1'

process.env.PORT     = String(PORT)
process.env.HOSTNAME = HOSTNAME

console.log('[start] ─────────────────────────────────────────────────────')
console.log(`[start]  Listen  : http://${HOSTNAME}:${PORT}`)
console.log(`[start]  Node    : ${process.version}`)
console.log(`[start]  CWD     : ${rootDir}`)
console.log('[start] ─────────────────────────────────────────────────────\n')

if (abort) {
  console.error('[start] Aborting: required environment variables are missing.')
  console.error('[start] Set them in PM2 ecosystem.config.js or systemd EnvironmentFile=')
  process.exit(1)
}

// ── 4. standalone server.js の起動 ───────────────────────────────────
// デプロイ先によって server.js のパスが変わるため 2 か所確認する
const candidates = [
  path.join(rootDir, 'server.js'),                           // /app/server.js
  path.join(rootDir, '.next', 'standalone', 'server.js'),   // ローカル開発時
]

let serverPath = null
for (const p of candidates) {
  if (fs.existsSync(p)) { serverPath = p; break }
}

if (!serverPath) {
  console.error('[start] server.js が見つかりません。以下を確認してください:')
  candidates.forEach((p) => console.error(`[start]   ${p}`))
  console.error('[start] npm run build を実行後にデプロイしてください。')
  process.exit(1)
}

console.log(`[start] Loading: ${serverPath}`)
require(serverPath)
