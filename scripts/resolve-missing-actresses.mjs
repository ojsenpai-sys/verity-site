/**
 * エンゲージメントのある未登録女優を一括で名前解決＋actresses登録
 *
 * ダッシュボード等で「女優 #<id>」になる原因＝actresses未登録の女優を一掃する。
 * 候補は実エンゲージメントのある女優に限定（カタログ全件は登録しない）:
 *   - user_events.actress_view の target_id（= dmm-actress-<id>）
 *   - user_events.video_view / fanza_click の target_id（= 作品ext_id）
 *       → その作品の metadata.actress から女優IDを抽出（名前も同時取得）
 *
 * 名前解決: 作品メタ優先 → DMM ActressSearch → 作品メタ全文スキャン
 *
 * 使い方:
 *   node scripts/resolve-missing-actresses.mjs        # 解決＋登録
 *   node scripts/resolve-missing-actresses.mjs --dry  # 解決のみ（登録しない）
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(filePath) {
  try {
    for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch { /* ignore */ }
}
loadEnv('.env.local'); loadEnv('.env')

const DMM_API_ID   = process.env.DMM_API_ID
const AFFILIATE_ID = process.env.AFFILIATE_ID
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!DMM_API_ID || !AFFILIATE_ID || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ 環境変数不足: DMM_API_ID / AFFILIATE_ID / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const DRY = process.argv.includes('--dry')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const PAGE = 1000

const isActressExt = (s) => typeof s === 'string' && /^dmm-actress-\d+$/.test(s)
const idOf = (ext) => ext.replace('dmm-actress-', '')

// ── 全行ページング取得 ─────────────────────────────────────────────────────────
async function fetchAll(table, column, orderCol, filter) {
  const out = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(column).order(orderCol, { ascending: true }).range(from, from + PAGE - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}.${column}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return out
}

async function fetchActressFromDmm(id) {
  const qs = new URLSearchParams({
    api_id: DMM_API_ID, affiliate_id: AFFILIATE_ID,
    site: 'FANZA', output: 'json', hits: '1', actress_id: String(id),
  })
  try {
    const res = await fetch(`https://api.dmm.com/affiliate/v3/ActressSearch?${qs}`, { cache: 'no-store' })
    if (!res.ok) return null
    const j = await res.json()
    if (j.result?.status !== 200 || !j.result?.items?.length) return null
    const i = j.result.items[0]
    return { name: i.name ?? null, ruby: i.ruby ?? null, image: i.imageURL?.large ?? i.imageURL?.small ?? null }
  } catch { return null }
}

async function scanArticleForName(id) {
  const { data } = await supabase
    .from('articles').select('metadata')
    .contains('metadata', { actress: [{ id: Number(id) }] }).limit(1)
  for (const art of data ?? []) {
    const hit = (art.metadata?.actress ?? []).find(a => Number(a?.id) === Number(id))
    if (hit?.name) return hit.name
  }
  return null
}

// ── メイン ───────────────────────────────────────────────────────────────────
console.log('═'.repeat(60))
console.log(`  未登録女優 一括解決${DRY ? '  (DRY RUN)' : ''}`)
console.log('═'.repeat(60))

// 1) 既存 actresses
console.log('\n[1/5] 既存 actresses 読込...')
const existRows = await fetchAll('actresses', 'external_id', 'external_id')
const existing = new Set(existRows.map(r => r.external_id))
console.log(`  既存: ${existing.size}名`)

// 2) actress_view の女優ID
console.log('[2/5] actress_view target_id 収集...')
const avRows = await fetchAll('user_events', 'target_id', 'created_at',
  q => q.eq('event_name', 'actress_view').not('target_id', 'is', null))
const candidates = new Set()
for (const r of avRows) if (isActressExt(r.target_id)) candidates.add(r.target_id)
console.log(`  actress_view 由来: ${candidates.size}名（events ${avRows.length}件）`)

