/**
 * 非女優エントリ（お笑い芸人・男性出演者など metadata.actress 経由で混入）を
 * actresses テーブルから「除外」= is_active=false に設定する。
 *
 * 自動判定は不可能（廃止女優も DMM ActressSearch に出ないため）なので、
 * 既知の非女優名 denylist 方式。DENY 配列を編集して使う。
 *
 * 使い方:
 *   node scripts/deactivate-non-actresses.mjs --dry   # 該当一覧のみ
 *   node scripts/deactivate-non-actresses.mjs         # is_active=false 実行
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(p){ try{ for(const l of readFileSync(p,'utf-8').split('\n')){ const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]??=m[2].replace(/^['"]|['"]$/g,'') } }catch{} }
loadEnv('.env.local'); loadEnv('.env')
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
if(!SUPABASE_URL||!SERVICE_KEY){ console.error('❌ SUPABASE env 不足'); process.exit(1) }
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth:{ persistSession:false } })
const DRY = process.argv.includes('--dry')

// ── 非女優 denylist（お笑い芸人・男性出演者など。必要に応じ編集）──────────────
const DENY = [
  'アイアム野田', 'ニシダ', '東ブクロ', '森田哲矢', '小宮浩信', '相田周二',
  '槙尾ユウスケ', 'Yes！アキト', '相田周二', '東山想葉',
]

const names = [...new Set(DENY)]
console.log('═'.repeat(56))
console.log(`  非女優エントリ除外${DRY ? '  (DRY RUN)' : ''}  対象名 ${names.length}件`)
console.log('═'.repeat(56))

const { data, error } = await supabase
  .from('actresses')
  .select('external_id, name, is_active, image_url')
  .in('name', names)
if (error){ console.error('❌', error.message); process.exit(1) }

const hits = data ?? []
console.log(`\n── DB一致: ${hits.length}件 ──`)
for (const a of hits) console.log(`  ${a.is_active ? '●' : '○'} ${a.name}  (${a.external_id})  is_active=${a.is_active}`)

const notFound = names.filter(n => !hits.some(h => h.name === n))
if (notFound.length) console.log(`\n  （DB未登録でスキップ: ${notFound.join('、')}）`)

const toDeactivate = hits.filter(a => a.is_active)
console.log(`\n→ is_active=true → false にする対象: ${toDeactivate.length}件`)

if (DRY){ console.log('\n(--dry のため書き込みスキップ)'); process.exit(0) }
if (toDeactivate.length === 0){ console.log('\n変更なし。'); process.exit(0) }

let ok = 0
for (const a of toDeactivate) {
  const { error: e } = await supabase
    .from('actresses')
    .update({ is_active: false })
    .eq('external_id', a.external_id)
  if (e) console.error(`  ❌ ${a.name}: ${e.message}`)
  else { ok++; console.log(`  ✓ ${a.name} → is_active=false`) }
}
console.log(`\n✓ 除外完了: ${ok}件`)
