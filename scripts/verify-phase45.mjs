// Phase4.5 分析基盤 検証（DDL=027/028 適用後に実行）。refresh実行→各オブジェクト確認。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
function loadEnv(p){ try{ for(const l of readFileSync(p,'utf-8').split('\n')){ const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]??=m[2].replace(/^['"]|['"]$/g,'') } }catch{} }
loadEnv('.env.local'); loadEnv('.env')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } })

let pass=0, fail=0
const ok=(b)=>b?'✅':'❌'
const log=(label,good,extra='')=>{ good?pass++:fail++; console.log(`  ${ok(good)} ${label}${extra?'  — '+extra:''}`) }

console.log('═'.repeat(54)); console.log('  Phase4.5 分析基盤 検証'); console.log('═'.repeat(54))

console.log('\n── refresh 実行 ──')
for(const fn of ['refresh_tag_scores','refresh_analytics','refresh_user_profiles']){
  const { error } = await sb.rpc(fn)
  log(`rpc ${fn}()`, !error, error?.message ?? 'ok')
}

console.log('\n── テーブル/MV/VIEW ──')
async function rows(name, mod){
  try{
    let q = sb.from(name).select('*', { count:'exact', head:true })
    if(mod) q = mod(q)
    const { count, error } = await q
    log(name, !error, error?error.message:`${count ?? 0}行`)
  }catch(e){ log(name, false, e.message) }
}
await rows('preference_weights')
await rows('daily_metrics')
await rows('user_activity_summary')
await rows('tag_popularity')
await rows('content_popularity')
await rows('actress_popularity')
await rows('user_preference_profiles')
await rows('user_preference_snapshots')
await rows('cron_status_runs')
await rows('cron_status_latest')

console.log('\n── RPC ──')
{
  const { data, error } = await sb.rpc('get_favorite_user_stats')
  const r = Array.isArray(data)?data[0]:data
  log('get_favorite_user_stats()', !error, error?error.message:`any=${r?.fav_any ?? '?'} work=${r?.fav_work ?? '?'} actress=${r?.fav_actress ?? '?'}`)
}
{
  const { data, error } = await sb.rpc('get_preference_distribution', { p_limit: 10 })
  log('get_preference_distribution()', !error, error?error.message:`${(data??[]).length}件`)
  if(!error && data?.length) console.log('     TOP:', data.slice(0,8).map(r=>`${r.tag}(${Math.round(Number(r.total))})`).join(' / '))
}

console.log('\n── daily_metrics サンプル（最新3日）──')
{
  const { data } = await sb.from('daily_metrics').select('date,total_members,new_users,dau,fanza_clicks,total_events').order('date',{ascending:false}).limit(3)
  for(const r of data??[]) console.log(`  ${r.date}  members=${r.total_members} new=${r.new_users} dau=${r.dau} fanza=${r.fanza_clicks} events=${r.total_events}`)
}

console.log('\n'+'═'.repeat(54)); console.log(`  結果: ${pass} pass / ${fail} fail`); console.log('═'.repeat(54))
process.exit(fail>0?1:0)
