#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// maker-sync.mjs — メーカー最新作 定期同期（HTTP/nginx 非経由・直接node実行版）
// ═════════════════════════════════════════════════════════════════════════════
// 背景: 従来は cron が `curl https://.../verity/api/cron/maker-sync` を叩いていたが、
//   syncMakerUpcoming は 57メーカー×2floor=114 API を全取得後に一括upsertする
//   all-or-nothing 設計のため、nginx 504 Gateway Timeout で中断→0件保存になり
//   2026-06-23 以降 実質停止した。本スクリプトは nginx を経由せず VPS 上で直接
//   実行し、メーカー単位で逐次INSERT することで 504 と全損の両方を排除する。
//
// 依存: なし（Node v18+ の global fetch のみ。@supabase/supabase-js 不使用＝
//   standalone の刈り込み後 node_modules でも動く）。Supabase は PostgREST を直叩き。
//
// 使い方:
//   node scripts/maker-sync.mjs            # dry-run（DB書き込みなし・既定）
//   node scripts/maker-sync.mjs --apply    # 未登録CIDのみ INSERT
//
// env 取得順（未設定キーのみ補完）: process.env → ./.env.local → ./.env →
//   ./ecosystem.config.js の apps[].env（本番の権威ソース）
//   必要キー: DMM_API_ID, AFFILIATE_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// 冪等: external_id 基準。INSERT は on_conflict=external_id + resolution=ignore-duplicates
//   なので既存行は更新も破壊もしない（新規INSERT中心の安全運用）。
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const APPLY = process.argv.includes('--apply')
const CWD = process.cwd()

// ── env ローダ（未設定キーのみ補完）──────────────────────────────────────────
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
  if (!v) { console.error(`FATAL maker-sync missing env ${k}`); process.exit(2) }
}

// ── 監視メーカー（src/lib/makers.ts の MAKERS と同期。2026-07-07 時点 57社）──────
// ※ src/lib/makers.ts を更新したら本配列も更新すること（VPS には TS が無いため inline）。
const MAKERS = [
  { id: 3152, name: 'エスワン' }, { id: 40488, name: 'FALENO' }, { id: 5456, name: 'MUTEKI' },
  { id: 4864, name: '無垢' }, { id: 311865, name: 'million' }, { id: 45276, name: 'SODクリエイト' },
  { id: 1219, name: 'アイデアポケット' }, { id: 4469, name: 'kawaii' }, { id: 1509, name: 'ムーディーズ' },
  { id: 4641, name: 'ダスッ！' }, { id: 2661, name: 'マドンナ' }, { id: 3890, name: 'プレミアム' },
  { id: 5032, name: 'E-BODY' }, { id: 5238, name: 'OPPAI' }, { id: 6304, name: '本中' },
  { id: 6329, name: 'Fitch' }, { id: 40006, name: 'ワンズファクトリー' }, { id: 40039, name: 'アリスJAPAN' },
  { id: 40041, name: 'TMA' }, { id: 45286, name: 'DANDY' }, { id: 45287, name: 'Hunter' },
  { id: 45337, name: 'HMJM' }, { id: 45338, name: 'GIGA' }, { id: 45371, name: 'ROCKET' },
  { id: 45414, name: 'S-Cute' }, { id: 45500, name: 'JUICY HONEY' }, { id: 45752, name: 'First Star' },
  { id: 46232, name: 'V＆R PRODUCE' }, { id: 1227, name: 'アタッカーズ' }, { id: 6694, name: 'MAX-Aレジェンド' },
  { id: 40586, name: 'BAZOOKA' }, { id: 45914, name: 'SWITCH' }, { id: 45281, name: 'NON' },
  { id: 45434, name: 'S級素人' }, { id: 45504, name: 'GARCON' }, { id: 45655, name: 'KO COMPANY' },
  { id: 45656, name: '代々木映像' }, { id: 40143, name: 'Shuffle' }, { id: 45016, name: 'センタービレッジ' },
  { id: 40001, name: 'ナチュラルハイ' }, { id: 40025, name: 'ドリームチケット' }, { id: 45217, name: 'マキシング' },
  { id: 40016, name: '桃太郎映像出版' }, { id: 40035, name: 'クリスタル映像' }, { id: 6524, name: 'ビビアン' },
  { id: 3784, name: 'エムズビデオグループ' }, { id: 40005, name: 'ワープエンタテインメント' }, { id: 40037, name: 'シネマジック' },
  { id: 45103, name: '溜池ゴロー' }, { id: 5665, name: 'ROOKIE' }, { id: 45700, name: 'BALTAN' },
  { id: 40571, name: 'JUKUJO99' }, { id: 45302, name: "OFFICE K'S" }, { id: 45667, name: 'EROTICA' },
  { id: 6732, name: 'ロイヤル' }, { id: 40071, name: 'ケイ・エム・プロデュース' }, { id: 306170, name: 'なまなま' },
]
const FLOORS = [['digital', 'videoa'], ['mono', 'dvd']]
const EXCLUDED_GENRES = new Set(['イメージビデオ'])           // dmm.ts:370 と同一
const isExcluded = (it) => it.iteminfo?.genre?.some(g => EXCLUDED_GENRES.has(g.name)) ?? false
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const secs = (ms) => (ms / 1000).toFixed(1)
// JST(+09:00) ISO 例: 2026-07-08T00:30:00+09:00（cron.log を JST で読めるように）
const jstIso = (d = new Date()) => new Date(d.getTime() + 9 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '') + '+09:00'

