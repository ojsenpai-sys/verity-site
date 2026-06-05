/**
 * 福田ゆあ 画像・latest_cid 修復スクリプト
 *
 * 原因: fix-actress-data.mjs の UPSERT が metadata: { dmm_id } で全上書きし、
 *       metadata.latest_cid が消去された。また image_url も ActressSearch ポートレート
 *       (null の場合あり) に置き換えられた結果、ランキング画像が NowPrinting になった。
 *
 * 修正: 1. articles テーブルの mida00688 から正規パッケージ画像 URL を取得
 *       2. actresses テーブルの 福田ゆあ レコードを診断
 *       3. image_url (pl.jpg) と metadata.latest_cid = 'mida00688' を修復
 *
 * Usage: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fix-fukuda-yua-image.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve }      from 'node:path'

// ── env ───────────────────────────────────────────────────────────────────────
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Supabase env vars missing')
  process.exit(1)
}

// ── Supabase REST helper ───────────────────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept':        'application/json',
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

async function sbPatch(table, filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method:  'PATCH',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`PATCH ${table} -> ${res.status}: ${text.slice(0, 300)}`)
  return JSON.parse(text)
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('=== 福田ゆあ 画像・latest_cid 修復 ===\n')

// 1. articles から mida00688 の package image_url を取得
console.log('--- Step 1: articles.mida00688 診断 ---')
const articles = await sbGet('articles?external_id=eq.mida00688&select=external_id,title,image_url,published_at,metadata')
if (!articles.length) {
  console.error('✗ mida00688 が articles テーブルに存在しません。先に UPSERT してください。')
  process.exit(1)
}
const article = articles[0]
console.log(`title     : ${article.title?.slice(0, 70)}`)
console.log(`image_url : ${article.image_url}`)
console.log(`published : ${article.published_at}`)

// pl.jpg に正規化（ps.jpg → pl.jpg）
const packageImageUrl = article.image_url
  ? article.image_url.replace(/ps\.jpg$/, 'pl.jpg')
  : `https://pics.dmm.co.jp/digital/video/mida00688/mida00688pl.jpg`

console.log(`→ 使用するパッケージ画像 URL: ${packageImageUrl}`)

// 2. actresses テーブルの 福田ゆあ を診断
console.log('\n--- Step 2: actresses.福田ゆあ 現状診断 ---')
const actressRows = await sbGet(
  `actresses?name=eq.%E7%A6%8F%E7%94%B0%E3%82%86%E3%81%82&select=id,external_id,name,image_url,is_active,metadata`
)

if (!actressRows.length) {
  // 名前検索でヒットしない場合、タグ検索で外部IDを探す
  console.log('名前での直接検索でヒットなし。mida00688 の actress タグから ID を逆引き...')
  const articleMeta = article.metadata
  const actressesInMeta = articleMeta?.actress ?? []
  console.log(`作品内の女優: ${JSON.stringify(actressesInMeta)}`)
  if (!actressesInMeta.length) {
    console.error('✗ mida00688 の metadata.actress が空です。手動確認が必要です。')
    process.exit(1)
  }
  const externalIds = actressesInMeta.map(a => `dmm-actress-${a.id}`)
  console.log(`external_id候補: ${externalIds.join(', ')}`)
  const byExtId = await sbGet(
    `actresses?external_id=in.(${externalIds.map(e => encodeURIComponent(e)).join(',')})&select=id,external_id,name,image_url,is_active,metadata`
  )
  console.log(`→ ヒット ${byExtId.length} 件:`)
  byExtId.forEach(a => {
    console.log(`  name=${a.name} ext=${a.external_id} is_active=${a.is_active}`)
    console.log(`  image_url=${a.image_url ?? 'null'}`)
    console.log(`  metadata=${JSON.stringify(a.metadata)}`)
  })
  if (!byExtId.length) {
    console.error('✗ actresses レコードが存在しません。別途 UPSERT が必要です。')
    process.exit(1)
  }
  // 全マッチした女優を修復対象とする（福田ゆあは通常1件）
  actressRows.push(...byExtId)
}

actressRows.forEach(a => {
  console.log(`name      : ${a.name}`)
  console.log(`ext_id    : ${a.external_id}`)
  console.log(`is_active : ${a.is_active}`)
  console.log(`image_url : ${a.image_url ?? 'null ← ⚠️ 空'}`)
  console.log(`metadata  : ${JSON.stringify(a.metadata)}`)
  const hasLatestCid = !!a.metadata?.latest_cid
  console.log(`latest_cid: ${a.metadata?.latest_cid ?? 'null ← ⚠️ 消去済み'}`)
  console.log(`診断: image_url=${a.image_url ? 'OK' : 'MISSING'}, latest_cid=${hasLatestCid ? 'OK' : 'MISSING'}`)
})

// 3. 修復: image_url = pl.jpg, metadata.latest_cid = 'mida00688' をマージ
console.log('\n--- Step 3: 修復 PATCH ---')

for (const actress of actressRows) {
  const mergedMeta = {
    ...(actress.metadata ?? {}),
    latest_cid: 'mida00688',
  }

  console.log(`\n  対象: ${actress.name} (${actress.external_id})`)
  console.log(`  → image_url: ${packageImageUrl}`)
  console.log(`  → metadata: ${JSON.stringify(mergedMeta)}`)

  const patched = await sbPatch(
    'actresses',
    `external_id=eq.${encodeURIComponent(actress.external_id)}`,
    {
      image_url: packageImageUrl,
      metadata:  mergedMeta,
      is_active: true,
    }
  )

  if (patched.length === 0) {
    console.warn(`  ⚠ PATCH response empty (affected 0 rows?) — 手動確認してください`)
  } else {
    console.log(`  ✓ PATCH 完了:`)
    console.log(`    image_url: ${patched[0].image_url}`)
    console.log(`    metadata : ${JSON.stringify(patched[0].metadata)}`)
  }
}

// 4. 最終確認
console.log('\n--- Step 4: 修復後の状態確認 ---')
const finalCheck = await sbGet(
  `actresses?name=eq.%E7%A6%8F%E7%94%B0%E3%82%86%E3%81%82&select=name,external_id,image_url,is_active,metadata`
)
if (!finalCheck.length) {
  // external_id で再確認
  const exId = actressRows[0]?.external_id
  if (exId) {
    const r = await sbGet(`actresses?external_id=eq.${encodeURIComponent(exId)}&select=name,external_id,image_url,is_active,metadata`)
    r.forEach(a => {
      console.log(`name      : ${a.name}`)
      console.log(`image_url : ${a.image_url}`)
      console.log(`latest_cid: ${a.metadata?.latest_cid}`)
      console.log(`is_active : ${a.is_active}`)
    })
  }
} else {
  finalCheck.forEach(a => {
    console.log(`name      : ${a.name}`)
    console.log(`image_url : ${a.image_url}`)
    console.log(`latest_cid: ${a.metadata?.latest_cid}`)
    console.log(`is_active : ${a.is_active}`)
  })
}

console.log('\n=== 完了 ===')
