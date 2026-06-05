/**
 * VERITYデータ修復スクリプト
 *
 * タスク1: 5作品のUPSERT (mida00726, ofes00042, mida00688, mida00712, ipzz00852)
 * タスク2: 4名の女優ページ404修復 (蜜このは, 奥井千晴, 三咲まゆ, 篠崎沙帆)
 *
 * Usage: node scripts/fix-actress-data.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import https from 'node:https'

// .env.local を手動パース
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const SUPABASE_URL     = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY     = process.env.SUPABASE_SERVICE_ROLE_KEY
const DMM_API_ID       = process.env.DMM_API_ID
const AFFILIATE_ID     = process.env.AFFILIATE_ID

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase env vars missing'); process.exit(1) }
if (!DMM_API_ID || !AFFILIATE_ID)   { console.error('DMM env vars missing');      process.exit(1) }

// ─── HTTP helper ──────────────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((ok, ng) => {
    https.get(url, { rejectUnauthorized: false }, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { ok({ status: res.statusCode, text: d }) }
        catch (e) { ng(e) }
      })
    }).on('error', ng)
  })
}

// ─── Supabase REST helper ─────────────────────────────────────────────────────

async function sbRequest(method, path, body) {
  const url = `${SUPABASE_URL}/rest/v1${path}`
  const headers = {
    'apikey':        SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type':  'application/json',
    'Prefer':        method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok && res.status !== 409) {
    throw new Error(`Supabase ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return text ? JSON.parse(text).catch?.(() => text) ?? text : null
}

async function sbSelect(table, query) {
  const params = new URLSearchParams(query)
  const url = `${SUPABASE_URL}/rest/v1/${table}?${params}`
  const res = await fetch(url, {
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept':        'application/json',
    },
  })
  if (!res.ok) throw new Error(`Supabase SELECT ${table} → ${res.status}`)
  return res.json()
}

async function sbUpsert(table, records, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}`
  const res = await fetch(`${url}?on_conflict=${onConflict}`, {
    method: 'POST',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(records),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Supabase UPSERT ${table} → ${res.status}: ${text.slice(0,300)}`)
  console.log(`  [sb:upsert] ${table} (${Array.isArray(records) ? records.length : 1}件) → OK`)
}

// ─── DMM API helpers ──────────────────────────────────────────────────────────

const ITEM_LIST_BASE     = 'https://api.dmm.com/affiliate/v3/ItemList'
const ACTRESS_SEARCH_BASE = 'https://api.dmm.com/affiliate/v3/ActressSearch'

function cidToProductNumber(cid) {
  const m = cid.match(/^(.*?)(\d+)$/)
  return m ? `${m[1].toUpperCase()}-${m[2]}` : cid.toUpperCase()
}

async function fetchDmmItems(params) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service:      params.service ?? 'digital',
    floor:        params.floor   ?? 'videoa',
    hits:         String(params.hits   ?? 20),
    offset:       String(params.offset ?? 1),
    sort:         params.sort    ?? 'date',
    output:       'json',
  })
  if (params.keyword)    qs.set('keyword',    params.keyword)
  if (params.article)    qs.set('article',    params.article)
  if (params.article_id) qs.set('article_id', params.article_id)

  const safeQs = new URLSearchParams(qs); safeQs.set('api_id','***'); safeQs.set('affiliate_id','***')
  console.log(`  [dmm:item] GET ${ITEM_LIST_BASE}?${safeQs}`)

  const { status, text } = await httpsGet(`${ITEM_LIST_BASE}?${qs}`)
  if (status !== 200) throw new Error(`DMM ItemList HTTP ${status}: ${text.slice(0,200)}`)
  const json = JSON.parse(text)
  if (json.result?.status !== 200) {
    throw new Error(`DMM ItemList API error ${json.result?.status}: ${json.result?.message ?? JSON.stringify(json).slice(0,200)}`)
  }
  return json.result?.items ?? []
}

async function fetchActressImage(dmmId) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    output:       'json',
    hits:         '1',
    actress_id:   String(dmmId),
  })
  const safeQs = new URLSearchParams(qs); safeQs.set('api_id','***'); safeQs.set('affiliate_id','***')
  console.log(`  [dmm:actress] GET ${ACTRESS_SEARCH_BASE}?${safeQs}`)

  try {
    const { status, text } = await httpsGet(`${ACTRESS_SEARCH_BASE}?${qs}`)
    if (status !== 200) return null
    const json = JSON.parse(text)
    if (json.result?.status !== 200 || !json.result?.items?.length) return null
    const item = json.result.items[0]
    return item.imageURL?.large ?? item.imageURL?.small ?? null
  } catch { return null }
}

async function fetchActressImageByName(name) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    output:       'json',
    hits:         '5',
    keyword:      name,
  })
  try {
    const { status, text } = await httpsGet(`${ACTRESS_SEARCH_BASE}?${qs}`)
    if (status !== 200) return null
    const json = JSON.parse(text)
    if (json.result?.status !== 200 || !json.result?.items?.length) return null
    const exact = json.result.items.find(i => i.name === name)
    const hit   = exact ?? json.result.items[0]
    return hit.imageURL?.large ?? hit.imageURL?.small ?? null
  } catch { return null }
}

// ─── Normalizer ───────────────────────────────────────────────────────────────

function buildSlug(title, contentId) {
  const base = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
  return `${base}-${contentId}`
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

// ─── Task 1: 5作品UPSERT ─────────────────────────────────────────────────────

const TARGET_CIDS = [
  { cid: 'mida00726', actress: '石川澪' },
  { cid: 'ofes00042', actress: 'ひなの花音' },
  { cid: 'mida00688', actress: '福田ゆあ' },
  { cid: 'mida00712', actress: 'ゆうき希' },
  { cid: 'ipzz00852', actress: '堀北桃愛' },
]

async function upsert5Articles() {
  console.log('\n=== タスク1: 5作品UPSERT ===')

  for (const { cid, actress } of TARGET_CIDS) {
    console.log(`\n[${cid}] ${actress} を処理中...`)

    // 既存チェック
    const existing = await sbSelect('articles', {
      external_id: `eq.${cid}`,
      select: 'external_id,title,published_at',
    })
    if (existing?.length > 0) {
      console.log(`  → DB既存: "${existing[0].title?.slice(0,50)}" (${existing[0].published_at})`)
      console.log(`  → 最新情報で上書き更新（UPSERT）します`)
    } else {
      console.log(`  → DB未収録 → 新規INSERT`)
    }

    const keyword = cidToProductNumber(cid)
    console.log(`  → DMM API keyword検索: "${keyword}"`)

    // digital と mono 両方試す
    let best = null
    let bestFloor = 'videoa'

    const [dRes, mRes] = await Promise.allSettled([
      fetchDmmItems({ keyword, hits: 10, service: 'digital', floor: 'videoa' }),
      fetchDmmItems({ keyword, hits: 10, service: 'mono',    floor: 'dvd'    }),
    ])

    const dItems = (dRes.status === 'fulfilled' ? dRes.value : []).filter(i => i.content_id === cid)
    const mItems = (mRes.status === 'fulfilled' ? mRes.value : []).filter(i => i.content_id === cid)

    if (dRes.status === 'rejected') console.log(`  → digital検索失敗: ${dRes.reason?.message ?? dRes.reason}`)
    if (mRes.status === 'rejected') console.log(`  → mono検索失敗: ${mRes.reason?.message ?? mRes.reason}`)

    console.log(`  → digital hits: ${dRes.status === 'fulfilled' ? dRes.value.length : 'err'} (exact: ${dItems.length})`)
    console.log(`  → mono hits: ${mRes.status === 'fulfilled' ? mRes.value.length : 'err'} (exact: ${mItems.length})`)

    best = dItems.find(i => i.sampleMovieURL) ?? mItems.find(i => i.sampleMovieURL) ?? dItems[0] ?? mItems[0] ?? null
    bestFloor = mItems.includes(best) ? 'dvd' : 'videoa'

    if (!best) {
      console.log(`  ✗ APIで見つからず — スキップ`)
      continue
    }

    console.log(`  → タイトル: "${best.title.slice(0,60)}"`)
    console.log(`  → 発売日: ${best.date}  floor: ${bestFloor}`)

    const record = normalizeDmmItem(best, bestFloor)

    // articles upsert
    await sbUpsert('articles', [record], 'external_id')
    console.log(`  ✓ articles upsert完了: ${cid}`)

    // actresses upsert (出演女優)
    const actressItems = best.iteminfo?.actress ?? []
    if (actressItems.length > 0) {
      console.log(`  → 出演女優: ${actressItems.map(a => `${a.name}(${a.id})`).join(', ')}`)

      // 画像取得（最大3名まで）
      const imageMap = new Map()
      for (const a of actressItems.slice(0, 3)) {
        const imgUrl = await fetchActressImage(a.id)
        if (imgUrl) imageMap.set(a.id, imgUrl)
      }

      const actressRecords = actressItems.map(a => ({
        external_id: `dmm-actress-${a.id}`,
        name:        a.name,
        ruby:        a.ruby ?? null,
        image_url:   imageMap.get(a.id) ?? null,
        is_active:   true,
        metadata:    { dmm_id: a.id },
      }))

      // ignoreDuplicates: false で常に is_active=true に更新
      const url = `${SUPABASE_URL}/rest/v1/actresses?on_conflict=external_id`
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey':        SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Content-Type':  'application/json',
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(actressRecords),
      })
      if (res.ok) {
        console.log(`  ✓ actresses upsert完了: ${actressRecords.map(r => r.name).join(', ')}`)
      } else {
        const errText = await res.text()
        console.log(`  ✗ actresses upsert失敗: ${res.status} ${errText.slice(0,200)}`)
      }
    }
  }
}

// ─── Task 2: 4名の女優404修復 ─────────────────────────────────────────────────

const TARGET_ACTRESSES = ['蜜このは', '奥井千晴', '三咲まゆ', '篠崎沙帆']

async function fix4ActressesWith404() {
  console.log('\n=== タスク2: 4名の女優404修復 ===')

  for (const actressName of TARGET_ACTRESSES) {
    console.log(`\n[${actressName}] 調査中...`)

    // Step A: articles テーブルから女優のDMM IDを取得
    let dmmId = null
    let dmmRuby = null

    // Supabase の contains は PostgREST で cs. 演算子を使う
    // tags @> ARRAY[actressName] をREST APIで実行
    const articlesUrl = `${SUPABASE_URL}/rest/v1/articles?tags=cs.%7B${encodeURIComponent(actressName)}%7D&select=metadata&limit=5`
    const artRes = await fetch(articlesUrl, {
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept':        'application/json',
      },
    })
    if (artRes.ok) {
      const articles = await artRes.json()
      console.log(`  → articles.tags に "${actressName}" が含まれる記事: ${articles.length}件`)
      for (const art of articles) {
        const actressList = art.metadata?.actress ?? []
        const found = actressList.find(a => a.name === actressName)
        if (found && found.id > 0) {
          dmmId   = found.id
          dmmRuby = found.ruby ?? null
          console.log(`  → DMM ID発見: ${dmmId} (ruby: ${dmmRuby ?? 'なし'})`)
          break
        }
      }
    } else {
      console.log(`  ✗ articles検索失敗: ${artRes.status}`)
    }

    if (!dmmId) {
      console.log(`  → DBの記事からDMM IDを取得できず → DMM APIで名前検索`)
      // DMM ActressSearch で検索
      const qs = new URLSearchParams({
        api_id:       DMM_API_ID,
        affiliate_id: AFFILIATE_ID,
        site:         'FANZA',
        output:       'json',
        hits:         '5',
        keyword:      actressName,
      })
      try {
        const { status, text } = await httpsGet(`${ACTRESS_SEARCH_BASE}?${qs}`)
        if (status === 200) {
          const json = JSON.parse(text)
          if (json.result?.status === 200 && json.result?.items?.length) {
            const exact = json.result.items.find(i => i.name === actressName)
            const hit   = exact ?? json.result.items[0]
            dmmId   = parseInt(hit.id)
            dmmRuby = hit.ruby ?? null
            console.log(`  → DMM ActressSearch ヒット: ID=${dmmId} name=${hit.name}`)
          } else {
            console.log(`  ✗ DMM ActressSearch: ヒットなし (status=${json.result?.status})`)
          }
        }
      } catch (e) {
        console.log(`  ✗ DMM ActressSearch 失敗: ${e.message}`)
      }
    }

    // Step B: actresses テーブルの現在の状態を確認
    const extId = dmmId ? `dmm-actress-${dmmId}` : null
    let existingRecord = null

    if (extId) {
      const rows = await sbSelect('actresses', {
        external_id: `eq.${extId}`,
        select: 'id,external_id,name,is_active,metadata',
      })
      if (rows?.length > 0) {
        existingRecord = rows[0]
        console.log(`  → actresses テーブル: external_id=${extId}`)
        console.log(`    is_active=${existingRecord.is_active}  name=${existingRecord.name}`)
      } else {
        console.log(`  → actresses テーブル: external_id=${extId} のレコード未存在`)
      }
    } else {
      // DMM IDが不明な場合は名前で検索
      const rows = await sbSelect('actresses', {
        name: `eq.${actressName}`,
        select: 'id,external_id,name,is_active,metadata',
      })
      if (rows?.length > 0) {
        existingRecord = rows[0]
        console.log(`  → actresses テーブル(名前検索): external_id=${existingRecord.external_id}`)
        console.log(`    is_active=${existingRecord.is_active}`)
        // IDを名前検索結果から取得
        const m = existingRecord.external_id?.match(/^dmm-actress-(\d+)$/)
        if (m) { dmmId = parseInt(m[1]); console.log(`  → 既存レコードからDMM ID: ${dmmId}`) }
      } else {
        console.log(`  → actresses テーブル: "${actressName}" のレコード未存在`)
      }
    }

    // Step C: 修復処理
    const finalExtId = dmmId ? `dmm-actress-${dmmId}` : null

    if (!finalExtId) {
      console.log(`  ✗ DMM IDが特定できないため修復不可`)
      continue
    }

    // 画像URLを取得
    let imageUrl = existingRecord?.image_url ?? null
    if (!imageUrl && dmmId) {
      console.log(`  → 画像URL取得中 (DMM ID=${dmmId})...`)
      imageUrl = await fetchActressImage(dmmId)
      if (!imageUrl) {
        console.log(`  → ID検索失敗 → 名前検索にフォールバック`)
        imageUrl = await fetchActressImageByName(actressName)
      }
      console.log(`  → image_url: ${imageUrl ?? 'null'}`)
    }

    // 既存の metadata を保護してマージ
    const prevMeta = existingRecord?.metadata ?? {}

    const actressRecord = {
      external_id: finalExtId,
      name:        actressName,
      ruby:        dmmRuby ?? existingRecord?.ruby ?? null,
      image_url:   imageUrl,
      is_active:   true,
      metadata: {
        ...prevMeta,
        dmm_id: dmmId,
      },
    }

    // UPSERT（ignoreDuplicates: false で is_active も更新）
    const upsertUrl = `${SUPABASE_URL}/rest/v1/actresses?on_conflict=external_id`
    const upsertRes = await fetch(upsertUrl, {
      method: 'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([actressRecord]),
    })
    if (upsertRes.ok) {
      console.log(`  ✓ actresses UPSERT完了: ${finalExtId} is_active=true`)
    } else {
      const errText = await upsertRes.text()
      console.log(`  ✗ actresses UPSERT失敗: ${upsertRes.status} ${errText.slice(0,200)}`)
    }

    // Step D: articles に最低1記事あるか確認
    const artCountUrl = `${SUPABASE_URL}/rest/v1/articles?tags=cs.%7B${encodeURIComponent(actressName)}%7D&is_active=eq.true&select=external_id,title&limit=3`
    const artCountRes = await fetch(artCountUrl, {
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Accept':        'application/json',
      },
    })
    if (artCountRes.ok) {
      const arts = await artCountRes.json()
      console.log(`  → 出演記事数: ${arts.length}件`)
      for (const a of arts) {
        console.log(`    - ${a.external_id}: ${a.title?.slice(0,50)}`)
      }
      if (arts.length === 0) {
        console.log(`  ⚠ 出演記事なし → DBに記事があっても404ページは空表示になります`)
        console.log(`  → DMM APIで最新作を検索してupsertします...`)
        // Fetch from DMM and upsert
        const items = await fetchDmmItems({ keyword: actressName, hits: 5, service: 'digital', floor: 'videoa' }).catch(() => [])
        const match = items.find(it => it.iteminfo?.actress?.some(a => a.name === actressName))
        if (match) {
          const rec = normalizeDmmItem(match, 'videoa')
          await sbUpsert('articles', [rec], 'external_id')
          console.log(`  ✓ 記事UPSERT完了: ${match.content_id}`)
        }
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('VERITYデータ修復スクリプト開始')
  console.log(`Supabase URL: ${SUPABASE_URL?.split('//')[1]?.split('.')[0] ?? '?'}***.supabase.co`)

  await upsert5Articles()
  await fix4ActressesWith404()

  console.log('\n=== 完了 ===')
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1) })
