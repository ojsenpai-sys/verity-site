/**
 * image_url が null の女優の画像を補完する。
 *   1) DMM ActressSearch のポートレート（actress_id）
 *   2) 出演作カバー（ソロ作優先 → 任意作）を articles から
 *
 * 使い方:
 *   node scripts/backfill-actress-images.mjs --dry        # 対象数のみ
 *   node scripts/backfill-actress-images.mjs              # 補完実行（is_active=true のみ）
 *   node scripts/backfill-actress-images.mjs --all        # 引退含む全件
 *   node scripts/backfill-actress-images.mjs --limit 100  # 件数上限
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv(p){ try{ for(const l of readFileSync(p,'utf-8').split('\n')){ const m=l.match(/^([A-Z0-9_]+)=(.*)$/); if(m) process.env[m[1]]??=m[2].replace(/^['"]|['"]$/g,'') } }catch{} }
loadEnv('.env.local'); loadEnv('.env')
const DMM_API_ID=process.env.DMM_API_ID, AFFILIATE_ID=process.env.AFFILIATE_ID
const SUPABASE_URL=process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY
if(!DMM_API_ID||!AFFILIATE_ID||!SUPABASE_URL||!SERVICE_KEY){ console.error('❌ env不足'); process.exit(1) }
const supabase=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}})
const DRY=process.argv.includes('--dry'), ALL=process.argv.includes('--all')
const limArg=process.argv.indexOf('--limit'); const LIMIT=limArg>=0?Number(process.argv[limArg+1]):Infinity
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
const PAGE=1000

async function fetchAll(){
  const out=[]
  for(let from=0;;from+=PAGE){
    let q=supabase.from('actresses').select('external_id, name, metadata, is_active')
      .is('image_url',null).order('external_id',{ascending:true}).range(from,from+PAGE-1)
    if(!ALL) q=q.eq('is_active',true)
    const {data,error}=await q
    if(error) throw new Error(error.message)
    out.push(...(data??[]))
    if(!data||data.length<PAGE) break
  }
  return out
}

async function dmmPortrait(id){
  const qs=new URLSearchParams({api_id:DMM_API_ID,affiliate_id:AFFILIATE_ID,site:'FANZA',output:'json',hits:'1',actress_id:String(id)})
  try{
    const res=await fetch(`https://api.dmm.com/affiliate/v3/ActressSearch?${qs}`,{cache:'no-store'})
    if(!res.ok) return null
    const j=await res.json()
    if(j.result?.status!==200||!j.result?.items?.length) return null
    const i=j.result.items[0]
    return i.imageURL?.large??i.imageURL?.small??null
  }catch{ return null }
}

async function coverFromArticles(id){
  const {data}=await supabase.from('articles').select('image_url, metadata')
    .contains('metadata',{actress:[{id:Number(id)}]})
    .not('image_url','is',null)
    .order('published_at',{ascending:false,nullsFirst:false}).limit(30)
  const rows=data??[]
  // ソロ作（出演女優1名）優先
  const solo=rows.find(r=>Array.isArray(r.metadata?.actress)&&r.metadata.actress.length===1)
  return (solo?.image_url)??(rows[0]?.image_url)??null
}

const idOf=ext=>String(ext).replace('dmm-actress-','')

console.log('═'.repeat(56))
console.log(`  女優画像 補完${DRY?'  (DRY RUN)':''}${ALL?'  [全件]':'  [is_active=true]'}`)
console.log('═'.repeat(56))

const targets=await fetchAll()
console.log(`\n画像なし女優: ${targets.length}名`)
if(DRY){
  console.log('  先頭20名:')
  for(const a of targets.slice(0,20)) console.log(`   - ${a.name} (${a.external_id})`)
  console.log('\n(--dry のため補完スキップ)'); process.exit(0)
}

let dmmOk=0, coverOk=0, none=0, done=0
for(const a of targets){
  if(done>=LIMIT) break
  done++
  const id=a.metadata?.dmm_id??idOf(a.external_id)
  let url=await dmmPortrait(id); let src='dmm'
  if(!url){ url=await coverFromArticles(id); src='cover' }
  if(url){
    const {error}=await supabase.from('actresses').update({image_url:url}).eq('external_id',a.external_id)
    if(error){ console.error(`  ❌ ${a.name}: ${error.message}`) }
    else { src==='dmm'?dmmOk++:coverOk++; if(done%25===0||done<=5) console.log(`  [${done}/${targets.length}] ✓ ${a.name} (${src})`) }
  } else { none++; }
  await sleep(200)
}
console.log('\n'+'═'.repeat(56))
console.log(`  完了: 処理 ${done}名 / DMMポートレート ${dmmOk} / 作品カバー ${coverOk} / 取得不可 ${none}`)
console.log('═'.repeat(56))
