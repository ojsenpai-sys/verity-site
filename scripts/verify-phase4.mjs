// Phase4 マイグレーション適用後の動作検証（読み取り中心）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
function loadEnv(p){ try{ for(const l of readFileSync(p,'utf-8').split('\n')){ const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]??=m[2].replace(/^['"]|['"]$/g,'') } }catch{} }
loadEnv('.env.local'); loadEnv('.env')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } })

const ok = (b)=> b ? '✅' : '❌'
let pass = 0, fail = 0
const log = (label, good, extra='') => { good?pass++:fail++; console.log(`  ${ok(good)} ${label}${extra?'  — '+extra:''}`) }

console.log('═'.repeat(50)); console.log('  Phase4 検証'); console.log('═'.repeat(50))

// 1. favorite_articles テーブル
{
  const { error, count } = await sb.from('favorite_articles').select('*', { count:'exact', head:true })
  log('favorite_articles テーブル', !error, error?error.message:`${count ?? 0}行`)
}
// 2. get_article_favorite_count RPC
{
  const { error } = await sb.rpc('get_article_favorite_count', { p_external_id: 'nonexistent' })
  log('get_article_favorite_count RPC', !error, error?.message ?? '')
}
// 3. get_my_favorite_articles RPC（存在確認のみ。service keyではauth.uid()=nullで unauthorized 例外が正常）
{
  const { error } = await sb.rpc('get_my_favorite_articles', { p_user_id: '00000000-0000-0000-0000-000000000000' })
  const exists = !error || /unauthorized/i.test(error.message)
  log('get_my_favorite_articles RPC 存在', exists, error?.message ?? '')
}
// 4. tag_scores view
{
  const { data, error } = await sb.from('tag_scores').select('tag, score_30d, score_all').order('score_30d',{ascending:false,nullsFirst:false}).limit(10)
  log('tag_scores view', !error, error?error.message:`上位${(data??[]).length}件`)
  if(!error && data?.length) console.log('     TOP:', data.slice(0,8).map(r=>`${r.tag}(${r.score_30d??0})`).join(' / '))
}
// 5. refresh_tag_scores() 実行（service_role）
{
  const { error } = await sb.rpc('refresh_tag_scores')
  log('refresh_tag_scores() 実行', !error, error?.message ?? 'REFRESH OK')
}
// 6. get_top_tags_by_period RPC
{
  const { data, error } = await sb.rpc('get_top_tags_by_period', { p_period:'30d', p_limit:10 })
  log('get_top_tags_by_period RPC', !error, error?error.message:`${(data??[]).length}件`)
}
// 7. user_events（既存・健全性）
{
  const { error, count } = await sb.from('user_events').select('*', { count:'exact', head:true })
  log('user_events テーブル', !error, error?error.message:`${count ?? 0}行`)
}

console.log('═'.repeat(50)); console.log(`  結果: ${pass} pass / ${fail} fail`); console.log('═'.repeat(50))
process.exit(fail>0?1:0)
