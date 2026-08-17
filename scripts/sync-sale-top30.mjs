#!/usr/bin/env node
// ═════════════════════════════════════════════════════════════════════════════
// sync-sale-top30.mjs — VERITY SALE TOP30 同期バッチ（Phase C-1 本実装）
// ═════════════════════════════════════════════════════════════════════════════
// 概要:
//   DMM Affiliate API (floor=videoa, sort=rank) を offset走査し、現在有効な
//   campaign を持つ作品を収集 → VERITY articles に既存の作品（local-known）だけに
//   絞り込み → VERITY SALE SCORE v1 でスコアリング → diversity制御(同一女優<=2,
//   同一メーカー<=4)でTOP30を確定 → public.sale_top30_snapshots へ atomic 反映。
//
// 使い方:
//   node scripts/sync-sale-top30.mjs             # dry-run（既定）。DB書き込みなし
//   node scripts/sync-sale-top30.mjs --apply     # 検証を全て通過した場合のみ snapshot 更新
//
// 前提: supabase/migrations/049_sale_top30_snapshots.sql がレビュー・本番適用済みであること。
//   未適用の場合、現在snapshotの読み取りは「ベースラインなし(初回)」として扱われ dry-run は
//   継続するが、--apply は RPC 呼び出し失敗により必ず fail-closed で中止される
//   （＝migration未適用の状態で誤って書き込みが発生することはない）。
//
// env 取得順（未設定キーのみ補完）: process.env → ./.env.local → ./.env →
//   ./ecosystem.config.js の apps[].env（本番の権威ソース）。maker-sync.mjs と同一idiom。
//   必要キー: DMM_API_ID, AFFILIATE_ID, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// 依存: なし（Node v18+ の global fetch + scripts/lib/sale-top30-core.mjs のみ）。
// ═════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  filterActiveCampaigns,
  dedupeByCid,
  computeSaleScoreV1,
  selectDiversifiedTop30,
  validateSnapshotRows,
  diffSnapshots,
  SALE_SCORE_V1_WEIGHTS,
} from './lib/sale-top30-core.mjs'

const ARGV = process.argv.slice(2)
const APPLY = ARGV.includes('--apply')
const CWD = process.cwd()

const SNAPSHOT_KEY = 'fanza_sale_top30'
const POSITION_CARD = 'sale_top30'       // Analytics: 既存fanza_click position（カード）
const POSITION_CTA = 'sale_top30_cta'    // Analytics: 既存fanza_click position（一覧CTA）— 参照用定数。実発火はフロント側FanzaLinkが担う。

// ── env ローダ（maker-sync.mjs / generate-weekly-rankings.mjs と同一idiom）──────
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
  if (!v) { console.error(`FATAL sync-sale-top30 missing env ${k}`); process.exit(2) }
}
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }

// abort() は「fail-closed条件に該当したので --apply を中止する」ための唯一の出口。
// dry-runでは理由を表示するだけで継続表示は行う（診断情報として有用なため）。
function abort(reason, detail) {
  console.error(`\n[ABORT] reason=${reason}${detail ? ` — ${detail}` : ''}`)
  console.error('[ABORT] no DB write performed. previous snapshot (if any) remains untouched.')
  process.exit(2)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) DMM API crawl — sort=rank固定・収束判定 + 安全弁(最大offset)
// ─────────────────────────────────────────────────────────────────────────────
const MAX_OFFSET = 5000          // 安全弁: どれだけ収束が遅くてもこれ以上は走査しない(無限走査禁止)
const PLATEAU_STREAK = 3         // 新規流入 <=1件 が連続でこの回数続いたら収束とみなす

