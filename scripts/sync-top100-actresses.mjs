/**
 * トップ女優100名 全作品一括同期スクリプト
 *
 * VERITYの actresses テーブル monthly_rank 上位100名を対象に、
 * DMM Affiliate API v3 で digital/videoa・digital/vr・mono/dvd の3フロアを
 * 全件ページネーション取得して Supabase articles テーブルへ UPSERT する。
 *
 * 使い方: node scripts/sync-top100-actresses.mjs
 */

// DMM API のTLS証明書チェーン問題を回避（ローカル同期スクリプト専用）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

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

// ── トップ女優100名（monthly_rank 順） ───────────────────────────────────────

const TOP_ACTRESSES = [
  { id: '1069702', name: '天馬ゆい' },
  { id: '1085397', name: '本郷愛' },
  { id: '1082666', name: '天月あず' },
  { id: '1082971', name: '響乃うた' },
  { id: '1099472', name: '瀬戸環奈' },
  { id: '1077723', name: '小湊よつ葉' },
  { id: '1083068', name: '響蓮' },
  { id: '1097983', name: '依本しおり' },
  { id: '1099813', name: '花守夏歩' },
  { id: '29949',   name: '北条麻妃' },
  { id: '1044864', name: '河北彩伽' },
  { id: '1034491', name: '姫川ゆうな' },
  { id: '1092091', name: '金松季歩' },
  { id: '1093791', name: '田野憂' },
  { id: '1049908', name: '渚みつき' },
  { id: '1087625', name: '三田真鈴' },
  { id: '1092466', name: '雫月心桜' },
  { id: '1060018', name: '日向理名' },
  { id: '1063214', name: '七ツ森りり' },
  { id: '1088706', name: '美咲音' },
  { id: '1086581', name: '浅野こころ' },
  { id: '1008965', name: '奥田咲' },
  { id: '1084794', name: '武田もなみ' },
  { id: '1071155', name: '楓ふうあ' },
  { id: '1087426', name: '久和原せいら' },
  { id: '1078009', name: '都月るいさ' },
  { id: '1084920', name: '明日葉みつは' },
  { id: '1073977', name: '宮西ひかる' },
  { id: '1069632', name: 'miru' },
  { id: '1087780', name: '月本海咲' },
  { id: '1087701', name: '兒玉七海' },
  { id: '1088602', name: '逢沢みゆ' },
  { id: '1090090', name: '早坂ひめ' },
  { id: '1094993', name: '虹村ゆみ' },
  { id: '1092997', name: '倉木華' },
  { id: '1075302', name: '柏木こなつ' },
  { id: '1085934', name: '村上悠華' },
  { id: '1093790', name: '小野坂ゆいか' },
  { id: '1091962', name: '渚あいり' },
  { id: '1092427', name: '北岡果林' },
  { id: '1077071', name: '未歩なな' },
  { id: '1064154', name: '月野かすみ' },
  { id: '1092662', name: '白上咲花' },
  { id: '1072805', name: '西元めいさ' },
  { id: '1087872', name: '神楽ももか' },
  { id: '1097822', name: '南日菜乃' },
  { id: '1092578', name: '清宮仁愛' },
  { id: '14754',   name: '長瀬麻美' },
  { id: '1087324', name: '五条恋' },
  { id: '1084111', name: '小日向みゆう' },
  { id: '1064143', name: '沙月恵奈' },
  { id: '1084346', name: '川越にこ' },
  { id: '1060141', name: '木下ひまり' },
  { id: '1096404', name: '乃坂ひより' },
  { id: '1097645', name: '日向由奈' },
  { id: '1075010', name: '宍戸里帆' },
  { id: '1069257', name: 'Nia' },
  { id: '1061586', name: '森日向子' },
  { id: '1054998', name: '松本いちか' },
  { id: '1089064', name: 'あべ藍' },
  { id: '1063724', name: '七瀬アリス' },
  { id: '1063631', name: 'ちなみん' },
  { id: '1092219', name: '春陽モカ' },
  { id: '1097223', name: '凰華りん' },
  { id: '1055079', name: '斎藤あみり' },
  { id: '1092582', name: 'Himari' },
  { id: '1086061', name: '佐藤しお' },
  { id: '1079605', name: '宮城りえ' },
  { id: '23558',   name: '紺野ひかる' },
  { id: '1079606', name: '上戸まり' },
  { id: '1047611', name: '黒川すみれ' },
  { id: '1075066', name: '胡桃さくら' },
  { id: '1083675', name: '望月つぼみ' },
  { id: '1085752', name: '高島愛' },
  { id: '1077523', name: '松本梨穂' },
  { id: '1082823', name: '桜木美音' },
  { id: '1078113', name: 'ひかり唯' },
  { id: '1089410', name: '七瀬シノン' },
  { id: '1070385', name: '美ノ嶋めぐり' },
  { id: '1092233', name: '月見若葉' },
  { id: '1089425', name: '秋元さちか' },
  { id: '1102916', name: '本城はな' },
  { id: '1020685', name: '森沢かな' },
  { id: '1099925', name: '小鈴みかん' },
  { id: '1098399', name: '糸井瑠花' },
  { id: '1068671', name: '北野未奈' },
  { id: '1096319', name: 'わか菜ほの' },
  { id: '1078105', name: '星乃夏月' },
  { id: '1087621', name: '小那海あや' },
  { id: '1041759', name: '優梨まいな' },
  { id: '1061348', name: '椿りか' },
  { id: '1096517', name: '潤うるる' },
  { id: '1094637', name: '静河' },
  { id: '1085740', name: '戸川なみ' },
  { id: '1095296', name: '幾野まち' },
  { id: '1050439', name: '月乃ルナ' },
  { id: '1087594', name: '永野鈴' },
  { id: '1075254', name: '花柳杏奈' },
  { id: '1084919', name: '南條彩' },
  { id: '1085389', name: '美波汐里' },
]

