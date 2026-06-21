// Phase4.5 監査（読み取りのみ）: 実クエリ実測レイテンシ + データ品質。
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
function loadEnv(p){ try{ for(const l of readFileSync(p,'utf-8').split('\n')){ const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]??=m[2].replace(/^['"]|['"]$/g,'') } }catch{} }
loadEnv('.env.local'); loadEnv('.env')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false } })
const iso=(d)=>new Date(Date.now()-d*86400000).toISOString()

async function time(label, fn){ const t=Date.now(); let info=''; try{ info=await fn() }catch(e){ info='ERR '+e.message } console.log(`  ${String(Date.now()-t).padStart(5)}ms  ${label}${info?'  · '+info:''}`) }
async function cnt(table, mod){ let q=sb.from(table).select('*',{count:'exact',head:true}); if(mod)q=mod(q); const {count,error}=await q; if(error)throw new Error(error.message); return count??0 }

console.log('═'.repeat(64)); console.log('  Phase4.5 監査レポート（実測）'); console.log('═'.repeat(64))

console.log('\n■ 2. クエリ実測レイテンシ（Analytics画面が発行する主クエリ）')
await time('profiles count (総会員)', async()=>`${await cnt('profiles',q=>q.eq('brand_id','verity'))}名`)
await time('UAS DAU (last>=1d)',  async()=>`${await cnt('user_activity_summary',q=>q.gte('last_event_at',iso(1)))}`)
await time('UAS WAU (last>=7d)',  async()=>`${await cnt('user_activity_summary',q=>q.gte('last_event_at',iso(7)))}`)
await time('UAS MAU (last>=30d)', async()=>`${await cnt('user_activity_summary',q=>q.gte('last_event_at',iso(30)))}`)
await time('daily_metrics 全取得', async()=>{const{data}=await sb.from('daily_metrics').select('*').order('date',{ascending:true});return `${data?.length}行`})
await time('content_popularity TOP20', async()=>{const{data}=await sb.from('content_popularity').select('external_id,title,image_url,score_30d').order('score_30d',{ascending:false,nullsFirst:false}).limit(20);return `${data?.length}件`})
await time('actress_popularity TOP20', async()=>{const{data}=await sb.from('actress_popularity').select('external_id,name,score_30d').order('score_30d',{ascending:false,nullsFirst:false}).limit(20);return `${data?.length}件`})
await time('tag_popularity TOP50', async()=>{const{data}=await sb.from('tag_popularity').select('tag,score_30d').order('score_30d',{ascending:false,nullsFirst:false}).limit(50);return `${data?.length}件`})
await time('tag_popularity rising20', async()=>{const{data}=await sb.from('tag_popularity').select('tag,rising').gt('score_7d',0).order('rising',{ascending:false,nullsFirst:false}).limit(20);return `${data?.length}件`})
await time('rpc get_favorite_user_stats', async()=>{await sb.rpc('get_favorite_user_stats');return ''})
await time('rpc get_preference_distribution', async()=>{const{data}=await sb.rpc('get_preference_distribution',{p_limit:12});return `${(data??[]).length}件`})
await time('investor retention 2counts', async()=>{await cnt('user_activity_summary',q=>q.lte('first_event_at',iso(7)));await cnt('user_activity_summary',q=>q.lte('first_event_at',iso(7)).gte('last_event_at',iso(7)));return ''})

console.log('\n■ 3. データ品質監査')
const evTotal = await cnt('user_events')
console.log(`  user_events 総数: ${evTotal}`)
const evNull  = await cnt('user_events', q=>q.is('user_id',null))
console.log(`  user_id NULL(匿名): ${evNull}  /  ログイン: ${evTotal-evNull}  (匿名率 ${Math.round(evNull/evTotal*1000)/10}%)`)
console.log('  event_name 別:')
for(const name of ['video_view','actress_view','fanza_click','favorite_work','favorite_actress','page_view','signup_start','signup_complete']){
  const c = await cnt('user_events', q=>q.eq('event_name',name))
  console.log(`    ${name.padEnd(18)} ${c}`)
}
console.log('  target_type 別:')
for(const t of ['article','actress']){ console.log(`    ${t.padEnd(10)} ${await cnt('user_events',q=>q.eq('target_type',t))}`) }
console.log(`    (null)     ${await cnt('user_events',q=>q.is('target_type',null))}`)
// 不正値: target必須イベントで target_id NULL
for(const name of ['video_view','fanza_click','favorite_work','actress_view','favorite_actress']){
  const bad = await cnt('user_events', q=>q.eq('event_name',name).is('target_id',null))
  if(bad>0) console.log(`  ⚠ ${name} で target_id NULL: ${bad}件`)
}
// お気に入りテーブル
const favArt = await cnt('favorite_articles'); const favAct = await cnt('favorite_actresses')
console.log(`  favorite_articles: ${favArt} / favorite_actresses: ${favAct}`)
// 孤立: favorite_actresses.actress_id が actresses に無い
{
  const {data}=await sb.from('favorite_actresses').select('actress_id').limit(1000)
  const ids=[...new Set((data??[]).map(r=>r.actress_id))]
  let orphan=0
  for(let i=0;i<ids.length;i+=100){ const chunk=ids.slice(i,i+100); const {data:a}=await sb.from('actresses').select('id').in('id',chunk); const have=new Set((a??[]).map(x=>x.id)); orphan+=chunk.filter(x=>!have.has(x)).length }
  console.log(`  favorite_actresses 孤立(actress欠落): ${orphan}/${ids.length}`)
}
// 孤立: favorite_articles.article_external_id が articles に無い
{
  const {data}=await sb.from('favorite_articles').select('article_external_id').limit(1000)
  const ids=[...new Set((data??[]).map(r=>r.article_external_id))]
  let orphan=0
  for(let i=0;i<ids.length;i+=100){ const chunk=ids.slice(i,i+100); const {data:a}=await sb.from('articles').select('external_id').in('external_id',chunk); const have=new Set((a??[]).map(x=>x.external_id)); orphan+=chunk.filter(x=>!have.has(x)).length }
  console.log(`  favorite_articles 孤立(article欠落): ${orphan}/${ids.length}`)
}
// 二重記録サンプル: 直近3000件で (user_id,event_name,target_id,同一秒) 重複
{
  const {data}=await sb.from('user_events').select('user_id,event_name,target_id,created_at').order('created_at',{ascending:false}).limit(3000)
  const seen=new Map(); let dup=0
  for(const e of data??[]){ const k=`${e.user_id}|${e.event_name}|${e.target_id}|${(e.created_at||'').slice(0,19)}`; seen.set(k,(seen.get(k)??0)+1); if(seen.get(k)===2)dup++ }
  console.log(`  二重記録の疑い(直近3000・同一秒同一user/event/target): ${dup}キー`)
}
// fanza_click target が articles に存在するか（送客先の妥当性）サンプル
{
  const {data}=await sb.from('user_events').select('target_id').eq('event_name','fanza_click').not('target_id','is',null).order('created_at',{ascending:false}).limit(300)
  const ids=[...new Set((data??[]).map(r=>r.target_id))]
  let missing=0
  for(let i=0;i<ids.length;i+=100){ const chunk=ids.slice(i,i+100); const {data:a}=await sb.from('articles').select('external_id').in('external_id',chunk); const have=new Set((a??[]).map(x=>x.external_id)); missing+=chunk.filter(x=>!have.has(x)).length }
  console.log(`  fanza_click target が articles に無い(直近300distinct): ${missing}/${ids.length}`)
}

console.log('\n■ 規模感（10倍スケール評価の母数）')
console.log(`  daily_metrics ${await cnt('daily_metrics')} / user_activity_summary ${await cnt('user_activity_summary')} / tag_popularity ${await cnt('tag_popularity')} / content_popularity ${await cnt('content_popularity')} / actress_popularity ${await cnt('actress_popularity')}`)
console.log(`  articles(active) ${await cnt('articles',q=>q.eq('is_active',true))} / actresses(active) ${await cnt('actresses',q=>q.eq('is_active',true))}`)
console.log('\n═'.repeat(64))
