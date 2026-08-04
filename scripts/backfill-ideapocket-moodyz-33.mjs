#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// backfill-ideapocket-moodyz-33.mjs — アイデアポケット/ムーディーズ 未取得videoa 33件の限定補完
// ═════════════════════════════════════════════════════════════════════════════
// 背景: 2026-08-04 のFANZA目視確認で、アイデアポケット12件・ムーディーズ21件の
//   videoa配信ページが実在するにも関わらず articles 未登録であることが判明。
//   読み取り専用調査の結果、全33件はDMM ItemList API(article=maker と同等の
//   keyword検索)で videoa として正しく取得でき、maker.idも一致、DB未登録
//   (class A)であることを確認済み。maker-sync.mjs の00:30 JST定期実行が本CIDを
//   まだ拾えていない理由は「API側の article=maker タグ付け反映タイミング遅延」が
//   最有力仮説(hits=100カットオフ・ゼロパディング・除外ジャンルはいずれも否定済み)。
//
// 方式: scripts/sync-missing-featured.mjs の取得ロジック(keyword検索→
//   normalizeDmmItem)と scripts/maker-sync.mjs のDB書き込みロジック
//   (on_conflict=external_id + ignore-duplicates の INSERT専用)を組み合わせる。
//   UPSERTは使わない(既存行を絶対に書き換えない設計)。
//
// 対象: 下記 TARGET_CIDS の33件のみ。他CIDは一切操作しない。
//
// 使い方:
//   node scripts/backfill-ideapocket-moodyz-33.mjs            # dry-run（既定）
//   node scripts/backfill-ideapocket-moodyz-33.mjs --apply    # 実書き込み
//
// 冪等性: 実行前に対象33件の既存行をSELECTし、既存分は自動スキップ（INSERTしない）。
//   何度実行しても安全（重複INSERTは on_conflict=external_id でも二重に防御）。
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const APPLY = process.argv.includes('--apply')
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
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
for (const [k, v] of [['DMM_API_ID', DMM_API_ID], ['AFFILIATE_ID', AFFILIATE_ID], ['NEXT_PUBLIC_SUPABASE_URL', SB_URL], ['SUPABASE_SERVICE_ROLE_KEY', SB_KEY]]) {
  if (!v) { console.error(`FATAL missing env ${k}`); process.exit(2) }
}

// ── 対象CID(オーナー指定・厳密固定。追加・削除しない)────────────────────────────
const TARGET_CIDS = [
  // アイデアポケット(maker_id=1219) 12件
  'ipzz00920', 'ipzz00957', 'ipzz00939', 'ipzz00948', 'ipzz00987', 'ipzz00934',
  'ipzz00923', 'ipzz00947', 'ipzz00938', 'ipzz00952', 'ipzz00902', 'ipzz00891',
  // ムーディーズ(maker_id=1509) 21件
  'mimk00292', 'mida00798', 'mngs00066', 'mida00770', 'mikr00120', 'mida00796',
  'mida00766', 'mida00775', 'mida00763', 'mida00764', 'mida00774', 'mida00768',
  'mida00778', 'mizd00546', 'mikr00118', 'mida00771', 'mida00814', 'mida00772',
  'mida00765', 'mida00759', 'mida00737',
]
const EXPECTED_MAKER_ID = { ideapocket: 1219, moodyz: 1509 }
const IDEAPOCKET_PREFIX_HINT = new Set(['ipzz'])
const jstIso = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '') + '+09:00'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── cidToProductNumber(sync-missing-featured.mjsと同一)───────────────────────
function cidToProductNumber(cid) {
  const m = cid.match(/^(.*?)(\d+)$/)
  return m ? `${m[1].toUpperCase()}-${parseInt(m[2], 10)}` : cid.toUpperCase()
}

