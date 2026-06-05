// DMM MakerSearch API で全メーカーを取得してmakers.tsの配列を出力するスクリプト
// Usage: node scripts/fetch-makers.mjs > /tmp/makers-output.txt

import https from 'node:https'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// .env.local を手動パース
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const API_ID       = process.env.DMM_API_ID
const AFFILIATE_ID = process.env.AFFILIATE_ID
const BASE = 'api.dmm.com'

if (!API_ID || !AFFILIATE_ID) {
  console.error('DMM_API_ID / AFFILIATE_ID が未設定'); process.exit(1)
}

function get(path) {
  return new Promise((ok, ng) => {
    const opts = { hostname: BASE, path, rejectUnauthorized: false }
    https.get(opts, res => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { ok({ status: res.statusCode, json: JSON.parse(d) }) }
        catch { ng(new Error('JSON parse error: ' + d.slice(0, 200))) }
      })
    }).on('error', ng)
  })
}

// FloorList で floor_id を取得
async function getFloors() {
  const qs = new URLSearchParams({
    api_id: API_ID, affiliate_id: AFFILIATE_ID, site: 'FANZA', output: 'json'
  })
  const { status, json } = await get(`/affiliate/v3/FloorList?${qs}`)
  if (status !== 200) { console.error('FloorList error:', status, JSON.stringify(json).slice(0,200)); return [] }

  const floors = []
  for (const site of json.result?.site ?? []) {
    for (const svc of site.service ?? []) {
      for (const fl of svc.floor ?? []) {
        floors.push({ id: String(fl.id), code: fl.code, name: fl.name, service: svc.code })
      }
    }
  }
  return floors
}

// MakerSearch で指定 floor の全メーカーを取得（ページネーション対応）
async function getMakers(floorId, label) {
  const results = []
  let offset = 1
  const HITS = 100

  while (true) {
    const qs = new URLSearchParams({
      api_id: API_ID, affiliate_id: AFFILIATE_ID,
      floor_id: String(floorId), hits: String(HITS),
      offset: String(offset), output: 'json'
    })
    const { status, json } = await get(`/affiliate/v3/MakerSearch?${qs}`)
    if (status !== 200) {
      console.error(`MakerSearch floor_id=${floorId} HTTP ${status}:`, JSON.stringify(json).slice(0,200))
      break
    }

    const r = json.result ?? {}
    // API returns nested structure
    const items = r.maker ?? r.makers ?? r.items ?? []
    if (!Array.isArray(items) || items.length === 0) {
      console.error(`  ${label} floor_id=${floorId}: items empty (result keys: ${Object.keys(r).join(',')})`)
      break
    }

    for (const m of items) {
      const id   = m.maker_id ?? m.id ?? m.makerId
      const name = m.name ?? m.maker_name
      if (id && name) results.push({ id: Number(id), name: String(name) })
    }
    console.error(`  ${label}: offset=${offset} got=${items.length} cumulative=${results.length}`)
    if (items.length < HITS) break
    offset += HITS
  }
  return results
}

// ── 実行 ──────────────────────────────────────────────────────────────────────

const floors = await getFloors()
console.error('FloorList floors (FANZA):')
for (const f of floors) {
  console.error(`  id=${f.id} code=${f.code} service=${f.service} name=${f.name}`)
}

// videoa と dvd の floor_id を特定
const videoaFloor = floors.find(f => f.code === 'videoa' && f.service === 'digital')
const dvdFloor    = floors.find(f => f.code === 'dvd'    && f.service === 'mono')

console.error('\nvideoa floor:', videoaFloor ?? '(not found)')
console.error('dvd floor:', dvdFloor ?? '(not found)')

const allMakers = new Map()

if (videoaFloor) {
  console.error('\n--- videoa makers ---')
  const makers = await getMakers(videoaFloor.id, 'videoa')
  for (const m of makers) allMakers.set(m.id, m)
  console.error(`videoa: ${makers.length}社`)
}

if (dvdFloor) {
  console.error('\n--- dvd makers ---')
  const makers = await getMakers(dvdFloor.id, 'dvd')
  let added = 0
  for (const m of makers) {
    if (!allMakers.has(m.id)) { allMakers.set(m.id, m); added++ }
  }
  console.error(`dvd: ${makers.length}社 (新規追加: ${added}社)`)
}

const sorted = [...allMakers.values()].sort((a, b) =>
  a.name.localeCompare(b.name, 'ja'))

console.error(`\n★ 総メーカー数: ${sorted.length}社`)
console.error('ID一覧:', sorted.map(m => `${m.id}:${m.name}`).join(' | '))