// ── buildSlug（dmm.ts:466-475 と逐語一致）────────────────────────────────────
function buildSlug(title, contentId) {
  const base = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60)
  return `${base}-${contentId}`
}
// ── normalizeDmmItem（dmm.ts:378-435 と逐語一致）─────────────────────────────
function normalizeDmmItem(item, floor = 'videoa') {
  const genres = item.iteminfo?.genre?.map(g => g.name) ?? []
  const actresses = item.iteminfo?.actress?.map(a => a.name) ?? []
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

// ── DMM ItemList ─────────────────────────────────────────────────────────────
async function fetchMakerFloor(makerId, service, floor) {
  const qs = new URLSearchParams({
    api_id: DMM_API_ID, affiliate_id: AFFILIATE_ID, site: 'FANZA',
    service, floor, hits: '100', offset: '1', sort: 'date',
    article: 'maker', article_id: String(makerId), output: 'json',
  })
  const res = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${qs}`, { cache: 'no-store' })
  const text = await res.text()
  if (!res.ok) throw new Error(`DMM HTTP ${res.status}: ${text.slice(0, 120)}`)
  const r = JSON.parse(text).result
  if (r.status !== 200) throw new Error(`DMM status ${r.status}: ${r.message ?? ''}`)
  return r.items ?? []
}

// ── Supabase PostgREST（直叩き・supabase-js不要）─────────────────────────────
const SB_HEADERS = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' }
async function selectExisting(cids) {
  const found = new Set()
  for (let i = 0; i < cids.length; i += 100) {
    const chunk = cids.slice(i, i + 100)
    const inList = chunk.map(c => `"${c}"`).join(',')
    const url = `${SB_URL}/rest/v1/articles?select=external_id&external_id=in.(${encodeURIComponent(inList)})`
    const res = await fetch(url, { headers: SB_HEADERS })
    if (!res.ok) throw new Error(`SELECT HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`)
    for (const row of await res.json()) found.add(row.external_id)
  }
  return found
}
async function insertRows(records) {
  // on_conflict=external_id + ignore-duplicates → 既存行は不触（新規のみ）
  const url = `${SB_URL}/rest/v1/articles?on_conflict=external_id`
  let ok = 0
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100)
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...SB_HEADERS, Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) throw new Error(`INSERT HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
    ok += chunk.length
  }
  return ok
}

