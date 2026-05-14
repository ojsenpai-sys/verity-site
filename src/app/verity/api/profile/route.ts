import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import { computeUnlocks, CROWN_CLICK_THRESHOLD, CROWN_LP_THRESHOLD } from '@/lib/titles'
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

  let favoriteActresses: Record<string, unknown>[] = []
  if ((profile.favorite_actress_ids as string[]).length > 0) {
    const { data: actresses } = await supabase
      .from('actresses')
      .select('id, name, ruby, image_url, metadata')
      .in('id', profile.favorite_actress_ids as string[])
    favoriteActresses = actresses ?? []
  }

  return NextResponse.json({ ...profile, email: user.email, favoriteActresses })
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

  // ── 現在のプロフィールを取得（バリデーション + 二つ名チェック用）──────────────
  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('titles_data, stars_count, favorite_actress_ids, favorite_change_count, display_name, created_at')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle()

  // ── favorite_actress_ids バリデーション ───────────────────────────────────
  if ('favorite_actress_ids' in patch) {
    const ids = patch.favorite_actress_ids as unknown[]
    if (!Array.isArray(ids)) {
      return NextResponse.json({ error: 'favorite_actress_ids must be an array' }, { status: 400 })
    }

    const stars   = (currentProfile?.stars_count ?? 0) as number
    const maxFavs = stars >= 6 ? 9 : stars >= 3 ? 6 : 3

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

    // お気に入り変更回数をインクリメント
    patch.favorite_change_count = (currentProfile?.favorite_change_count ?? 0) + 1
  }

  // ── title バリデーション ──────────────────────────────────────────────────
  if ('title' in patch && patch.title !== null) {
    const unlocked = ((currentProfile?.titles_data ?? []) as UnlockedTitle[]).map(t => t.id)
    if (!unlocked.includes(patch.title as string)) {
      return NextResponse.json({ error: 'Title not unlocked' }, { status: 400 })
    }
  }

  // ── 更新 ──────────────────────────────────────────────────────────────────
  const { data: updated, error: dbErr } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .select()
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  // ── 二つ名: shadow_warrior（初回 display_name 設定）─────────────────────────
  if ('display_name' in patch && patch.display_name && !currentProfile?.display_name) {
    void supabase.from('user_achievements').upsert([{
      user_id:     user.id,
      brand_id:    BRAND_ID,
      epithet_id:  'shadow_warrior',
      achieved_at: new Date().toISOString(),
    }], { onConflict: 'user_id,brand_id,epithet_id', ignoreDuplicates: true })
  }

  // ── お気に入り更新後の処理 ────────────────────────────────────────────────
  if ('favorite_actress_ids' in patch) {
    const newFavIds  = patch.favorite_actress_ids as string[]
    const oldFavIds  = (currentProfile?.favorite_actress_ids ?? []) as string[]
    const removedIds = oldFavIds.filter(id => !newFavIds.includes(id))
    const allIds     = [...new Set([...newFavIds, ...removedIds])]

    // 王冠判定用データ（新旧まとめて並列取得）
    const [actressResult, clickResult, lpResult] = await Promise.all([
      allIds.length > 0
        ? supabase.from('actresses').select('id, external_id').in('id', allIds)
        : Promise.resolve({ data: [] }),
      supabase.rpc('get_user_actress_purchase_clicks', { p_user_id: user.id, p_brand_id: BRAND_ID }),
      allIds.length > 0
        ? supabase.from('sn_favorite_actresses')
            .select('actress_id, lp_points')
            .eq('user_id',  user.id)
            .eq('brand_id', BRAND_ID)
            .in('actress_id', allIds)
        : Promise.resolve({ data: [] }),
    ])

    const allActresses = (actressResult.data ?? []) as { id: string; external_id: string }[]
    const clickMap = new Map(
      ((clickResult.data ?? []) as { actress_external_id: string; purchase_clicks: number }[])
        .map(r => [r.actress_external_id, Number(r.purchase_clicks)])
    )
    const lpMap = new Map(
      ((lpResult.data ?? []) as { actress_id: string; lp_points: number }[])
        .map(r => [r.actress_id, Number(r.lp_points)])
    )

    const hasCrown = (a: { id: string; external_id: string }) =>
      (clickMap.get(a.external_id) ?? 0) >= CROWN_CLICK_THRESHOLD &&
      (lpMap.get(a.id) ?? 0) >= CROWN_LP_THRESHOLD

    // 二つ名: kabukimono（王冠達成女優を解除）
    if (removedIds.length > 0) {
      const removedActresses = allActresses.filter(a => removedIds.includes(a.id))
      if (removedActresses.some(hasCrown)) {
        void supabase.from('user_achievements').upsert([{
          user_id:     user.id,
          brand_id:    BRAND_ID,
          epithet_id:  'kabukimono',
          achieved_at: new Date().toISOString(),
        }], { onConflict: 'user_id,brand_id,epithet_id', ignoreDuplicates: true })
      }
    }

    // 二つ名: endless_cycle（累計 10 回お気に入り変更）
    if ((patch.favorite_change_count as number) >= 10) {
      void supabase.from('user_achievements').upsert([{
        user_id:     user.id,
        brand_id:    BRAND_ID,
        epithet_id:  'endless_cycle',
        achieved_at: new Date().toISOString(),
      }], { onConflict: 'user_id,brand_id,epithet_id', ignoreDuplicates: true })
    }

    // 称号解除チェック（VERITY マスター含む）
    const crownIds = allActresses
      .filter(a => newFavIds.includes(a.id) && hasCrown(a))
      .map(a => a.id)

    const { data: prof } = await supabase
      .from('profiles')
      .select('created_at, titles_data, favorite_actress_ids')
      .eq('user_id', user.id)
      .eq('brand_id', BRAND_ID)
      .single()

    if (prof) {
      const existing = (prof.titles_data as UnlockedTitle[]).map(t => t.id)
      const newTitleIds = computeUnlocks({
        createdAt:        new Date(prof.created_at),
        favCount:         newFavIds.length,
        existingUnlocked: existing,
        favoriteIds:      newFavIds,
        crownIds,
      })

      if (newTitleIds.length > 0) {
        const now       = new Date().toISOString()
        const additions = newTitleIds.map(id => ({ id, unlocked_at: now }))
        await supabase.from('profiles')
          .update({ titles_data: [...(prof.titles_data as UnlockedTitle[]), ...additions] })
          .eq('user_id', user.id)
          .eq('brand_id', BRAND_ID)
      }
    }

    revalidatePath('/verity/profile',        'layout')
    revalidatePath('/verity/actresses/[id]', 'page')
  }

  return NextResponse.json(updated)
}