// 3) video_view / fanza_click の作品ID
console.log('[3/5] video_view / fanza_click target_id 収集...')
const vfRows = await fetchAll('user_events', 'target_id', 'created_at',
  q => q.in('event_name', ['video_view', 'fanza_click']).not('target_id', 'is', null))
const engagedArticleIds = [...new Set(vfRows.map(r => r.target_id).filter(Boolean))]
console.log(`  エンゲージ作品: ${engagedArticleIds.length}件（events ${vfRows.length}件）`)

// 4) 作品メタから女優ID＋名前
console.log('[4/5] 作品メタから女優抽出...')
const nameMap = new Map()   // ext_id → name
for (let i = 0; i < engagedArticleIds.length; i += 200) {
  const chunk = engagedArticleIds.slice(i, i + 200)
  const { data, error } = await supabase.from('articles').select('external_id, metadata').in('external_id', chunk)
  if (error) { console.warn(`  articles chunk error: ${error.message}`); continue }
  for (const art of data ?? []) {
    for (const a of (art.metadata?.actress ?? [])) {
      if (!a?.id) continue
      const ext = `dmm-actress-${a.id}`
      candidates.add(ext)
      if (a.name && !nameMap.has(ext)) nameMap.set(ext, a.name)
    }
  }
}
console.log(`  候補女優 合計: ${candidates.size}名 / メタ名解決済 ${nameMap.size}名`)

// 5) 未登録の差分を解決
const missing = [...candidates].filter(ext => !existing.has(ext))
console.log(`[5/5] 未登録 ${missing.length}名 を解決中...\n`)

const resolved = []     // {ext, id, name, image, src}
const unresolved = []   // ext
let apiCalls = 0
for (const ext of missing) {
  const id = idOf(ext)
  let name = nameMap.get(ext) ?? null
  let image = null
  let src = 'meta'
  if (!name) {
    const dmm = await fetchActressFromDmm(id); apiCalls++
    if (dmm?.name) { name = dmm.name; image = dmm.image; src = 'dmm' }
    if (!name) { name = await scanArticleForName(id); src = 'scan' }
    await sleep(250)
  }
  if (name) resolved.push({ ext, id, name, image, src })
  else unresolved.push(ext)
}
console.log(`  解決: ${resolved.length}名 / 未解決: ${unresolved.length}名（ActressSearch呼出 ${apiCalls}回）`)

// 6) 一括 UPSERT
if (!DRY && resolved.length > 0) {
  const records = resolved.map(r => ({
    external_id: r.ext, name: r.name, ruby: null,
    image_url: r.image ?? null, is_active: true, metadata: { dmm_id: Number(r.id) },
  }))
  let ok = 0
  for (let i = 0; i < records.length; i += 100) {
    const chunk = records.slice(i, i + 100)
    const { error } = await supabase.from('actresses').upsert(chunk, { onConflict: 'external_id' })
    if (error) console.error(`  ❌ upsert [${i}]: ${error.message}`)
    else ok += chunk.length
  }
  console.log(`\n✓ actresses UPSERT: ${ok}名`)
} else if (DRY) {
  console.log('\n(--dry のため書き込みスキップ)')
}

// 7) 一覧出力
console.log('\n' + '═'.repeat(60))
console.log(`  登録した女優一覧（${resolved.length}名）`)
console.log('═'.repeat(60))
resolved.sort((a, b) => a.name.localeCompare(b.name, 'ja'))
for (const r of resolved) console.log(`  ${r.name}  (${r.ext})  [${r.src}]`)
if (unresolved.length > 0) {
  console.log('\n' + '─'.repeat(60))
  console.log(`  ⚠️ 名前未解決（廃止/非公開ID等・手動確認）: ${unresolved.length}名`)
  console.log('─'.repeat(60))
  for (const ext of unresolved) console.log(`  ${ext}`)
}
console.log('\n=== 完了 ===')
