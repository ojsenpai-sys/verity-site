/**
 * デビュー作品タグ保有記事から未登録女優を一括登録するパッチスクリプト
 *
 * 対象期間: 2026-03-01 〜 2026-08-31（予約作を含む）
 * 処理: articles テーブルの tags に 'デビュー' を含む作品を走査し、
 *       出演女優が actresses テーブルに未登録または is_active=false の場合に修正する。
 *
 * Usage: node scripts/patch-debut-actresses.mjs
 */

import { readFileSync } from 'node:fs'
import { resolve }      from 'node:path'
import https            from 'node:https'

// .env.local を手動パース
const envText = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (m) process.env[m[1]] = m[2].trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DMM_API_ID   = process.env.DMM_API_ID
const AFFILIATE_ID = process.env.AFFILIATE_ID

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Supabase env vars missing'); process.exit(1) }
if (!DMM_API_ID || !AFFILIATE_ID)   { console.error('DMM env vars missing');      process.exit(1) }

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function httpsRequest(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }) }
        catch { resolve({ status: res.statusCode, body: data }) }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function supabaseGet(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const { status, body } = await httpsRequest(url, {
    method: 'GET',
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer:        'return=representation',
    },
  })
  if (status >= 400) throw new Error(`GET ${path} → ${status}: ${JSON.stringify(body)}`)
  return body
}

async function supabasePost(path, payload, method = 'POST', extraHeaders = {}) {
  const url  = `${SUPABASE_URL}/rest/v1/${path}`
  const body = JSON.stringify(payload)
  const { status, body: resBody } = await httpsRequest(url, {
    method,
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(body),
      Prefer:          'resolution=ignore-duplicates,return=representation',
      ...extraHeaders,
    },
  }, body)
  if (status >= 400) throw new Error(`${method} ${path} → ${status}: ${JSON.stringify(resBody)}`)
  return resBody
}

// ─── DMM ActressSearch ────────────────────────────────────────────────────────