// ── メイン ───────────────────────────────────────────────────────────────────
const t0 = Date.now()
const startedAt = jstIso()
console.log(`\nSTART maker-sync started_at=${startedAt} mode=${APPLY ? 'APPLY' : 'DRY'} makers=${MAKERS.length} host=${new URL(SB_URL).host}`)
const g = { fetched: 0, unique: 0, existing: 0, neu: 0, inserted: 0, excluded: 0, errors: 0 }
const failures = []

for (let i = 0; i < MAKERS.length; i++) {
  const mk = MAKERS[i]
  const idx = `[${i + 1}/${MAKERS.length}]`
  const byCid = new Map()          // content_id -> {item, floor}（digital 先行優先）
  let makerExcluded = 0

  // ── Step 1: 両floor取得（floor単位でログ。1floor失敗しても次floorへ）─────────
  for (const [service, floor] of FLOORS) {
    const tf = Date.now()
    try {
      const items = await fetchMakerFloor(mk.id, service, floor)
      let exc = 0
      for (const it of items) {
        if (isExcluded(it)) { exc++; continue }
        if (!byCid.has(it.content_id)) byCid.set(it.content_id, { item: it, floor })
      }
      makerExcluded += exc; g.fetched += items.length; g.excluded += exc
      console.log(`${idx} ${mk.name} id=${mk.id} floor=${service}/${floor} fetched=${items.length} excluded=${exc} elapsed=${secs(Date.now() - tf)}s`)
    } catch (err) {
      g.errors++
      failures.push({ maker: mk.name, id: mk.id, floor: `${service}/${floor}`, error: String(err.message ?? err) })
      console.log(`FAILED maker-sync maker=${mk.name} id=${mk.id} floor=${service}/${floor} error=${String(err.message ?? err)}`)
    }
    await sleep(250)
  }

  // ── Step 2: このメーカー分を逐次処理（未登録のみ INSERT）──────────────────────
  const cids = [...byCid.keys()]
  g.unique += cids.length
  try {
    const existing = cids.length ? await selectExisting(cids) : new Set()
    const missing = cids.filter(c => !existing.has(c))
    const records = missing.map(c => normalizeDmmItem(byCid.get(c).item, byCid.get(c).floor))
    g.existing += existing.size; g.neu += missing.length

    let inserted = 0
    if (APPLY && records.length) inserted = await insertRows(records)
    g.inserted += inserted
    console.log(`${idx} -> ${mk.name} id=${mk.id} unique=${cids.length} existing=${existing.size} new=${missing.length} inserted=${APPLY ? inserted : 0}${APPLY ? '' : '(dry)'} excluded=${makerExcluded}`)
  } catch (err) {
    g.errors++
    failures.push({ maker: mk.name, id: mk.id, floor: 'db', error: String(err.message ?? err) })
    console.log(`FAILED maker-sync maker=${mk.name} id=${mk.id} stage=db error=${String(err.message ?? err)}`)
  }
}

// ── サマリー ─────────────────────────────────────────────────────────────────
console.log(
  `DONE maker-sync mode=${APPLY ? 'APPLY' : 'DRY'} makers=${MAKERS.length} ` +
  `fetched=${g.fetched} unique=${g.unique} existing=${g.existing} new=${g.neu} ` +
  `inserted=${APPLY ? g.inserted : 0}${APPLY ? '' : '(dry)'} excluded=${g.excluded} errors=${g.errors} ` +
  `started_at=${startedAt} finished_at=${jstIso()} elapsed=${secs(Date.now() - t0)}s`
)
if (failures.length) {
  console.log(`maker-sync failures (${failures.length}):`)
  for (const f of failures) console.log(`  - ${f.maker} id=${f.id} ${f.floor} :: ${f.error}`)
}
process.exit(g.errors > 0 ? 1 : 0)