async function fetchDmmPage(sort, offset, hits = 100) {
  const qs = new URLSearchParams({
    api_id: DMM_API_ID, affiliate_id: AFFILIATE_ID, site: 'FANZA',
    service: 'digital', floor: 'videoa', hits: String(hits), offset: String(offset), output: 'json', sort,
  })
  const res = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${qs}`)
  if (!res.ok) throw new Error(`DMM API HTTP ${res.status}`)
  const json = JSON.parse(await res.text())
  if (json.result?.status && json.result.status !== 200) throw new Error(`DMM API result.status=${json.result.status}: ${json.result.message ?? ''}`)
  return json.result?.items ?? []
}

async function crawlSaleCandidates(now) {
  const found = new Map()
  let requestCount = 0
  let plateauStreak = 0
  const t0 = Date.now()

  for (let offset = 1; offset < MAX_OFFSET; offset += 100) {
    const items = await fetchDmmPage('rank', offset, 100)
    requestCount++
    let newThisPage = 0
    for (const it of items) {
      const active = filterActiveCampaigns(it.campaign, now)
      if (active.length > 0 && !found.has(it.content_id)) {
        newThisPage++
        found.set(it.content_id, { ...it, _activeCampaigns: active })
      }
    }
    if (newThisPage <= 1) {
      plateauStreak++
      if (plateauStreak >= PLATEAU_STREAK) break
    } else {
      plateauStreak = 0
    }
    if (items.length === 0) break // API側の総件数を使い切った
    await new Promise((r) => setTimeout(r, 250))
  }

  const candidates = dedupeByCid([...found.values()])
  return { candidates, requestCount, durationMs: Date.now() - t0, hitMaxOffset: requestCount * 100 >= MAX_OFFSET }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2) local-known 絞り込み（N+1禁止・batched IN(...)）
// ─────────────────────────────────────────────────────────────────────────────
function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

async function sbSelect(table, params) {
  const qs = new URLSearchParams(params)
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${qs}`, { headers: H })
  const body = await res.json()
  if (!res.ok) {
    const msg = body?.message ?? body?.error ?? JSON.stringify(body).slice(0, 200)
    throw new Error(`Supabase read failed on ${table}: HTTP ${res.status} — ${msg}`)
  }
  return body
}

