import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { external_id: string; action: 'add' | 'remove' }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const { external_id, action } = body
  if (!external_id || !action) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: actress } = await supabase
    .from('actresses')
    .select('id')
    .eq('external_id', external_id)
    .eq('is_active', true)
    .single()
  if (!actress) return NextResponse.json({ error: 'Actress not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('favorite_actress_ids, stars_count')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const current = (profile.favorite_actress_ids ?? []) as string[]
  const stars   = (profile.stars_count ?? 0) as number
  const maxFavs = stars >= 6 ? 9 : stars >= 3 ? 6 : 3

  let next: string[]
  if (action === 'add') {
    if (current.includes(actress.id)) return NextResponse.json({ ok: true, noop: true })
    if (current.length >= maxFavs) return NextResponse.json({ ok: false, reason: 'max_reached' })
    next = [...current, actress.id]
  } else {
    next = current.filter(id => id !== actress.id)
  }

  const { error } = await supabase
    .from('profiles')
    .update({ favorite_actress_ids: next })
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
