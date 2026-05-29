import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

// POST /verity/api/favorites/sync
// ログイン直後にLocalStorageの女優外部IDリストをDBのfavorite_actress_idsへマージ。
// 既存のDB側お気に入りは絶対に上書きせず、重複排除したうえで追加のみ行う。
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { actress_external_ids: unknown }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }

  const raw = body.actress_external_ids
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ ok: true, merged: 0 })
  }

  // 文字列のみ・最大20件に絞る（DoS対策）
  const externalIds = raw
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .slice(0, 20)

  if (externalIds.length === 0) return NextResponse.json({ ok: true, merged: 0 })

  // external_id → DB UUID に変換（is_activeのみ対象）
  const { data: actresses } = await supabase
    .from('actresses')
    .select('id')
    .in('external_id', externalIds)
    .eq('is_active', true)

  if (!actresses || actresses.length === 0) {
    return NextResponse.json({ ok: true, merged: 0 })
  }

  const newUuids = (actresses as { id: string }[]).map(a => a.id)

  // 現在のプロフィールを取得
  const { data: profile } = await supabase
    .from('profiles')
    .select('favorite_actress_ids, stars_count')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const current  = (profile.favorite_actress_ids ?? []) as string[]
  const stars    = (profile.stars_count ?? 0) as number
  const maxFavs  = stars >= 6 ? 9 : stars >= 3 ? 6 : 3

  // マージ: 既存を保持したまま、新規のみ上限内で追加
  const merged = [...current]
  let addedCount = 0
  for (const uuid of newUuids) {
    if (!merged.includes(uuid) && merged.length < maxFavs) {
      merged.push(uuid)
      addedCount++
    }
  }

  if (addedCount === 0) return NextResponse.json({ ok: true, merged: 0 })

  const { error } = await supabase
    .from('profiles')
    .update({ favorite_actress_ids: merged })
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, merged: addedCount, total: merged.length })
}