// ── buildSlug / normalizeDmmItem(maker-sync.mjs / dmm.ts と逐語一致)──────────
function buildSlug(title, contentId) {
  const base = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60)
  return `${base}-${contentId}`
}
function normalizeDmmItem(item, floor = 'videoa') {
  const genres = item.iteminfo?.genre?.map((g) => g.name) ?? []
  const actresses = item.iteminfo?.actress?.map((a) => a.name) ?? []
  const tags = [...actresses, ...genres]
  const makerName = item.iteminfo?.maker?.[0]?.name ?? ''
  const labelName = item.iteminfo?.label?.[0]?.name ?? ''
  const seriesName = item.iteminfo?.series?.[0]?.name ?? ''
  const summary = [
    actresses.length ? actresses.join('・') : null,
    makerName || null, labelName || null,
    seriesName ? `シリーズ: ${seriesName}` : null,
  ].filter(Boolean).join(' / ') || null
  const publishedAt = item.date
    ? new Date(item.date.replace(/\//g, '-').replace(' ', 'T') + '+09:00').toISOString() : null
  return {
    external_id: item.content_id, title: item.title, slug: buildSlug(item.title, item.content_id),
    source: 'dmm', category: item.iteminfo?.genre?.[0]?.name ?? null,
    tags: tags.length > 0 ? tags : null, summary, content: null,
    image_url: item.imageURL?.large ?? item.imageURL?.small ?? null,
    published_at: publishedAt, is_active: true,
    metadata: {
      floor, product_id: item.product_id, number: item.number ?? null, volume: item.volume ?? null,
      url: item.URL, affiliate_url: item.affiliateURL,
      sample_movie_url: item.sampleMovieURL?.size_720_480 ?? item.sampleMovieURL?.size_644_414
        ?? item.sampleMovieURL?.size_560_360 ?? item.sampleMovieURL?.size_476_306 ?? null,
      price: item.prices?.price ?? null, list_price: item.prices?.list_price ?? null,
      review: item.review ?? null,
      actress: item.iteminfo?.actress ?? [], maker: item.iteminfo?.maker ?? [],
      label: item.iteminfo?.label ?? [], series: item.iteminfo?.series ?? [],
      director: item.iteminfo?.director ?? [],
    },
  }
}

// ── DMM ItemList(keyword検索。article=makerのメーカー限定フィードは使わない— 反映遅延の影響を受けないため)
async function fetchDmmItems({ keyword, cid, service = 'digital', floor = 'videoa' }) {
  const qs = new URLSearchParams({
    api_id: DMM_API_ID, affiliate_id: AFFILIATE_ID, site: 'FANZA',
    service, floor, hits: '20', output: 'json', sort: 'date',
  })
  if (keyword) qs.set('keyword', keyword)
  if (cid) qs.set('cid', cid)
  const res = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${qs}`, { cache: 'no-store' })
  const text = await res.text()
  if (!res.ok) throw new Error(`DMM HTTP ${res.status}: ${text.slice(0, 160)}`)
  const r = JSON.parse(text).result
  if (r.status !== 200) throw new Error(`DMM status ${r.status}: ${r.message ?? ''}`)
  return r.items ?? []
}

async function fetchOneCid(cid) {
  const keyword = cidToProductNumber(cid)
  const dItems = await fetchDmmItems({ keyword, service: 'digital', floor: 'videoa' })
  await sleep(350)
  const dHit = dItems.find((i) => i.content_id === cid)
  if (dHit) return { item: dHit, floor: 'videoa', via: 'keyword' }

  const dCidItems = await fetchDmmItems({ cid, service: 'digital', floor: 'videoa' })
  await sleep(350)
  const dCidHit = dCidItems.find((i) => i.content_id === cid)
  if (dCidHit) return { item: dCidHit, floor: 'videoa', via: 'direct-cid' }

  return null
}

// ── Supabase PostgREST(直叩き・maker-sync.mjsと同一手法)──────────────────────
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
async function selectExisting(cids) {
  const inList = cids.map((c) => `"${c}"`).join(',')
  const url = `${SB_URL}/rest/v1/articles?select=external_id&external_id=in.(${encodeURIComponent(inList)})`
  const res = await fetch(url, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`SELECT HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
  return new Set((await res.json()).map((r) => r.external_id))
}
async function insertRows(records) {
  const url = `${SB_URL}/rest/v1/articles?on_conflict=external_id`
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...SB_HEADERS, Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify(records),
  })
  if (!res.ok) throw new Error(`INSERT HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

// ── メイン ───────────────────────────────────────────────────────────────────
const t0 = Date.now()
console.log(`\nSTART backfill-33 started_at=${jstIso()} mode=${APPLY ? 'APPLY' : 'DRY'} targets=${TARGET_CIDS.length}`)

const existing = await selectExisting(TARGET_CIDS)
console.log(`既存DB登録済み(スキップ対象): ${existing.size}件 ${existing.size ? '(' + [...existing].join(',') + ')' : ''}`)

const toFetch = TARGET_CIDS.filter((c) => !existing.has(c))
const records = []
const failures = []
const skippedWrongMaker = []

for (const cid of toFetch) {
  const expectedMaker = cid.startsWith('ipzz') ? EXPECTED_MAKER_ID.ideapocket : EXPECTED_MAKER_ID.moodyz
  try {
    const hit = await fetchOneCid(cid)
    if (!hit) { failures.push({ cid, reason: 'API videoa未取得(keyword/direct-cidいずれも不一致)' }); console.log(`  ✗ ${cid} 取得失敗`); continue }
    const actualMakerId = hit.item.iteminfo?.maker?.[0]?.id
    if (actualMakerId !== expectedMaker) {
      skippedWrongMaker.push({ cid, actualMakerId, expectedMaker })
      console.log(`  ⚠ ${cid} maker_id不一致のためスキップ (期待${expectedMaker} 実際${actualMakerId})`)
      continue
    }
    const url = hit.item.URL ?? ''
    if (url.includes('/mono/dvd/')) {
      skippedWrongMaker.push({ cid, reason: 'DVD URL検出のためスキップ' })
      console.log(`  ⚠ ${cid} DVD URL検出のためスキップ`)
      continue
    }
    const record = normalizeDmmItem(hit.item, 'videoa')
    records.push(record)
    console.log(`  ✓ ${cid} 取得成功(via=${hit.via}) maker_id=${actualMakerId} title=${hit.item.title.slice(0, 40)}`)
  } catch (err) {
    failures.push({ cid, reason: String(err.message ?? err) })
    console.log(`  ✗ ${cid} エラー: ${String(err.message ?? err)}`)
  }
}

console.log(`\n取得結果: 成功=${records.length} 失敗=${failures.length} メーカー不一致等スキップ=${skippedWrongMaker.length} 既存スキップ=${existing.size}`)

let inserted = 0
if (APPLY && records.length) {
  const result = await insertRows(records)
  inserted = Array.isArray(result) ? result.length : 0
  console.log(`\n✅ INSERT実行: ${inserted}/${records.length}件が新規反映(ignore-duplicatesのため既存分は自動スキップ)`)
} else if (records.length) {
  console.log(`\n(DRY-RUN) --apply未指定のため書き込みなし。INSERT予定: ${records.length}件`)
  for (const r of records) console.log(`  would-insert: ${r.external_id} floor=${r.metadata.floor} maker=${r.metadata.maker?.[0]?.name}`)
}

console.log(
  `\nDONE backfill-33 mode=${APPLY ? 'APPLY' : 'DRY'} fetched_ok=${records.length} inserted=${APPLY ? inserted : 0}${APPLY ? '' : '(dry)'} ` +
  `failures=${failures.length} skipped_existing=${existing.size} skipped_other=${skippedWrongMaker.length} elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s`,
)
if (failures.length) { console.log('failures detail:'); for (const f of failures) console.log(`  - ${f.cid}: ${f.reason}`) }
process.exit(failures.length > 0 && records.length === 0 ? 1 : 0)
