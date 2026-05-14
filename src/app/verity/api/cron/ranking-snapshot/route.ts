import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const LIMIT    = 10

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL      ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY     ?? '',
  )
}

export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = serviceClient()
  const today = new Date().toISOString().split('T')[0]

  // 1. リアルタイムランキングを算出
  const { data: rankRows, error: rankErr } = await supabase
    .rpc('get_actress_ranking', { p_brand_id: BRAND_ID, p_limit: LIMIT })

  if (rankErr || !rankRows || (rankRows as unknown[]).length === 0) {
    return NextResponse.json({ error: rankErr?.message ?? 'no ranking data' }, { status: 500 })
  }

  const rows = rankRows as { actress_external_id: string; points: number }[]
  const externalIds = rows.map(r => r.actress_external_id)

  // 2. 女優レコードを取得
  const { data: actresses } = await supabase
    .from('actresses')
    .select('id, external_id, name, image_url, metadata')
    .in('external_id', externalIds)

  const actressMap = new Map(
    (actresses ?? []).map(a => [a.external_id as string, a])
  )

  // 3. 各女優の最新単体作品の画像URLを取得して upsert
  const cacheRows = []

  for (let i = 0; i < rows.length; i++) {
    const r       = rows[i]
    const actress = actressMap.get(r.actress_external_id)
    if (!actress) continue

    // 記事タグは女優名で登録されているため名前＋エイリアスで検索
    const aliases     = (actress.metadata?.aliases ?? []) as string[]
    const searchNames = [actress.name as string, ...aliases]

    const { data: articles } = await supabase
      .from('articles')
      .select('image_url, metadata, tags')
      .overlaps('tags', searchNames)
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(20)

    let imageUrl = actress.image_url as string | null

    if (articles && articles.length > 0) {
      // 「単体作品」タグがあるか actress_count=1 の作品を優先
      const solo = articles.find(a => {
        const tags  = (a.tags ?? []) as string[]
        const meta  = a.metadata as Record<string, unknown> | null
        const count = typeof meta?.actress_count === 'number' ? meta.actress_count : null
        return tags.includes('単体作品') || count === 1
      })
      const best = solo ?? articles[0]
      if (best?.image_url) imageUrl = best.image_url as string
    }

    cacheRows.push({
      brand_id:      BRAND_ID,
      rank:          i + 1,
      actress_id:    actress.id as string,
      points:        r.points,
      image_url:     imageUrl,
      snapshot_date: today,
    })
  }

  const { error: upsertErr } = await supabase
    .from('actress_ranking_cache')
    .upsert(cacheRows, { onConflict: 'brand_id,snapshot_date,rank' })

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  console.log(`[ranking-snapshot] ${today} — ${cacheRows.length} 件キャッシュ完了`)
  return NextResponse.json({ ok: true, date: today, cached: cacheRows.length })
}
