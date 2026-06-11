#!/usr/bin/env node
/**
 * scripts/test-sns-api.mjs
 *
 * RapidAPI twitter241 の生存確認 + VPS への強制同期トリガー
 *
 * 使い方:
 *   node scripts/test-sns-api.mjs            # API疎通確認のみ
 *   node scripts/test-sns-api.mjs --sync     # 確認後にVPSの同期エンドポイントも叩く
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { apps } = require('../ecosystem.config.js')
const env = apps[0].env

const RAPIDAPI_KEY  = env.X_RAPIDAPI_KEY
const RAPIDAPI_HOST = env.X_RAPIDAPI_HOST
const CRON_SECRET   = env.CRON_SECRET
const SITE_URL      = env.NEXT_PUBLIC_SITE_URL

const TEST_ACTRESS = 'saika_kawakita'   // 河北彩花（確実に存在するアカウント）

// ─── Step 1: API 疎通確認 ─────────────────────────────────────────────────────
console.log('\n═══ VERITY SNS API 生存確認 ═══')
console.log(`RapidAPI Host : ${RAPIDAPI_HOST}`)
console.log(`API Key (先頭8) : ${RAPIDAPI_KEY?.slice(0, 8)}...`)
console.log(`Test Actress  : @${TEST_ACTRESS}\n`)

async function testApi() {
  const url = `https://${RAPIDAPI_HOST}/user?username=${TEST_ACTRESS}`

  console.log('[1/3] User ID 解決テスト...')
  let userId = null
  try {
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key':  RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    })
    const body = await res.text()
    console.log(`      HTTP ${res.status}`)

    if (res.status === 403 && body.includes('not subscribed')) {
      console.error('      ❌ SUBSCRIPTION DEAD: "You are not subscribed to this API."')
      console.error('      → RapidAPI ダッシュボードで twitter241 のサブスクリプションを確認してください')
      return false
    }
    if (res.status === 429) {
      console.error('      ❌ RATE LIMITED (429): 一時的な制限。数分後に再試行してください')
      return false
    }
    if (!res.ok) {
      console.error(`      ❌ HTTP ${res.status}: ${body.slice(0, 200)}`)
      return false
    }

    let json
    try { json = JSON.parse(body) } catch { console.error('      ❌ Non-JSON response'); return false }

    // rest_id を掘り出す（複数の response shape に対応）
    const confirmed = json?.result?.data?.user?.result?.rest_id
                   ?? json?.data?.user?.result?.rest_id
                   ?? json?.result?.rest_id
                   ?? json?.rest_id
    if (!confirmed) {
      console.error(`      ❌ rest_id 不明 — keys: [${Object.keys(json).join(', ')}]`)
      console.error(`      body: ${JSON.stringify(json).slice(0, 300)}`)
      return false
    }
    userId = confirmed
    console.log(`      ✅ User ID 取得: ${userId}\n`)
  } catch (err) {
    console.error(`      ❌ ネットワークエラー: ${err.message}`)
    return false
  }

  console.log('[2/3] メディア取得テスト...')
  try {
    const mediaUrl = `https://${RAPIDAPI_HOST}/user-media?user=${userId}&count=10`
    const res2 = await fetch(mediaUrl, {
      headers: {
        'x-rapidapi-key':  RAPIDAPI_KEY,
        'x-rapidapi-host': RAPIDAPI_HOST,
      },
    })
    const body2 = await res2.text()
    console.log(`      HTTP ${res2.status}`)

    if (res2.status === 429) {
      console.error('      ❌ RATE LIMITED (429) on media endpoint')
      return false
    }
    if (!res2.ok) {
      console.error(`      ❌ HTTP ${res2.status}: ${body2.slice(0, 200)}`)
      return false
    }
    const j2 = JSON.parse(body2)
    const instr = j2?.data?.user?.result?.timeline_v2?.timeline?.instructions
               ?? j2?.result?.timeline?.instructions
               ?? []
    const entries = instr.flatMap(i => i?.entries ?? []).filter(e => String(e.entryId ?? '').startsWith('tweet-'))
    console.log(`      ✅ メディアエントリ ${entries.length} 件取得\n`)
  } catch (err) {
    console.error(`      ❌ メディア取得エラー: ${err.message}`)
    return false
  }

  return true
}

async function triggerSync() {
  console.log('[3/3] VPS 同期エンドポイント強制トリガー...')
  const syncUrl = `${SITE_URL}/verity/api/revalidate-sns`
  console.log(`      URL: ${syncUrl}`)
  try {
    const res = await fetch(syncUrl, {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    })
    const body = await res.json().catch(() => ({}))
    console.log(`      HTTP ${res.status} —`, JSON.stringify(body))
    if (res.ok) {
      console.log('      ✅ 同期リクエスト送信完了（バックグラウンドで処理中）')
      console.log('      → 1〜3分後に Supabase social_feeds テーブルを確認してください\n')
    } else {
      console.error('      ❌ 同期リクエスト失敗')
    }
  } catch (err) {
    console.error(`      ❌ ネットワークエラー: ${err.message}`)
  }
}

const apiOk = await testApi()

if (!apiOk) {
  console.log('\n══════════════════════════════════════════')
  console.log('⚠️  API 疎通確認NG — 同期は実行されませんでした')
  console.log('   RapidAPI ダッシュボードでサブスクリプションを確認・再開してください')
  console.log('   https://rapidapi.com/hub')
  console.log('══════════════════════════════════════════\n')
  process.exit(1)
}

if (process.argv.includes('--sync')) {
  await triggerSync()
} else {
  console.log('[3/3] API 疎通確認 ✅ 完了')
  console.log('      同期を実行する場合: node scripts/test-sns-api.mjs --sync\n')
}

console.log('══════════════════════════════════════════\n')