async function fetchActressImage(actressId) {
  const qs = new URLSearchParams({
    api_id:       DMM_API_ID,
    affiliate_id: AFFILIATE_ID,
    site:         'FANZA',
    output:       'json',
    hits:         '1',
    actress_id:   String(actressId),
  })
  try {
    const url = `https://api.dmm.com/affiliate/v3/ActressSearch?${qs}`
    const { status, body } = await httpsRequest(url)
    if (status !== 200) return null
    const item = body?.result?.items?.[0]
    return item?.imageURL?.large ?? item?.imageURL?.small ?? null
  } catch {
    return null
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== デビュー女優パッチスクリプト開始 ===')
  console.log(`対象期間: 2026-03-01 〜 2026-08-31`)

  // ── 1. 対象期間の記事を取得（最大2000件）─────────────────────────────────
  const startDate  = '2026-03-01T00:00:00+09:00'
  const endDate    = '2026-08-31T23:59:59+09:00'

  let articles = []
  let offset   = 0
  const PAGE   = 500

  for (;;) {
    const path = `articles?select=tags,metadata&is_active=eq.true&published_at=gte.${encodeURIComponent(startDate)}&published_at=lte.${encodeURIComponent(endDate)}&order=published_at.desc&limit=${PAGE}&offset=${offset}`
    const batch = await supabaseGet(path)
    articles.push(...batch)
    console.log(`  取得: ${articles.length}件 (batch: ${batch.length})`)
    if (batch.length < PAGE) break
    offset += PAGE
  }

  console.log(`\n記事総数: ${articles.length}件`)

  // ── 2. デビュータグを持つ記事から女優を抽出 ──────────────────────────────
  const candidateMap = new Map()  // dmm_id → { name, ruby }

  for (const art of articles) {
    const tags     = art.tags ?? []
    const hasDebut = tags.some(t => t.includes('デビュー'))
    if (!hasDebut) continue

    const actresses = art.metadata?.actress ?? []
    for (const a of actresses) {
      if (!candidateMap.has(a.id)) {
        candidateMap.set(a.id, { name: a.name, ruby: a.ruby ?? null })
      }
    }
  }

  const debutWorks = articles.filter(a => (a.tags ?? []).some(t => t.includes('デビュー'))).length
  console.log(`\nデビュー作品: ${debutWorks}件 / 出演女優候補: ${candidateMap.size}名`)

  if (candidateMap.size === 0) {
    console.log('候補女優なし — 終了')
    return
  }

  // ── 3. 既存登録状況を確認 ─────────────────────────────────────────────────
  const allExtIds = [...candidateMap.keys()].map(id => `dmm-actress-${id}`)

  // Supabase IN クエリ（CSV形式）
  const inFilter  = `(${allExtIds.map(id => `"${id}"`).join(',')})`
  const path      = `actresses?select=external_id,is_active&external_id=in.${encodeURIComponent(inFilter)}`
  const existing  = await supabaseGet(path)

  const existingMap = new Map()  // external_id → is_active
  for (const row of existing) {
    existingMap.set(row.external_id, row.is_active)
  }

  const toRegister = [...candidateMap.entries()].filter(([id]) => !existingMap.has(`dmm-actress-${id}`))
  const toActivate = [...candidateMap.entries()].filter(([id]) => existingMap.get(`dmm-actress-${id}`) === false)

  console.log(`\n未登録: ${toRegister.length}名 / 下書き公開化待ち: ${toActivate.length}名`)

  if (toRegister.length === 0 && toActivate.length === 0) {
    console.log('全員登録済み・公開済み — 終了')
    return
  }

  // ── 4. 未登録女優を新規登録 ──────────────────────────────────────────────
  if (toRegister.length > 0) {
    console.log('\n--- 新規登録 ---')
    let registered = 0

    // 画像取得 + 登録を5並列で実行
    const CONCURRENCY = 5
    for (let i = 0; i < toRegister.length; i += CONCURRENCY) {
      const chunk = toRegister.slice(i, i + CONCURRENCY)
      await Promise.all(chunk.map(async ([id, data]) => {
        const imageUrl = await fetchActressImage(id)
        const record = {
          external_id: `dmm-actress-${id}`,
          name:        data.name,
          ruby:        data.ruby,
          image_url:   imageUrl,
          is_active:   true,
          metadata:    { dmm_id: id },
        }
        try {
          await supabasePost('actresses', [record])
          console.log(`  ✓ ${data.name} (dmm-actress-${id})${imageUrl ? '' : ' [画像なし]'}`)
          registered++
        } catch (err) {
          console.error(`  ✗ ${data.name}: ${err.message}`)
        }
      }))
    }
    console.log(`新規登録完了: ${registered}/${toRegister.length}名`)
  }

  // ── 5. 下書き公開化（is_active: false → true）─────────────────────────────
  if (toActivate.length > 0) {
    console.log('\n--- 下書き公開化 ---')
    const activateIds = toActivate.map(([id]) => `dmm-actress-${id}`)

    // Supabase の PATCH は IN フィルタを URL クエリで指定
    for (const extId of activateIds) {
      try {
        const url    = `${SUPABASE_URL}/rest/v1/actresses?external_id=eq.${encodeURIComponent(extId)}`
        const body   = JSON.stringify({ is_active: true })
        await httpsRequest(url, {
          method: 'PATCH',
          headers: {
            apikey:          SUPABASE_KEY,
            Authorization:   `Bearer ${SUPABASE_KEY}`,
            'Content-Type':  'application/json',
            'Content-Length': Buffer.byteLength(body),
            Prefer:          'return=minimal',
          },
        }, body)
        const name = candidateMap.get(parseInt(extId.replace('dmm-actress-', '')))?.name ?? extId
        console.log(`  ✓ 公開化: ${name}`)
      } catch (err) {
        console.error(`  ✗ ${extId}: ${err.message}`)
      }
    }
    console.log(`下書き公開化完了: ${toActivate.length}名`)
  }

  console.log('\n=== パッチ完了 ===')
}

main().catch(err => {
  console.error('Script failed:', err)
  process.exit(1)
})
