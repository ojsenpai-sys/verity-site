/**
 * MINAMO 全作品同期スクリプト（女優 ID: 1069697）
 *
 * DMM Affiliate API v3 の article=actress / article_id=1069697 を使い
 * digital/videoa・digital/vr・mono/dvd の3フロアを全件ページネーション取得して
 * Supabase articles テーブルへ UPSERT する。
 *
 * 使い方: node scripts/sync-minamo-all.mjs
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ── 環境変数読み込み ──────────────────────────────────────────────────────────

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
  console.error('❌ 必要な環境変数が不足: DMM_API_ID / AFFILIATE_ID / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const ACTRESS_ID = '1069697'
const HITS_PER_PAGE = 100
const ITEM_LIST_URL = 'https://api.dmm.com/affiliate/v3/ItemList'

// ── DMM ItemList 呼び出し（1ページ分）────────────────────────────────────────

async function fetchPage({ service, floor, offset }) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service,
    floor,
    hits:         String(HITS_PER_PAGE),
    offset:       String(offset),
    sort:         'date',
    article:      'actress',
    article_id:   ACTRESS_ID,
    output:       'json',
  })

  const url      = `${ITEM_LIST_URL}?${qs}`
  const safeUrl  = url.replace(DMM_API_ID, '***').replace(AFFILIATE_ID, '***')
  console.log(`  GET ${safeUrl}`)

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    console.warn(`  HTTP ${res.status}: ${text.slice(0, 300)}`)
    return { items: [], total: 0 }
  }

  const json = await res.json()
  if (json.result?.status !== 200) {
    console.warn(`  API status ${json.result?.status}: ${json.result?.message}`)
    return { items: [], total: 0 }
  }

  return {
    items: json.result?.items ?? [],
    total: json.result?.total_count ?? 0,
  }
}

// ── 全ページを取得（ページネーション）────────────────────────────────────────

async function fetchAllPages(service, floor) {
  const label = `${service}/${floor}`
  console.log(`\n📦 [${label}] 取得開始 …`)

  const allItems = []
  let offset = 1

  while (true) {
    const { items, total } = await fetchPage({ service, floor, offset })
    if (items.length === 0) break

    allItems.push(...items)
    console.log(`  ${label} offset=${offset}: ${items.length}件取得 (累計 ${allItems.length} / 総数 ${total})`)

    if (allItems.length >= total || items.length < HITS_PER_PAGE) break
    offset += HITS_PER_PAGE
    await new Promise(r => setTimeout(r, 300)) // API レート制限対策
  }

  console.log(`  [${label}] 合計 ${allItems.length}件`)
  return allItems
}

// ── DmmItem → articles レコード変換 ──────────────────────────────────────────

function buildSlug(title, cid) {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  // フルCIDで slug を確実にユニーク化（8文字切り詰めだと衝突する）
  return `${base}-${cid}`
}

function normalizeItem(item, floor) {
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
      price:         item.prices?.price      ?? null,
      list_price:    item.prices?.list_price ?? null,
      review:        item.review             ?? null,
      actress:       item.iteminfo?.actress  ?? [],
      maker:         item.iteminfo?.maker    ?? [],
      label:         item.iteminfo?.label    ?? [],
      series:        item.iteminfo?.series   ?? [],
      director:      item.iteminfo?.director ?? [],
    },
  }
}

// ── Supabase へバッチ upsert ──────────────────────────────────────────────────

async function upsertBatch(records) {
  if (records.length === 0) return { ok: 0, err: 0 }

  // 50件ずつバッチ
  const BATCH = 50
  let ok = 0, err = 0

  for (let i = 0; i < records.length; i += BATCH) {
    const chunk = records.slice(i, i + BATCH)
    const { error } = await supabase
      .from('articles')
      .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: false })

    if (error) {
      console.error(`  ❌ バッチ upsert 失敗: ${error.message}`)
      // フォールバック: 個別 upsert
      for (const rec of chunk) {
        const { error: e2 } = await supabase
          .from('articles')
          .upsert(rec, { onConflict: 'external_id', ignoreDuplicates: false })
        e2 ? err++ : ok++
        if (e2) console.error(`  ❌ ${rec.external_id}: ${e2.message}`)
      }
    } else {
      ok += chunk.length
    }
  }

  return { ok, err }
}

// ── メイン ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('🎬 MINAMO 全作品同期 (actress_id=1069697) 開始\n')

  // 取得対象フロア
  const targets = [
    { service: 'digital', floor: 'videoa' },
    { service: 'digital', floor: 'vr'     },
    { service: 'mono',    floor: 'dvd'    },
  ]

  const allItems = []
  const seenCids = new Set()

  for (const { service, floor } of targets) {
    const items = await fetchAllPages(service, floor)
    for (const item of items) {
      if (!seenCids.has(item.content_id)) {
        seenCids.add(item.content_id)
        allItems.push({ item, floor })
      }
    }
  }

  console.log(`\n✅ 重複除外後 合計: ${allItems.length}件`)

  if (allItems.length === 0) {
    console.log('⚠️  取得件数 0 — DMM_API_ID / AFFILIATE_ID を確認してください')
    process.exit(1)
  }

  // 変換
  const records = allItems.map(({ item, floor }) => normalizeItem(item, floor))

  // upsert
  console.log(`\n📝 Supabase upsert 開始 (${records.length}件) …`)
  const { ok, err } = await upsertBatch(records)
  console.log(`  ✅ 成功: ${ok}件 / ❌ 失敗: ${err}件`)

  // DB 確認
  const { count } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .contains('tags', ['MINAMO'])
  console.log(`\n🗄️  DB の MINAMO 記事総数: ${count}件`)

  console.log('\n🎉 同期完了！')
}

main().catch(e => { console.error(e); process.exit(1) })