// ── 定数 ─────────────────────────────────────────────────────────────────────

const ITEM_LIST_URL = 'https://api.dmm.com/affiliate/v3/ItemList'
const HITS_PER_PAGE = 100
const BATCH_SIZE    = 50

// フロア定義: 主要3フロア
const FLOORS = [
  { service: 'digital', floor: 'videoa' },
  { service: 'digital', floor: 'vr'     },
  { service: 'mono',    floor: 'dvd'    },
]

// ── sleep ─────────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ── DMM API 1ページ取得 ───────────────────────────────────────────────────────

async function fetchPage({ service, floor, actressId, offset }) {
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
    article_id:   actressId,
    output:       'json',
  })

  try {
    const res = await fetch(`${ITEM_LIST_URL}?${qs}`, { cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text()
      console.warn(`    HTTP ${res.status}: ${text.slice(0, 200)}`)
      return { items: [], total: 0 }
    }
    const json = await res.json()
    if (json.result?.status !== 200) {
      // status 404 = その女優にはそのフロアの作品なし（正常）
      if (json.result?.status !== 404) {
        console.warn(`    API status ${json.result?.status}: ${json.result?.message}`)
      }
      return { items: [], total: 0 }
    }
    return {
      items: json.result?.items ?? [],
      total: json.result?.total_count ?? 0,
    }
  } catch (e) {
    console.warn(`    fetch error: ${e.message}`)
    return { items: [], total: 0 }
  }
}

// ── 1フロアの全ページ取得 ─────────────────────────────────────────────────────

async function fetchAllPages(actressId, service, floor) {
  const allItems = []
  let offset = 1

  while (true) {
    const { items, total } = await fetchPage({ service, floor, actressId, offset })
    if (items.length === 0) break

    allItems.push(...items)

    if (allItems.length >= total || items.length < HITS_PER_PAGE) break
    offset += HITS_PER_PAGE
    await sleep(500) // ページ間: 500ms
  }

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
  return `${base}-${cid}`
}

