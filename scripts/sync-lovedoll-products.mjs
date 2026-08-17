#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// sync-lovedoll-products.mjs — LOVE DOLL特集 商品スナップショット生成(Phase B)
// ═════════════════════════════════════════════════════════════════════════════
// 掲載13商品(src/lib/lovedoll/config.ts の LOVEDOLL_FEATURED)をDMM ItemList APIで
// 1件ずつ逐次取得し、src/lib/lovedoll/products.json へ書き出す。
//
// 重要(Phase E rate limit知見を踏まえた安全設計):
//   ・同時実行数=1(完全逐次)
//   ・各リクエスト間 >=1.2秒 の間隔
//   ・失敗しても即座にretryしない(1回失敗した商品はnullのままスキップ、次の商品へ進む)
//   ・cronには登録しない。実行は手動のみ(bash運用者が明示的に叩く)。
//   ・ページ表示(SSR)側はこのJSONスナップショットを読むだけで、DMM APIを直接叩かない。
//
// 使い方:
//   node scripts/sync-lovedoll-products.mjs
//
// site=FANZA service=mono floor=goods (Phase A実測で確定、推測ではない)。
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const CWD = process.cwd()

function loadEnvFile(file) {
  try {
    for (const raw of fs.readFileSync(path.join(CWD, file), 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('='); if (eq === -1) continue
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (k && process.env[k] === undefined) process.env[k] = v
    }
  } catch {}
}
function loadEcosystemEnv(file) {
  try {
    const require = createRequire(import.meta.url)
    const cfg = require(path.join(CWD, file))
    const env = cfg?.apps?.[0]?.env ?? {}
    for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = String(v)
  } catch {}
}
loadEnvFile('.env.local'); loadEnvFile('.env'); loadEcosystemEnv('ecosystem.config.js')

const DMM_API_ID = process.env.DMM_API_ID
const AFFILIATE_ID = process.env.AFFILIATE_ID
if (!DMM_API_ID || !AFFILIATE_ID) { console.error('FATAL missing DMM_API_ID / AFFILIATE_ID'); process.exit(2) }

// LOVEDOLL_FEATURED の3配列を1つに結合(掲載順の正本はconfig側。ここでは取得対象CIDの列挙のみ)。
const CIDS = [
  // collaboration
  'storeago01209ax0yw9pl5h', 'storeago01209fuqkwxu825', 'storeago01209hj0pyi4b9a',
  // verityPick
  'do2114', 'do2112',
  // more
  'do2108', 'do2109', 'do2110', 'do2111', 'do2113', 'do2115', 'do2116', 'do2117',
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchOne(cid) {
  const qs = new URLSearchParams({
    api_id: DMM_API_ID, affiliate_id: AFFILIATE_ID, site: 'FANZA', service: 'mono', floor: 'goods',
    hits: '1', offset: '1', output: 'json', cid,
  })
  const res = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${qs}`)
  const json = await res.json()
  if (json.result?.status !== 200) throw new Error(`result.status=${json.result?.status} ${json.result?.message ?? ''}`)
  const item = json.result?.items?.[0]
  if (!item) throw new Error('no item in response')
  return {
    content_id: item.content_id,
    title: item.title,
    URL: item.URL,
    affiliateURL: item.affiliateURL, // 参考値のみ。実リンクは withAffiliate() を正本とする。
    imageURL: { list: item.imageURL?.list ?? null, small: item.imageURL?.small ?? null },
    prices: { price: item.prices?.price ?? null, list_price: item.prices?.list_price ?? null },
    date: item.date ?? null,
    stock: item.stock ?? null,
    maker: item.iteminfo?.maker?.[0]?.name ?? null,
    actress: (item.iteminfo?.actress ?? []).map(a => a.name),
    genre: (item.iteminfo?.genre ?? []).map(g => g.name),
    directory: (item.directory ?? []).map(d => d.name),
  }
}

async function main() {
  console.log(`[lovedoll-sync] ${CIDS.length}件を逐次取得します(間隔1.2秒、retryなし)`)
  const results = {}
  const errors = []
  for (let i = 0; i < CIDS.length; i++) {
    const cid = CIDS[i]
    const t0 = Date.now()
    try {
      const product = await fetchOne(cid)
      results[cid] = product
      console.log(`  [${i + 1}/${CIDS.length}] ${cid}: OK "${product.title.slice(0, 30)}" (${Date.now() - t0}ms)`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  [${i + 1}/${CIDS.length}] ${cid}: FAILED — ${msg} (${Date.now() - t0}ms)`)
      errors.push({ cid, message: msg })
      // リトライしない。次の商品へ進む。
    }
    if (i < CIDS.length - 1) await sleep(1200)
  }

  const outPath = path.join(CWD, 'src', 'lib', 'lovedoll', 'products.json')
  const snapshot = {
    generatedAt: new Date().toISOString(),
    source: 'DMM Affiliate API v3 ItemList (site=FANZA service=mono floor=goods)',
    requestedCount: CIDS.length,
    successCount: Object.keys(results).length,
    errorCount: errors.length,
    errors,
    products: results,
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2))
  console.log(`\n完了: ${Object.keys(results).length}/${CIDS.length}件成功 → ${outPath}`)
  if (errors.length > 0) console.log('失敗CID:', errors.map(e => e.cid).join(', '))
}

main().catch(e => { console.error('FATAL', e); process.exit(1) })
