import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

const NOISE_TAGS = new Set([
  'サンプル動画', 'Blu-ray（ブルーレイ）', 'ハイビジョン', '4K',
  '4時間以上作品', '特典付き・セット商品', 'イメージビデオ',
])
const isNoisyTag = (t: string) =>
  NOISE_TAGS.has(t) || t.includes('VR') || /^\d/.test(t) ||
  t.includes('年代') || t.includes('DOD')

// GET ?mode=sample → プロファイリング用30作品
// GET            → 現在の genre_scores + profiling_done
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)

  if (searchParams.get('mode') === 'sample') {
    const { data } = await supabase
      .from('articles')
      .select('id, title, image_url, tags')
      .eq('is_active', true)
      .not('image_url', 'is', null)
      .filter('metadata->>floor', 'eq', 'videoa')
      .order('published_at', { ascending: false })
      .limit(300)

    type Row = { id: string; title: string; image_url: string | null; tags: string[] | null }
    const valid = ((data ?? []) as Row[]).filter(
      a => a.image_url && !a.image_url.includes('noimage') && !a.image_url.includes('sample')
    )
    const shuffled = [...valid].sort(() => Math.random() - 0.5).slice(0, 30)
    return NextResponse.json({ items: shuffled })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('genre_scores, profiling_done')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle()

  return NextResponse.json({
    genre_scores:   (profile as { genre_scores: Record<string, number> } | null)?.genre_scores   ?? {},
    profiling_done: (profile as { profiling_done: boolean } | null)?.profiling_done ?? false,
  })
}

// POST body: { tags?: string[]; weight?: number; mark_done?: boolean; delta?: Record<string,number> }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { tags?: string[]; weight?: number; mark_done?: boolean; delta?: Record<string, number> }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const delta: Record<string, number> = {}

  if (body.delta && typeof body.delta === 'object') {
    for (const [k, v] of Object.entries(body.delta)) {
      if (typeof v === 'number' && v > 0) delta[k] = v
    }
  } else if (Array.isArray(body.tags) && typeof body.weight === 'number') {
    for (const tag of body.tags) {
      if (typeof tag === 'string' && !isNoisyTag(tag)) {
        delta[tag] = (delta[tag] ?? 0) + body.weight
      }
    }
  }

  if (Object.keys(delta).length === 0 && !body.mark_done) {
    return NextResponse.json({ ok: true })
  }

  const { error } = await supabase.rpc('update_genre_scores', {
    p_user_id:   user.id,
    p_brand_id:  BRAND_ID,
    p_delta:     delta,
    p_mark_done: body.mark_done ?? false,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
