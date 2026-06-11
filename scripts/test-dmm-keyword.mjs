#!/usr/bin/env node
/**
 * scripts/test-dmm-keyword.mjs
 *
 * DMM ItemList keyword パラメータのデバッグスクリプト
 * keyword あり/なし、sort の組み合わせで 400 の再現条件を特定する。
 *
 * 使い方:
 *   node scripts/test-dmm-keyword.mjs
 */

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { apps } = require('../ecosystem.config.js')
const env = apps[0].env

const API_ID       = env.DMM_API_ID
const AFFILIATE_ID = env.AFFILIATE_ID
const BASE         = 'https://api.dmm.com/affiliate/v3/ItemList'

const TESTS = [
  {
    label: '① keyword なし / sort=date (基準：前回200 OK)',
    params: { sort: 'date' },
  },
  {
    label: '② keyword=IPZZ-00852 / sort=date (パイプラインと同じ)',
    params: { sort: 'date', keyword: 'IPZZ-00852' },
  },
  {
    label: '③ keyword=IPZZ-00852 / sort 省略',
    params: { keyword: 'IPZZ-00852' },
  },
  {
    label: '④ keyword=IPZZ-00852 / sort=match',
    params: { sort: 'match', keyword: 'IPZZ-00852' },
  },
  {
    label: '⑤ keyword=一般単語(天使) / sort=date',
    params: { sort: 'date', keyword: '天使' },
  },
  {
    label: '⑥ keyword=一般単語(天使) / sort=match',
    params: { sort: 'match', keyword: '天使' },
  },
]

console.log('\n═══ DMM API keyword デバッグ ═══')
console.log(`api_id (先頭8文字): ${API_ID?.slice(0, 8)}...`)
console.log(`affiliate_id       : ${AFFILIATE_ID}`)
console.log(`endpoint           : ${BASE}\n`)

for (const t of TESTS) {
  const base = {
    api_id:       API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service:      'digital',
    floor:        'videoa',
    hits:         '1',
    offset:       '1',
    output:       'json',
  }
  // sort を省略するテストでは除外
  if (t.params.sort !== undefined) base.sort = t.params.sort
  if (t.params.keyword)            base.keyword = t.params.keyword

  const qs  = new URLSearchParams(base)
  const url = `${BASE}?${qs}`

  console.log(`─── ${t.label} ───`)

  try {
    const res  = await fetch(url, { cache: 'no-store' })
    const text = await res.text()
    let body
    try { body = JSON.parse(text) } catch { body = text }

    console.log(`HTTP Status : ${res.status}`)
    if (!res.ok) {
      console.log(`Response    :`, JSON.stringify(body, null, 2).slice(0, 800))
    } else {
      const cnt = body?.result?.result_count ?? body?.result?.total_count ?? '?'
      console.log(`件数        : result_count=${cnt}`)
    }
  } catch (err) {
    console.error(`Network Error: ${err.message}`)
  }
  console.log()

  // DMM レートリミット対策: 1秒待機
  await new Promise(r => setTimeout(r, 1000))
}

console.log('═══ テスト完了 ═══\n')
