/**
 * 博多彩葉 snos00172 UPSERT スクリプト
 * - articles テーブルへ作品データを保存
 * - actresses テーブルへ女優レコードを保存（external_id, image_url, metadata.latest_cid）
 * Usage: node scripts/upsert-hakata-iroha.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import https from 'node:https'

// .env.local を手動パース（dotenv 不要）
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DMM_API_ID   = process.env.DMM_API_ID
const AFFILIATE_ID = process.env.AFFILIATE_ID

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase env vars missing'); process.exit(1) }
if (!DMM_API_ID   || !AFFILIATE_ID) { console.error('DMM env vars missing');      process.exit(1) }

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((ok, ng) => {
    https.get(url, { rejectUnauthorized: false }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => ok({ status: res.statusCode, text: d }))
    }).on('error', ng)
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cidToProductNumber(cid) {
  const m = cid.match(/^(.*?)(\d+)$/)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : cid.toUpperCase()
}

function buildSlug(title, contentId) {
  return title.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60) + '-' + contentId
}

function normalizeDmmItem(item, floor = 'videoa') {
  const genres    = item.iteminfo?.genre?.map(g => g.name)   ?? []
  const actresses = item.iteminfo?.actress?.map(a => a.name) ?? []
  const tags      = [...actresses, ...genres]
  const makerName  = item.iteminfo?.maker?.[0]?.name  ?? ''
  const labelName  = item.iteminfo?.label?.[0]?.name  ?? ''
  const seriesName = item.iteminfo?.series?.[0]?.name ?? ''
  const summary = [
    actresses.length ? actresses.join('・') : null,
    makerName  || null,
    labelName  || null,
    seriesName ? `シリーズ: ${seriesName}` : null,
  ].filter(Boolean).join(' / ') || null
  const publishedAt = item.date
    ? new Date(item.date.replace(/\//g, '-').replace(' ', 'T') + '+09:00').toISOString()
    : null
  return {
    external_id:  item.content_id,
    title:        item.title,
    slug:         buildSlug(item.title, item.content_id),
    source:       'dmm',
    category:     item.iteminfo?.genre?.[0]?.name ?? null,
    tags:         tags.length > 0 ? tags : null,
    summary,
    content:      null,
    image_url:    item.imageURL?.large ?? item.imageURL?.small ?? null,
    published_at: publishedAt,
    is_active:    true,
    metadata: {
      floor,
      product_id:       item.product_id,
      number:           item.number     ?? null,
      volume:           item.volume     ?? null,
      url:              item.URL,
      affiliate_url:    item.affiliateURL,
      sample_movie_url: item.sampleMovieURL?.size_720_480
                        ?? item.sampleMovieURL?.size_644_414
                        ?? item.sampleMovieURL?.size_560_360
                        ?? item.sampleMovieURL?.size_476_306
                        ?? null,
      price:            item.prices?.price      ?? null,
      list_price:       item.prices?.list_price ?? null,
      review:           item.review             ?? null,
      actress:          item.iteminfo?.actress  ?? [],
      maker:            item.iteminfo?.maker    ?? [],
      label:            item.iteminfo?.label    ?? [],
      series:           item.iteminfo?.series   ?? [],
      director:         item.iteminfo?.director ?? [],
    },
  }
}

async function fetchDmmItems(params) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service:      params.service ?? 'digital',
    floor:        params.floor   ?? 'videoa',
    hits:         String(params.hits   ?? 10),
    offset:       String(params.offset ?? 1),
    sort:         params.sort    ?? 'date',
    output:       'json',
  })
  if (params.keyword) qs.set('keyword', params.keyword)
  const safeQs = new URLSearchParams(qs)
  safeQs.set('api_id', '***'); safeQs.set('affiliate_id', '***')
  console.log(`  [dmm] GET https://api.dmm.com/affiliate/v3/ItemList?${safeQs}`)
  const { status, text } = await httpsGet(`https://api.dmm.com/affiliate/v3/ItemList?${qs}`)
  if (status !== 200) throw new Error(`HTTP ${status}: ${text.slice(0, 200)}`)
  const j = JSON.parse(text)
  if (j.result?.status !== 200) throw new Error(`API ${j.result?.status}: ${j.result?.message}`)
  return j.result?.items ?? []
}

async function fetchActressImage(dmmId) {
  const qs = new URLSearchParams({
    api_id: DMM_API_ID, affiliate_id: AFFILIATE_ID,
    site: 'FANZA', output: 'json', hits: '1', actress_id: String(dmmId),
  })
  try {
    const { status, text } = await httpsGet(`https://api.dmm.com/affiliate/v3/ActressSearch?${qs}`)
    if (status !== 200) return null
    const j = JSON.parse(text)
    if (j.result?.status !== 200 || !j.result?.items?.length) return null
    const i = j.result.items[0]
    return i.imageURL?.large ?? i.imageURL?.small ?? null
  } catch { return null }
}

async function sbUpsert(table, records, conflictCol = 'external_id') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictCol}`, {
    method:  'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(records),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} -> ${res.status}: ${text.slice(0, 300)}`)
  console.log(`  [sb] UPSERT ${table}: ${Array.isArray(records) ? records.length : 1}件 -> OK`)
}

// metadata だけを上書きする PATCH（external_id 一致）
async function sbPatchMetadata(table, externalId, metadataPatch) {
  // 現在の metadata を取得してマージ
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?external_id=eq.${encodeURIComponent(externalId)}&select=metadata`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' } }
  )
  const rows = await getRes.json()
  const prevMeta = rows?.[0]?.metadata ?? {}
  const merged = { ...prevMeta, ...metadataPatch }

  const patchRes = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?external_id=eq.${encodeURIComponent(externalId)}`,
    {
      method:  'PATCH',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({ metadata: merged }),
    }
  )
  if (!patchRes.ok) {
    const t = await patchRes.text()
    throw new Error(`PATCH ${table} metadata -> ${patchRes.status}: ${t.slice(0, 300)}`)
  }
  console.log(`  [sb] PATCH ${table} metadata (external_id=${externalId}): OK`)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const CID     = 'snos00172'
const keyword = cidToProductNumber(CID)   // "SNOS-00172"

console.log('=== 博多彩葉 snos00172 UPSERT ===')
console.log(`Supabase: ${SUPABASE_URL?.replace(/https?:\/\//, '').split('.')[0]}***.supabase.co`)
console.log(`keyword : ${keyword}`)

// 既存チェック
const existRes = await fetch(
  `${SUPABASE_URL}/rest/v1/articles?external_id=eq.${CID}&select=external_id,title,published_at`,
  { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Accept': 'application/json' } }
)
const existing = await existRes.json()
if (existing?.length > 0) {
  console.log(`\nDB既存: "${existing[0].title?.slice(0, 60)}"`)
  console.log(`発売日 : ${existing[0].published_at}`)
  console.log('→ 最新情報で上書きUPSERT')
} else {
  console.log('\n→ DB未収録 — 新規INSERT')
}

// DMM API から digital/mono 両方取得
const [dRes, mRes] = await Promise.allSettled([
  fetchDmmItems({ keyword, hits: 10, service: 'digital', floor: 'videoa' }),
  fetchDmmItems({ keyword, hits: 10, service: 'mono',    floor: 'dvd'    }),
])

const dItems = (dRes.status === 'fulfilled' ? dRes.value : []).filter(i => i.content_id === CID)
const mItems = (mRes.status === 'fulfilled' ? mRes.value : []).filter(i => i.content_id === CID)

if (dRes.status === 'rejected') console.log(`digital検索エラー: ${dRes.reason?.message}`)
if (mRes.status === 'rejected') console.log(`mono検索エラー:    ${mRes.reason?.message}`)

console.log(`\ndigital hits: ${dRes.status === 'fulfilled' ? dRes.value.length : 'err'} (exact: ${dItems.length})`)
console.log(`mono hits:    ${mRes.status === 'fulfilled' ? mRes.value.length : 'err'} (exact: ${mItems.length})`)

const best = dItems.find(i => i.sampleMovieURL) ?? mItems.find(i => i.sampleMovieURL)
           ?? dItems[0] ?? mItems[0] ?? null

if (!best) {
  // DMM API 未収録（先行配信直後で API 反映遅れの可能性）→ スタブ記事のみ保存
  console.warn('\n⚠  DMM API に snos00172 がまだ存在しません（先行配信直後のAPI遅延の可能性）')
  console.log('→ 女優レコードのみ最小スタブで保存します')

  // actresses だけでも保存（name で検索するためレコードが必要）
  const actressStub = {
    external_id: 'snos-actress-hakata-iroha',   // DMM ID 判明後に正規 external_id へ移行
    name:        '博多彩葉',
    ruby:        null,
    image_url:   null,
    is_active:   true,
    metadata:    { latest_cid: CID, note: 'stub — DMM API 反映待ち' },
  }
  await sbUpsert('actresses', [actressStub])
  console.log('✓ actresses スタブ UPSERT完了: 博多彩葉')
  console.log('\n=== UPSERT SUCCESS (stub) ===')
  console.log('NOTE: 次回 syncAllSources 実行時に正規 external_id・image_url が補完されます')
  process.exit(0)
}

const bestFloor = mItems.includes(best) ? 'dvd' : 'videoa'
console.log(`\nタイトル : ${best.title}`)
console.log(`発売日   : ${best.date}`)
console.log(`floor    : ${bestFloor}`)
console.log(`出演女優 : ${(best.iteminfo?.actress ?? []).map(a => `${a.name}(id=${a.id})`).join(', ')}`)
console.log(`image_url: ${best.imageURL?.large ?? best.imageURL?.small ?? 'null'}`)

// ── Step 1: articles UPSERT ──────────────────────────────────────────────────
const articleRecord = normalizeDmmItem(best, bestFloor)
await sbUpsert('articles', [articleRecord])
console.log(`✓ articles UPSERT完了: ${CID}`)

// ── Step 2: actresses UPSERT + metadata.latest_cid ───────────────────────────
const actressItems = best.iteminfo?.actress ?? []
if (actressItems.length === 0) {
  console.warn('⚠  女優情報なし — actresses UPSERT をスキップ')
} else {
  for (const a of actressItems) {
    console.log(`\n  女優: ${a.name} (DMM ID=${a.id})`)
    const imgUrl = await fetchActressImage(a.id)
    console.log(`  image_url: ${imgUrl ?? 'null (API未登録 or 非公開)'}`)

    const extId = `dmm-actress-${a.id}`
    const actressRecord = {
      external_id: extId,
      name:        a.name,
      ruby:        a.ruby ?? null,
      image_url:   imgUrl,
      is_active:   true,
      // metadata.latest_cid を CID にピン留め（restorePinnedActressLatestCids と同じ効果）
      metadata:    { dmm_id: a.id, latest_cid: CID },
    }
    await sbUpsert('actresses', [actressRecord])
    console.log(`✓ actresses UPSERT完了: ${a.name} (external_id=${extId})`)
  }
}

console.log('\n=== UPSERT SUCCESS ===')
console.log(`  CID     : ${CID}`)
console.log(`  actress : ${actressItems.map(a => a.name).join(', ')}`)
console.log(`  floor   : ${bestFloor}`)
console.log(`  latest_cid が snos00172 にピン留めされました`)
console.log('  次回 syncAllSources でも restorePinnedActressLatestCids() が自動復元します')
