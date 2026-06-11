#!/usr/bin/env node
/**
 * scripts/test-dmm-auth.mjs
 *
 * DMM Affiliate API v3 認証デバッグスクリプト
 * affiliate_id の 3 パターンを実際に送信し、生レスポンスを比較する。
 *
 * 使い方:
 *   node scripts/test-dmm-auth.mjs
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { apps } = require('../ecosystem.config.js')
const env = apps[0].env

const API_ID  = env.DMM_API_ID
const SITE    = 'FANZA'
const BASE    = 'https://api.dmm.com/affiliate/v3/ItemList'

const PATTERNS = [
  { label: 'A  (-990 API専用ID)', affiliate_id: 'mizutamari48-990' },
  { label: 'B  (-004 サイト承認ID)', affiliate_id: 'mizutamari48-004' },
  { label: 'C  (-001 存在しないIDで api_id 自体の有効性を分離検証)', affiliate_id: 'mizutamari48-001' },
]

console.log('\n═══ DMM API 認証デバッグ ═══')
console.log(`api_id (先頭8文字): ${API_ID?.slice(0, 8)}...`)
console.log(`endpoint           : ${BASE}\n`)

for (const p of PATTERNS) {
  const qs = new URLSearchParams({
    api_id:       API_ID,
    affiliate_id: p.affiliate_id,
    site:         SITE,
    service:      'digital',
    floor:        'videoa',
    hits:         '1',
    offset:       '1',
    output:       'json',
    sort:         'date',
  })

  const url = `${BASE}?${qs}`
  console.log(`─── パターン ${p.label} ───`)
  console.log(`affiliate_id: ${p.affiliate_id}`)

  try {
    const res  = await fetch(url, { cache: 'no-store' })
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }

    console.log(`HTTP Status : ${res.status}`)
    console.log(`Response    :`, JSON.stringify(body, null, 2).slice(0, 600))
  } catch (err) {
    console.error(`Network Error: ${err.message}`)
  }
  console.log()
}

console.log('═══ テスト完了 ═══\n')
