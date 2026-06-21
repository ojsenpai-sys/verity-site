/**
 * 未登録女優の名前解決＋actressesテーブル登録スクリプト
 *
 * ダッシュボードの売上期待ランキング等で「女優 #<id>」と表示される
 * （= actresses テーブルに未登録の）DMM女優を、
 *   A) DMM ActressSearch / 作品メタから名前を特定し
 *   B) actresses テーブルへ UPSERT して名前表示されるようにする
 *
 * 使い方:
 *   node scripts/resolve-actress.mjs 23946          # 特定して登録
 *   node scripts/resolve-actress.mjs 23946 --dry    # 特定のみ（登録しない）
 */

// DMM API の TLS 証明書チェーン問題を回避（ローカル同期スクリプト専用）
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

// ── 引数 ─────────────────────────────────────────────────────────────────────
const ACTRESS_ID = (process.argv[2] ?? '').trim()
const DRY_RUN    = process.argv.includes('--dry')
if (!/^\d+$/.test(ACTRESS_ID)) {
  console.error('❌ 使い方: node scripts/resolve-actress.mjs <DMM女優ID> [--dry]')
  process.exit(1)
}
const EXT_ID = `dmm-actress-${ACTRESS_ID}`

// ── DMM ActressSearch（actress_id 指定で1件） ─────────────────────────────────
async function fetchActressFromDmm(id) {
  const qs = new URLSearchParams({
    api_id: DMM_API_ID, affiliate_id: AFFILIATE_ID,
    site: 'FANZA', output: 'json', hits: '1', actress_id: String(id),
  })
  try {
    const res = await fetch(`https://api.dmm.com/affiliate/v3/ActressSearch?${qs}`, { cache: 'no-store' })
    if (!res.ok) { console.warn(`  [dmm] HTTP ${res.status}`); return null }
    const j = await res.json()
    if (j.result?.status !== 200 || !j.result?.items?.length) return null
    const i = j.result.items[0]
    return {
      name:     i.name ?? null,
      ruby:     i.ruby ?? null,
      image:    i.imageURL?.large ?? i.imageURL?.small ?? null,
      bust:     i.bust ?? null,
      height:   i.height ?? null,
      birthday: i.birthday ?? null,
    }
  } catch (e) { console.warn(`  [dmm] error: ${e.message}`); return null }
}

// ── 作品メタからの裏取り（metadata.actress に id を含む作品の name を採用） ──────
async function fetchNameFromArticles(id) {
  const { data, error } = await supabase
    .from('articles')
    .select('external_id, metadata')
    .contains('metadata', { actress: [{ id: Number(id) }] })
    .limit(5)
  if (error) { console.warn(`  [articles] ${error.message}`); return { name: null, count: 0 } }
  for (const art of data ?? []) {
    const arr = art.metadata?.actress
    if (Array.isArray(arr)) {
      const hit = arr.find(a => Number(a?.id) === Number(id))
      if (hit?.name) return { name: hit.name, count: data.length }
    }
  }
  return { name: null, count: (data ?? []).length }
}

// ── メイン ───────────────────────────────────────────────────────────────────
console.log('═'.repeat(56))
console.log(`  女優ID解決: ${EXT_ID}${DRY_RUN ? '  (DRY RUN)' : ''}`)
console.log('═'.repeat(56))

// 0. 既存確認
const { data: existing } = await supabase
  .from('actresses')
  .select('external_id, name, is_active')
  .eq('external_id', EXT_ID)
  .maybeSingle()

if (existing) {
  console.log(`\n⚠️ 既に actresses に登録あり: "${existing.name}" (is_active=${existing.is_active})`)
  console.log('   → 名前で表示されないなら別要因（キャッシュ等）。最新情報で上書きします。')
} else {
  console.log('\n→ actresses 未登録（だから「女優 #' + ACTRESS_ID + '」表示）')
}

// A. 名前特定
console.log('\n── A) 名前特定 ──')
const dmm = await fetchActressFromDmm(ACTRESS_ID)
if (dmm) {
  console.log(`  [DMM ActressSearch] name="${dmm.name}" ruby="${dmm.ruby ?? ''}"`)
  console.log(`                      birthday=${dmm.birthday ?? '-'} bust=${dmm.bust ?? '-'} height=${dmm.height ?? '-'}`)
  console.log(`                      image=${dmm.image ?? 'null（API未登録/非公開）'}`)
} else {
  console.log('  [DMM ActressSearch] 該当なし（廃止ID/非公開の可能性）')
}

const fromArt = await fetchNameFromArticles(ACTRESS_ID)
console.log(`  [作品メタ裏取り] name=${fromArt.name ? `"${fromArt.name}"` : 'なし'}（id一致作品 ${fromArt.count}件）`)

const finalName = dmm?.name ?? fromArt.name ?? null
const finalRuby = dmm?.ruby ?? null
const finalImg  = dmm?.image ?? null

if (!finalName) {
  console.error('\n❌ どのソースからも名前を特定できませんでした。登録を中止します。')
  process.exit(1)
}
console.log(`\n✅ 確定: ${EXT_ID} = 「${finalName}」`)

// B. actresses へ UPSERT
console.log('\n── B) actresses 登録 ──')
if (DRY_RUN) {
  console.log('  (--dry のため書き込みスキップ)')
  process.exit(0)
}

const record = {
  external_id: EXT_ID,
  name:        finalName,
  ruby:        finalRuby,
  image_url:   finalImg,
  is_active:   true,
  metadata:    { dmm_id: Number(ACTRESS_ID) },
}
const { error: upErr } = await supabase
  .from('actresses')
  .upsert(record, { onConflict: 'external_id' })

if (upErr) {
  console.error(`  ❌ UPSERT 失敗: ${upErr.message}`)
  process.exit(1)
}
console.log(`  ✓ actresses UPSERT 完了: 「${finalName}」(${EXT_ID})`)
console.log('\n=== 完了 ===  ダッシュボードを再読込すると名前で表示されます。')
