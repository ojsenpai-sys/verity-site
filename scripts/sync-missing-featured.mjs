/**
 * FEATURED_CIDS のうち DB 未登録の12件を DMM API から取得して articles テーブルへ UPSERT する。
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

// ── .env.local を読み込む ─────────────────────────────────────────────────────
function loadEnv(filePath) {
  try {
    const text = readFileSync(filePath, 'utf-8')
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch { /* ファイルなければ環境変数を使う */ }
}
loadEnv('.env.local')
loadEnv('.env')

const DMM_API_ID    = process.env.DMM_API_ID
const AFFILIATE_ID  = process.env.AFFILIATE_ID
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!DMM_API_ID || !AFFILIATE_ID || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('必要な環境変数が不足しています')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ── 対象CIDリスト（DB未登録の12件）────────────────────────────────────────────
const MISSING_CIDS = [
  'snos00303', // 川越にこ
  'snos00245', // 博多彩葉
  'ipzz00870', // 篠崎沙帆
  'snos00258', // 瀬戸環奈
  'ipzz00879', // 山田鈴奈
  'snos00269', // 金松季歩
  'ipzz00895', // 堀北桃愛
  'snos00314', // 田野憂
  'ipzz00893', // 白石るな
  'ipzz00876', // 三澄寧々
  'ipzz00886', // さくらわかな
  'ipzz00898', // 藤咲まい
]

// ── CID → 製品番号（leading zeros 除去）────────────────────────────────────────
function cidToProductNumber(cid) {
  const m = cid.match(/^(.*?)(\d+)$/)
  return m ? `${m[1].toUpperCase()}-${parseInt(m[2], 10)}` : cid.toUpperCase()
}

// ── DMM ItemList API 呼び出し ──────────────────────────────────────────────────
async function fetchDmmItems({ keyword, cid, service = 'digital', floor = 'videoa' }) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service,
    floor,
    hits:         '20',
    output:       'json',
    sort:         'date',
  })
  if (keyword) qs.set('keyword', keyword)
  if (cid)     qs.set('cid', cid)

  const url = `https://api.dmm.com/affiliate/v3/ItemList?${qs}`
  const safePrint = url.replace(DMM_API_ID, '***').replace(AFFILIATE_ID, '***')
  console.log(`  GET ${safePrint}`)

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    const text = await res.text()
    console.warn(`  HTTP ${res.status}: ${text.slice(0, 200)}`)
    return []
  }
  const json = await res.json()
  return json.result?.items ?? []
}

// ── normalizeDmmItem (dmm.ts と同ロジック) ────────────────────────────────────
function buildSlug(title, contentId) {
  // 簡易スラッグ生成（本番の buildSlug と同等にする必要はない - 後でsyncが上書きする）
  return contentId
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
    fetched_at:   new Date().toISOString(),
    metadata: {
      floor,
      product_id:    item.product_id,
      number:        item.number     ?? null,
      volume:        item.volume     ?? null,
      url:           item.URL,
      affiliate_url: item.affiliateURL,
      sample_movie_url: item.sampleMovieURL?.size_720_480
                        ?? item.sampleMovieURL?.size_644_414
                        ?? item.sampleMovieURL?.size_560_360
                        ?? item.sampleMovieURL?.size_476_306
                        ?? null,
      price:      item.prices?.price      ?? null,
      list_price: item.prices?.list_price ?? null,
      review:     item.review             ?? null,
      actress:    item.iteminfo?.actress  ?? [],
      maker:      item.iteminfo?.maker    ?? [],
      label:      item.iteminfo?.label    ?? [],
      series:     item.iteminfo?.series   ?? [],
      director:   item.iteminfo?.director ?? [],
    },
  }
}

// ── 1 CID を取得（digital → mono の順でフォールバック）────────────────────────
async function fetchOneCid(cid) {
  const keyword = cidToProductNumber(cid)
  console.log(`\n[${cid}] 検索キーワード: ${keyword}`)

  // ① digital/videoa をキーワード検索
  const dItems = await fetchDmmItems({ keyword, service: 'digital', floor: 'videoa' })
  const dHit = dItems.find(i => i.content_id === cid)
  if (dHit) {
    console.log(`  ✓ digital hit: ${dHit.title.slice(0, 50)}`)
    return normalizeDmmItem(dHit, 'videoa')
  }

  // ② mono/dvd をキーワード検索
  const mItems = await fetchDmmItems({ keyword, service: 'mono', floor: 'dvd' })
  const mHit = mItems.find(i => i.content_id === cid)
  if (mHit) {
    console.log(`  ✓ mono hit: ${mHit.title.slice(0, 50)}`)
    return normalizeDmmItem(mHit, 'dvd')
  }

  // ③ digital/videoa を cid パラメータで直接検索
  const dCidItems = await fetchDmmItems({ cid, service: 'digital', floor: 'videoa' })
  const dCidHit = dCidItems.find(i => i.content_id === cid)
  if (dCidHit) {
    console.log(`  ✓ digital/cid hit: ${dCidHit.title.slice(0, 50)}`)
    return normalizeDmmItem(dCidHit, 'videoa')
  }

  console.warn(`  ✗ 取得できませんでした (cid=${cid})`)
  return null
}

// ── メイン ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n=== FEATURED_CIDS 未登録12件 同期スクリプト ===`)
  console.log(`対象: ${MISSING_CIDS.join(', ')}\n`)

  const records = []

  for (const cid of MISSING_CIDS) {
    const record = await fetchOneCid(cid)
    if (record) records.push(record)
    // DMM API のレートリミット対策
    await new Promise(r => setTimeout(r, 400))
  }

  console.log(`\n取得成功: ${records.length}/${MISSING_CIDS.length} 件`)

  if (records.length === 0) {
    console.error('取得できた件数が0件です。処理を終了します。')
    process.exit(1)
  }

  // ── Supabase に UPSERT ────────────────────────────────────────────────────
  console.log('\nSupabase に UPSERT 中...')
  const { error } = await supabase
    .from('articles')
    .upsert(records, { onConflict: 'external_id' })

  if (error) {
    console.error('UPSERT エラー:', error.message)
    process.exit(1)
  }

  console.log(`\n✅ ${records.length} 件を articles テーブルへ UPSERT 完了`)

  // ── 結果確認 ──────────────────────────────────────────────────────────────
  const { data: check } = await supabase
    .from('articles')
    .select('external_id, title')
    .in('external_id', MISSING_CIDS)

  console.log(`\n📊 DB 確認 (${check?.length ?? 0}/${MISSING_CIDS.length} 件):`)
  for (const row of check ?? []) {
    console.log(`  ✓ ${row.external_id}: ${row.title.slice(0, 50)}`)
  }

  const stillMissing = MISSING_CIDS.filter(cid => !check?.find(r => r.external_id === cid))
  if (stillMissing.length > 0) {
    console.warn(`\n⚠ DMM API から取得できなかった CID (${stillMissing.length}件):`)
    for (const cid of stillMissing) console.warn(`  - ${cid}`)
  } else {
    console.log('\n🎉 全12件の登録が確認できました')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
