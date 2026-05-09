import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { computeUnlocks, TITLE_MAP, CROWN_POINTS_THRESHOLD } from '@/lib/titles'
import type { UnlockedTitle } from '@/lib/types'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

// ── GET /verity/api/profile ───────────────────────────────────────────────────
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile, error: dbErr } = await supabase
    .from('profiles')
    .select(`
      user_id, brand_id, display_name, avatar_url,
      favorite_actress_ids, title, titles_data, created_at, updated_at
    `)
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // お気に入り女優の詳細を JOIN
  let favoriteActresses: Record<string, unknown>[] = []
  if ((profile.favorite_actress_ids as string[]).length > 0) {
    const { data: actresses } = await supabase
      .from('actresses')
      .select('id, name, ruby, image_url, metadata')
      .in('id', profile.favorite_actress_ids as string[])
    favoriteActresses = actresses ?? []
  }

  return NextResponse.json({
    ...profile,
    email: user.email,
    favoriteActresses,
  })
}

// ── PATCH /verity/api/profile ─────────────────────────────────────────────────
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { body = {} }

  const allowed = ['display_name', 'favorite_actress_ids', 'title'] as const
  const patch: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) patch[key] = body[key]
  }

  // favorite_actress_ids のバリデーション
  if ('favorite_actress_ids' in patch) {
    const ids = patch.favorite_actress_ids as unknown[]
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'favorite_actress_ids must be an array' }, { status: 400 })
    }

    // VERITY マスター保持者は最大6名、それ以外は最大3名
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('titles_data')
      .eq('user_id', user.id)
      .eq('brand_id', BRAND_ID)
      .maybeSingle()

    const unlockedIds = ((currentProfile?.titles_data ?? []) as UnlockedTitle[]).map(t => t.id)
    const isMaster = unlockedIds.includes('verity_master')
    const maxFavs  = isMaster ? 6 : 3

    if (ids.length > maxFavs) {
      return NextResponse.json(
        { error: `favorite_actress_ids must be an array of ≤${maxFavs} UUIDs` },
        { status: 400 }
      )
    }

    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!ids.every(id => typeof id === 'string' && uuidRe.test(id))) {
      return NextResponse.json({ error: 'Invalid actress UUID' }, { status: 400 })
    }
  }

  // title のバリデーション（解除済みのもののみ設定可）
  if ('title' in patch && patch.title !== null) {
    const { data: current } = await supabase
      .from('profiles')
      .select('titles_data')
      .eq('user_id', user.id)
      .eq('brand_id', BRAND_ID)
      .maybeSingle()

    const unlocked = ((current?.titles_data ?? []) as UnlockedTitle[]).map(t => t.id)
    if (!unlocked.includes(patch.title as string)) {
      return NextResponse.json({ error: 'Title not unlocked' }, { status: 400 })
    }
  }

  const { data: updated, error: dbErr } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // お気に入り更新時: 称号解除チェック（VERITY マスター含む）
  if ('favorite_actress_ids' in patch) {
    const favIds = patch.favorite_actress_ids as string[]
    const { data: prof } = await supabase
      .from('profiles')
      .select('created_at, titles_data, favorite_actress_ids')
      .eq('user_id', user.id)
      .eq('brand_id', BRAND_ID)
      .single()

    if (prof) {
      const existing = (prof.titles_data as UnlockedTitle[]).map(t => t.id)

      // 王冠バッジ獲得済み女優UUIDを取得（SECURITY DEFINER経由）
      let crownIds: string[] = []
      if (favIds.length >= 3) {
        // 女優UUIDからexternal_idを取得
        const { data: actressRows } = await supabase
          .from('actresses')
          .select('id, external_id')
          .in('id', favIds)

        if (actressRows && actressRows.length > 0) {
          const extIds = actressRows.map(a => a.external_id as string)
          const { data: pointRows } = await supabase
            .rpc('get_user_actress_points', { p_user_id: user.id, p_brand_id: BRAND_ID })

          if (pointRows) {
            const pointMap = new Map(
              (pointRows as { actress_external_id: string; points: number }[])
                .map(r => [r.actress_external_id, r.points])
            )
            crownIds = actressRows
              .filter(a => (pointMap.get(a.external_id as string) ?? 0) >= CROWN_POINTS_THRESHOLD)
              .map(a => a.id as string)
          }
        }
      }

      const newIds = computeUnlocks({
        createdAt:        new Date(prof.created_at),
        favCount:         favIds.length,
        existingUnlocked: existing,
        favoriteIds:      favIds,
        crownIds,
      })

      if (newIds.length > 0) {
        const now       = new Date().toISOString()
        const additions = newIds.map(id => ({ id, unlocked_at: now }))
        await supabase.from('profiles').update({
          titles_data: [...(prof.titles_data as UnlockedTitle[]), ...additions],
        })
        .eq('user_id', user.id)
        .eq('brand_id', BRAND_ID)
      }
    }
  }

  if ('favorite_actress_ids' in patch) {
    revalidatePath('/verity/profile',        'layout')
    revalidatePath('/verity/actresses/[id]', 'page')
  }

  return NextResponse.json(updated)
}
