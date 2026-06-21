/**
 * campaign=6565 の対象作品を取得するスクリプト。
 * 戦略:
 *   1. FANZA キャンペーンページ HTML から content_id を抽出
 *   2. 取得した CID を DMM Affiliate API v3 で検索してタイトル・女優名を補完
 *   3. Fanza100SaleBanner.tsx 用の SALE_ITEMS コードを出力
 *
 * 使い方: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/fetch-campaign-6565.mjs
 */

import { readFileSync } from 'fs'

function loadEnv(file) {
  try {
    for (const line of readFileSync(file, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env.local')
loadEnv('.env')

const DMM_API_ID   = process.env.DMM_API_ID
const AFFILIATE_ID = process.env.AFFILIATE_ID

if (!DMM_API_ID || !AFFILIATE_ID) {
  console.error('❌ DMM_API_ID / AFFILIATE_ID が未設定です')
  process.exit(1)
}

// ── FANZA キャンペーンページを取得して content_id を抽出 ──────────────────────
async function fetchCampaignCids(campaignId) {
  const urls = [
    `https://video.dmm.co.jp/av/list/?campaign=${campaignId}&sort=suggest`,
    `https://www.dmm.co.jp/digital/videoa/-/list/=/campaign=${campaignId}/sort=ranking/`,
  ]

  for (const pageUrl of urls) {
    console.log(`[scrape] ${pageUrl}`)
    try {
      const res  = await fetch(pageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'ja-JP,ja;q=0.9',
        },
      })
      if (!res.ok) { console.warn(`  → HTTP ${res.status}, skip`); continue }
      const html = await res.text()

      // content_id は /cid=XXXXXX/ 形式でHTMLに埋め込まれている
      const cidSet = new Set()
      const cidRx  = /\/cid=([a-z0-9]+)\//gi
      let m
      while ((m = cidRx.exec(html)) !== null) {
        const cid = m[1].toLowerCase()
        // 数字のみ・短すぎるものは除外
        if (cid.length >= 7 && !/^\d+$/.test(cid)) cidSet.add(cid)
      }

      if (cidSet.size > 0) {
        console.log(`  → ${cidSet.size} CID 抽出`)
        return [...cidSet]
      }
      console.warn('  → CID なし、次のURLを試す')
    } catch (e) {
      console.warn(`  → fetch 失敗: ${e.message}`)
    }
  }
  return []
}

// ── DMM Affiliate API で CID の詳細を取得 ─────────────────────────────────────
async function fetchItemByCid(cid) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service:      'digital',
    floor:        'videoa',
    hits:         '1',
    offset:       '1',
    output:       'json',
    cid,
  })

  try {
    const res  = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${qs}`)
    const text = await res.text()
    const json = JSON.parse(text)
    if (json.result?.status === 200 && json.result.items?.length > 0) {
      return json.result.items[0]
    }
  } catch (e) {
    console.warn(`  [api] ${cid} 取得失敗: ${e.message}`)
  }
  return null
}

// ── ランク別人気作品を API から直接フェッチ（フォールバック） ─────────────────
async function fetchRankedItems(hits = 50) {
  console.log('[api] rank order で人気作品を取得…')
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    service:      'digital',
    floor:        'videoa',
    hits:         String(hits),
    offset:       '1',
    output:       'json',
    sort:         'rank',
  })
  const res  = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${qs}`)
  const json = JSON.parse(await res.text())
  return json.result?.items ?? []
}

// ── メイン ────────────────────────────────────────────────────────────────────
const CAMPAIGN_ID = 6565
const PICK_COUNT  = 30

try {
  console.log(`\n📡 Campaign ${CAMPAIGN_ID} データ取得開始\n`)

  // Step 1: キャンペーンページから CID リスト取得
  const campaignCids = await fetchCampaignCids(CAMPAIGN_ID)

  let pickedItems = []

  if (campaignCids.length > 0) {
    console.log(`\n📝 CID ${Math.min(campaignCids.length, PICK_COUNT)} 件の詳細を API で補完…`)

    // 上位 PICK_COUNT 件の詳細を取得（直列: API 負荷軽減）
    for (const cid of campaignCids.slice(0, PICK_COUNT + 10)) {
      if (pickedItems.length >= PICK_COUNT) break
      process.stdout.write(`  ${cid} … `)
      const item = await fetchItemByCid(cid)
      if (item) {
        pickedItems.push(item)
        const actress = item.iteminfo?.actress?.[0]?.name ?? '-'
        console.log(`✓ ${actress}`)
      } else {
        console.log('skip')
      }
      await new Promise(r => setTimeout(r, 150)) // API 負荷軽減
    }
  }

  // Step 2: キャンペーンページから十分に取れなかった場合は API ランキングでフォールバック
  if (pickedItems.length < PICK_COUNT) {
    console.log(`\n⚠ ${pickedItems.length} 件のみ取得。APIランキングで補完します…`)
    const ranked  = await fetchRankedItems(100)
    const existing = new Set(pickedItems.map(it => it.content_id))
    for (const item of ranked) {
      if (pickedItems.length >= PICK_COUNT) break
      if (!existing.has(item.content_id) && item.iteminfo?.actress?.length > 0) {
        pickedItems.push(item)
      }
    }
  }

  pickedItems = pickedItems.slice(0, PICK_COUNT)

  // ── 出力 ────────────────────────────────────────────────────────────────────
  console.log(`\n✅ 合計 ${pickedItems.length} 件\n`)
  console.log('━'.repeat(70))
  console.log('const SALE_ITEMS: SaleItem[] = [')

  for (const it of pickedItems) {
    const cid    = it.content_id
    const actress = (it.iteminfo?.actress?.[0]?.name ?? '').padEnd(8, ' ')
    const title  = it.title.replace(/'/g, "\\'").slice(0, 60)
    console.log(`  { cid: '${cid}', actress: '${actress}', title: '${title}' },`)
  }
  console.log(']')
  console.log('━'.repeat(70))

  console.log('\n━━━ 女優リスト ━━━')
  pickedItems.forEach(({ content_id, iteminfo }, i) => {
    const actress = iteminfo?.actress?.[0]?.name ?? '(素人/複数)'
    console.log(`  ${String(i + 1).padStart(2)}. ${content_id}  ${actress}`)
  })

} catch (err) {
  console.error('❌ 予期しないエラー:', err)
  process.exit(1)
}