function normalizeItem(item, floor) {
  const genres    = item.iteminfo?.genre?.map(g => g.name)   ?? []
  const actresses = item.iteminfo?.actress?.map(a => a.name) ?? []
  const tags      = [...new Set([...actresses, ...genres])]

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
      product_id:       item.product_id      ?? null,
      number:           item.number          ?? null,
      volume:           item.volume          ?? null,
      url:              item.URL             ?? null,
      affiliate_url:    item.affiliateURL    ?? null,
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

// ── Supabase バッチ upsert（ignoreDuplicates: true = 新規のみ INSERT）────────

async function upsertBatch(records) {
  if (records.length === 0) return { ok: 0, err: 0 }

  let ok = 0, err = 0

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('articles')
      .upsert(chunk, { onConflict: 'external_id', ignoreDuplicates: true })

    if (error) {
      console.error(`    ❌ バッチ失敗 [${i}~${i+chunk.length}]: ${error.message}`)
      // フォールバック: 1件ずつ
      for (const rec of chunk) {
        try {
          const { error: e2 } = await supabase
            .from('articles')
            .upsert(rec, { onConflict: 'external_id', ignoreDuplicates: true })
          e2 ? err++ : ok++
          if (e2) console.error(`    ❌ ${rec.external_id}: ${e2.message}`)
        } catch (e3) {
          err++
          console.error(`    ❌ ${rec.external_id} unexpected: ${e3.message}`)
        }
      }
    } else {
      ok += chunk.length
    }
  }

  return { ok, err }
}

// ── メイン ───────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now()
  console.log('═'.repeat(60))
  console.log('  VERITY トップ女優100名 全作品一括同期')
  console.log(`  対象: ${TOP_ACTRESSES.length}名`)
  console.log('═'.repeat(60))

  // 開始前のDB件数
  const { count: countBefore } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('source', 'dmm')
  console.log(`\n📊 同期前 articles 件数: ${countBefore}件\n`)

  let totalFetched = 0
  let totalUpserted = 0
  let totalErrors = 0

  for (let i = 0; i < TOP_ACTRESSES.length; i++) {
    const { id: actressId, name } = TOP_ACTRESSES[i]
    const progress = `[${String(i + 1).padStart(3)}/${TOP_ACTRESSES.length}]`

    console.log(`\n${progress} ── ${name} (ID: ${actressId}) ──`)

    const seenCids  = new Set()
    const records   = []

    for (const { service, floor } of FLOORS) {
      try {
        const items = await fetchAllPages(actressId, service, floor)

        if (items.length > 0) {
          console.log(`  ${service}/${floor}: ${items.length}件`)
        }

        for (const item of items) {
          if (!seenCids.has(item.content_id)) {
            seenCids.add(item.content_id)
            records.push(normalizeItem(item, floor))
          }
        }

        await sleep(800) // フロア間: 800ms
      } catch (e) {
        console.error(`  ❌ ${service}/${floor} エラー: ${e.message}`)
      }
    }

    console.log(`  → 重複除外後 ${records.length}件`)
    totalFetched += records.length

    if (records.length > 0) {
      const { ok, err } = await upsertBatch(records)
      totalUpserted += ok
      totalErrors   += err
      console.log(`  → upsert: ${ok}件 処理 / ${err}件 エラー`)
    }

    // 女優間インターバル（最終以外）
    if (i < TOP_ACTRESSES.length - 1) {
      await sleep(1500)
    }
  }

  // 終了後のDB件数
  const { count: countAfter } = await supabase
    .from('articles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('source', 'dmm')

  const elapsed = Math.round((Date.now() - startTime) / 1000)
  const newInserts = (countAfter ?? 0) - (countBefore ?? 0)

  console.log('\n' + '═'.repeat(60))
  console.log('  ✅ 同期完了')
  console.log('═'.repeat(60))
  console.log(`  処理時間      : ${Math.floor(elapsed / 60)}分${elapsed % 60}秒`)
  console.log(`  取得作品数    : ${totalFetched}件（重複除外済み）`)
  console.log(`  upsert処理数  : ${totalUpserted}件`)
  console.log(`  エラー数      : ${totalErrors}件`)
  console.log(`  同期前DB件数  : ${countBefore}件`)
  console.log(`  同期後DB件数  : ${countAfter}件`)
  console.log(`  ✨ 新規追加   : +${newInserts}件`)
  console.log('═'.repeat(60))
}

main().catch(e => {
  console.error('\n❌ 予期しないエラー:', e)
  process.exit(1)
})