async function filterLocalKnown(candidates) {
  const cids = candidates.map((c) => c.content_id)
  const known = new Set()
  for (const b of chunk(cids, 40)) {
    // 既存articles規約に合わせ is_active=true のみ対象（DVD派生等の非アクティブ行は自然に除外される）
    const rows = await sbSelect('articles', { select: 'external_id', is_active: 'eq.true', external_id: `in.(${b.join(',')})` })
    for (const r of rows) known.add(r.external_id)
  }
  return candidates.filter((c) => known.has(c.content_id))
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) 特徴量構築（fanza_click / video_view / actress人気）
// ─────────────────────────────────────────────────────────────────────────────
async function buildFeatures(candidates, now) {
  const cids = candidates.map((c) => c.content_id)
  const since30d = new Date(now.getTime() - 30 * 86400000).toISOString()

  const fanzaClickCounts = new Map()
  for (const b of chunk(cids, 40)) {
    const rows = await sbSelect('user_events', { select: 'target_id', event_name: 'eq.fanza_click', target_type: 'eq.article', created_at: `gte.${since30d}`, target_id: `in.(${b.join(',')})` })
    for (const r of rows) fanzaClickCounts.set(r.target_id, (fanzaClickCounts.get(r.target_id) || 0) + 1)
  }
  const videoViewCounts = new Map()
  for (const b of chunk(cids, 40)) {
    const rows = await sbSelect('user_events', { select: 'target_id', event_name: 'eq.video_view', target_type: 'eq.article', created_at: `gte.${since30d}`, target_id: `in.(${b.join(',')})` })
    for (const r of rows) videoViewCounts.set(r.target_id, (videoViewCounts.get(r.target_id) || 0) + 1)
  }

  // 出演女優人気: weekly_rankings(actress/rising, 最新確定週) + actress_ranking_cache(最新snapshot)
  const actressExtIds = new Set()
  for (const c of candidates) for (const a of c.iteminfo?.actress ?? []) actressExtIds.add(`dmm-actress-${a.id}`)
  const actressMap = new Map() // external_id -> {id}
  for (const b of chunk([...actressExtIds], 40)) {
    const rows = await sbSelect('actresses', { select: 'id,external_id', external_id: `in.(${b.join(',')})` })
    for (const r of rows) actressMap.set(r.external_id, r)
  }
  const latestWeekRows = await sbSelect('weekly_rankings', { select: 'week_key', order: 'week_key.desc', limit: '1' })
  const latestWeek = latestWeekRows[0]?.week_key
  let wrByExt = new Map()
  if (latestWeek) {
    const rows = await sbSelect('weekly_rankings', { select: 'ranking_type,rank,entity_id', week_key: `eq.${latestWeek}`, ranking_type: 'in.(actress,rising)' })
    for (const r of rows) wrByExt.set(`${r.ranking_type}:${r.entity_id}`, r)
  }
  const arcSnapRows = await sbSelect('actress_ranking_cache', { select: 'snapshot_date', order: 'snapshot_date.desc', limit: '1' })
  const arcSnap = arcSnapRows[0]?.snapshot_date
  let arcByUuid = new Map()
  if (arcSnap) {
    const rows = await sbSelect('actress_ranking_cache', { select: 'rank,actress_id', snapshot_date: `eq.${arcSnap}` })
    for (const r of rows) arcByUuid.set(r.actress_id, r)
  }

  return candidates.map((c) => {
    const cid = c.content_id
    const priceNum = parseFloat((c.prices?.price || '0').replace(/[^\d.]/g, '')) || null
    const listPriceNum = parseFloat((c.prices?.list_price || '0').replace(/[^\d.]/g, '')) || null
    const discountPct = priceNum && listPriceNum && listPriceNum > 0 ? Math.round((1 - priceNum / listPriceNum) * 100) : 0
    const campaign = c._activeCampaigns[0]
    const publishedAt = c.date ? new Date(c.date.replace(/\//g, '-').replace(' ', 'T') + '+09:00') : null
    const ageDays = publishedAt ? Math.round((now - publishedAt) / 86400000) : null

    const primaryActressExtId = c.iteminfo?.actress?.[0] ? `dmm-actress-${c.iteminfo.actress[0].id}` : null
    const actressLocal = primaryActressExtId ? actressMap.get(primaryActressExtId) : null
    const wrActress = primaryActressExtId ? wrByExt.get(`actress:${primaryActressExtId}`) : null
    const wrRising = primaryActressExtId ? wrByExt.get(`rising:${primaryActressExtId}`) : null
    const arc = actressLocal ? arcByUuid.get(actressLocal.id) : null
    const bestRank = [wrActress?.rank, wrRising?.rank, arc?.rank].filter((r) => r != null)
    const actressScoreRaw = bestRank.length ? Math.max(0, 11 - Math.min(...bestRank)) : 0

    return {
      cid, title: c.title,
      actresses: (c.iteminfo?.actress ?? []).map((a) => a.name),
      maker: c.iteminfo?.maker?.[0]?.name ?? null,
      price: priceNum, listPrice: listPriceNum, discountPct,
      campaignTitle: campaign?.title ?? null, campaignEndsAt: campaign?.date_end ?? null,
      ageDays,
      fanzaClick30d: fanzaClickCounts.get(cid) || 0,
      videoView30d: videoViewCounts.get(cid) || 0,
      actressScoreRaw,
      // v1では加点しない指標（reserved for v2, weight=0で常に0寄与）
      favoriteCount: 0,
      weeklyWorkScoreRaw: 0,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 4) snapshot 読み取り（diff用）／RPC呼び出し（--apply）
// ─────────────────────────────────────────────────────────────────────────────
async function readCurrentSnapshot() {
  const res = await fetch(`${SB_URL}/rest/v1/sale_top30_snapshots?select=rank,external_id&snapshot_key=eq.${SNAPSHOT_KEY}&order=rank.asc`, { headers: H })
  if (res.status === 404 || res.status === 400) return { rows: null, tableExists: false } // migration未適用
  const body = await res.json()
  if (!res.ok) {
    const msg = JSON.stringify(body).slice(0, 200)
    if (/relation .* does not exist/i.test(msg)) return { rows: null, tableExists: false }
    throw new Error(`Supabase read failed on sale_top30_snapshots: HTTP ${res.status} — ${msg}`)
  }
  return { rows: body, tableExists: true }
}

async function applySnapshot(rows) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/apply_sale_top30_snapshot`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_snapshot_key: SNAPSHOT_KEY, p_rows: rows }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = body?.message ?? JSON.stringify(body ?? {}).slice(0, 300)
    throw new Error(`RPC apply_sale_top30_snapshot failed: HTTP ${res.status} — ${msg}`)
  }
  return body
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date()
  console.log(`[sync-sale-top30] mode=${APPLY ? 'APPLY' : 'dry-run'} weights=${JSON.stringify(SALE_SCORE_V1_WEIGHTS)}`)

  // ── crawl ──
  let crawl
  try {
    crawl = await crawlSaleCandidates(now)
  } catch (e) {
    return abort('dmm_api_failure', e.message)
  }
  const { candidates, requestCount, durationMs, hitMaxOffset } = crawl
  console.log(`[crawl] requests=${requestCount} durationMs=${durationMs} activeSaleCount=${candidates.length}${hitMaxOffset ? ' (WARNING: hit MAX_OFFSET safety valve before full convergence)' : ''}`)
  if (candidates.length === 0) return abort('active_sale_zero', 'DMM API returned 0 items with an active campaign')

  // ── local-known filter ──
  let localKnown
  try {
    localKnown = await filterLocalKnown(candidates)
  } catch (e) {
    return abort('supabase_read_failure', e.message)
  }
  console.log(`[local-known] ${localKnown.length}/${candidates.length} candidates exist in VERITY articles (is_active=true)`)
  if (localKnown.length < 30) return abort('local_known_below_30', `only ${localKnown.length} local-known candidates (need >=30 to have any chance at a full TOP30)`)

  // ── features + score ──
  let features
  try {
    features = await buildFeatures(localKnown, now)
  } catch (e) {
    return abort('supabase_read_failure', e.message)
  }
  const scored = computeSaleScoreV1(features)
  if (scored.some((s) => !Number.isFinite(s.score))) return abort('score_nan', 'one or more candidates produced a non-finite score')
  console.log(`[score] ${scored.length} candidates scored (VERITY SALE SCORE v1)`)

  // ── diversity selection ──
  const { selected, skippedCount, shortfall, maxSameActress, maxSameMaker } = selectDiversifiedTop30(scored, { maxPerActress: 2, maxPerMaker: 4, targetCount: 30 })
  console.log(`[diversity] selected=${selected.length} skipped=${skippedCount} maxSameActress=${maxSameActress} maxSameMaker=${maxSameMaker}`)
  if (shortfall) {
    return abort('top30_below_30_after_diversity', `only ${selected.length}/30 selected after diversity caps (maxPerActress=2, maxPerMaker=4) — refusing to relax caps automatically`)
  }

  const nextRows = selected.map((r, i) => ({
    rank: i + 1,
    external_id: r.cid,
    score: r.score,
    discount_pct: r.discountPct,
    price: r.price,
    list_price: r.listPrice,
    campaign_title: r.campaignTitle,
    campaign_ends_at: r.campaignEndsAt,
    metadata: { title: r.title, actress: r.actresses[0] ?? null, maker: r.maker },
  }))

  const validation = validateSnapshotRows(nextRows, 30)
  if (!validation.valid) return abort('validation_failed', validation.errors.join('; '))

  // ── current snapshot + diff (read-only, always shown) ──
  let current
  try {
    current = await readCurrentSnapshot()
  } catch (e) {
    return abort('supabase_read_failure', e.message)
  }
  const diff = diffSnapshots(current.rows, nextRows.map((r) => ({ rank: r.rank, external_id: r.external_id })))
  const expiredSoon = selected.filter((r) => r.campaignEndsAt && new Date(r.campaignEndsAt.replace(' ', 'T') + '+09:00') < new Date(now.getTime() + 6 * 3600000))

  console.log(`\n=== new TOP30 (VERITY SALE SCORE v1) ===`)
  nextRows.forEach((r, i) => console.log(`${i + 1}. ${r.external_id}  score=${r.score}  disc=${r.discount_pct}%  campaign="${r.campaign_title}" ends=${r.campaign_ends_at}`))

  console.log(`\n=== current snapshot ===`)
  if (!current.tableExists) console.log('  (sale_top30_snapshots table does not exist yet — migration 049 not applied. Treating as no baseline.)')
  else if (!current.rows || current.rows.length === 0) console.log('  (no rows — first run)')
  else current.rows.forEach((r) => console.log(`  ${r.rank}. ${r.external_id}`))

  console.log(`\n=== diff ===`)
  console.log(`  added:        ${diff.added.length} ${JSON.stringify(diff.added)}`)
  console.log(`  removed:      ${diff.removed.length} ${JSON.stringify(diff.removed)}`)
  console.log(`  rank_changed: ${diff.rankChanged.length}`)
  console.log(`  campaign_expiring_within_6h: ${expiredSoon.length} ${JSON.stringify(expiredSoon.map((r) => r.cid))}`)
  console.log(`  isEmpty (no-op if applied): ${diff.isEmpty}`)

  const avgDiscount = selected.reduce((s, r) => s + (r.discountPct || 0), 0) / selected.length
  const avgAgeDays = selected.reduce((s, r) => s + (r.ageDays || 0), 0) / selected.length
  console.log(`\n[summary] api_requests=${requestCount} duration_ms=${durationMs} active_sale=${candidates.length} local_known=${localKnown.length} score_candidates=${scored.length} diversity_skipped=${skippedCount} final_top30=${selected.length} avg_discount_pct=${avgDiscount.toFixed(1)} avg_age_days=${avgAgeDays.toFixed(0)}`)

  if (!APPLY) {
    console.log('\n[dry-run] no DB writes performed.')
    return
  }

  // ── apply ──
  if (!current.tableExists) return abort('migration_not_applied', 'sale_top30_snapshots table does not exist — apply 049 migration first')
  if (diff.isEmpty && current.rows && current.rows.length === 30) {
    console.log('\n[apply] diff is empty — skipping write (0 DB writes), exiting successfully.')
    return
  }
  try {
    const result = await applySnapshot(nextRows)
    console.log('\n[apply] success:', JSON.stringify(result))
  } catch (e) {
    return abort('rpc_failure', e.message)
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(1) })
