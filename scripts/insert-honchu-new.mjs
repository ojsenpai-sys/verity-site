/**
 * 本中（HMN）新着5作品を DMM Affiliate API から取得して Supabase へ登録
 * 使い方: node scripts/insert-honchu-new.mjs
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  try {
    for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env.local')
loadEnv('.env')

const DMM_API_ID   = process.env.DMM_API_ID
const AFFILIATE_ID = process.env.AFFILIATE_ID
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DMM_API_ID || !AFFILIATE_ID || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ 環境変数不足: DMM_API_ID / AFFILIATE_ID / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const TARGETS = [
  { cid: 'hmn00890', actress: 'RINOA' },
  { cid: 'hmn00888', actress: '秋山美杏' },
  { cid: 'hmn00883', actress: '鈴の家りん' },
  { cid: 'hmn00880', actress: '五日市芽依' },
  { cid: 'hmn00860', actress: '根尾あかり' },
]

const ITEM_LIST_URL = 'https://api.dmm.com/affiliate/v3/ItemList'

async function fetchByCid(cid) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service:      'digital',
    floor:        'videoa',
    hits:         '10',
    offset:       '1',
    keyword:      cid,
    sort:         'date',
    output:       'json',
  })

  const res = await fetch(`${ITEM_LIST_URL}?${qs}`, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    console.warn(`  HTTP ${res.status}: ${text.slice(0, 200)}`)
    return null
  }
  const json = await res.json()
  if (json.result?.status !== 200) {
    console.warn(`  API error ${json.result?.status}: ${json.result?.message}`)
    return null
  }
  const items = json.result?.items ?? []
  return items.find(item => item.content_id === cid) ?? null
}

function buildSlug(title, cid) {
  const base = (title ?? cid)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return `${base}-${cid}`
}

function normalizeItem(item, cid, actress) {
  const genres    = item?.iteminfo?.genre?.map(g => g.name)   ?? []
  const actresses = item?.iteminfo?.actress?.map(a => a.name) ?? [actress]
  const tags      = [...new Set([...actresses, ...genres, '本中'])]

  const makerName = item?.iteminfo?.maker?.[0]?.name ?? '本中'
  const labelName = item?.iteminfo?.label?.[0]?.name ?? ''
  const summary = [actresses.join('・'), makerName, labelName].filter(Boolean).join(' / ')

  // 発売日は API から取得。なければ本日
  const publishedAt = item?.date
    ? new Date(item.date.replace(/\//g, '-').replace(' ', 'T') + '+09:00').toISOString()
    : new Date('2026-06-16T00:00:00+09:00').toISOString()

  // 画像: API が返すものを優先、なければ CID パターンで生成
  const imageUrl =
    item?.imageURL?.large ??
    item?.imageURL?.small ??
    `https://pics.dmm.co.jp/digital/video/${cid}/${cid}pl.jpg`

  const dmmUrl = item?.URL ?? `https://www.dmm.co.jp/digital/videoa/-/detail/=/cid=${cid}/`
  const affiliateUrl = item?.affiliateURL ?? null

  const title = item?.title ?? `${actress} 最新作（${cid}）`

  return {
    external_id:  cid,
    title,
    slug:         buildSlug(title, cid),
    source:       'dmm',
    category:     'videoa',
    tags,
    summary,
    content:      null,
    image_url:    imageUrl,
    published_at: publishedAt,
    is_active:    true,
    metadata: {
      floor:            'videoa',
      product_id:       item?.product_id ?? null,
      number:           item?.number ?? null,
      url:              dmmUrl,
      affiliate_url:    affiliateUrl,
      sample_movie_url: item?.sampleMovieURL?.size_720_480 ?? null,
      price:            item?.prices?.price ?? null,
      review:           item?.review ?? null,
      actress:          item?.iteminfo?.actress ?? [{ id: '', name: actress }],
      maker:            item?.iteminfo?.maker   ?? [{ id: '5105', name: '本中' }],
      label:            item?.iteminfo?.label   ?? [],
      series:           item?.iteminfo?.series  ?? [],
    },
  }
}

async function main() {
  console.log('🎬 本中 新着5作品 登録バッチ 開始\n')

  const records = []

  for (const { cid, actress } of TARGETS) {
    console.log(`📦 [${cid}] ${actress} …`)
    const item = await fetchByCid(cid)

    if (item) {
      console.log(`  ✅ API取得成功: ${item.title}`)
    } else {
      console.warn(`  ⚠️  API取得失敗 — CIDベースのフォールバックデータで登録`)
    }

    records.push(normalizeItem(item, cid, actress))
    await new Promise(r => setTimeout(r, 400))
  }

  console.log('\n💾 Supabase へ upsert 中 …')
  const { error } = await supabase
    .from('articles')
    .upsert(records, { onConflict: 'external_id', ignoreDuplicates: false })

  if (error) {
    console.error('❌ upsert 失敗:', error.message)
    process.exit(1)
  }

  console.log(`\n✅ ${records.length}件 登録完了`)
  for (const r of records) {
    console.log(`  • ${r.external_id} — ${r.title}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
