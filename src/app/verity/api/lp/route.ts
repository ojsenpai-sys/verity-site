import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { computeCrownActressIds, computeStarsFromCrownCount, isVerityMaster } from '@/lib/titles'
import type { UnlockedTitle } from '@/lib/types'
import { computeMaxFavorites } from '@/lib/slotUtils'

export const dynamic = 'force-dynamic'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { actress_id?: string; amount?: number }
  try { body = await request.json() } catch { body = {} }

  const { actress_id, amount = 1 } = body

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!actress_id || !uuidRe.test(actress_id)) {
    return NextResponse.json({ error: 'actress_id must be a valid UUID' }, { status: 400 })
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return NextResponse.json({ error: 'amount must be 1–100' }, { status: 400 })
  }

  // LP投入自体の意味・ポイント計算は transfer_lp_to_actress RPC のまま変更しない。
  const { data, error } = await supabase.rpc('transfer_lp_to_actress', {
    p_user_id:    user.id,
    p_brand_id:   BRAND_ID,
    p_actress_id: actress_id,
    p_amount:     amount,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (data?.error) {
    const statusMap: Record<string, number> = {
      insufficient_balance:     400,
      actress_not_in_favorites: 400,
      invalid_amount:           400,
      lp_cap_reached:           400,
      unauthorized:             401,
    }
    return NextResponse.json(data, { status: statusMap[data.error] ?? 500 })
  }

  // ── 王冠 / Stars / VERITY マスターをこのLP投入結果で即時再評価 ──────────────────
  // LP transfer RPCは変更せず、ここで既存の sync_user_stars RPC と titles_data 更新
  // （api/profile/route.ts と同じパターン）を呼ぶだけ。ページ再読み込みや
  // お気に入り変更操作を要求せず、この1レスポンスでクライアントへ最新状態を返す。
  const { data: profile } = await supabase
    .from('profiles')
    .select('favorite_actress_ids, stars_count, titles_data, is_subscribed, subscription_expires_at, purchased_slots')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle()

  let crownActressIds: string[] = []
  let starsCount       = profile?.stars_count ?? 0
  let newVerityMaster  = false

  if (profile) {
    const favIds = (profile.favorite_actress_ids ?? []) as string[]
    const { data: lpRows } = favIds.length > 0
      ? await supabase.from('sn_favorite_actresses')
          .select('actress_id, lp_points')
          .eq('user_id',  user.id)
          .eq('brand_id', BRAND_ID)
          .in('actress_id', favIds)
      : { data: [] as { actress_id: string; lp_points: number }[] }

    const lpPointsMap = Object.fromEntries(
      ((lpRows ?? []) as { actress_id: string; lp_points: number }[]).map(r => [r.actress_id, r.lp_points]),
    )
    crownActressIds = computeCrownActressIds(favIds, lpPointsMap)

    const crownBasedStars = computeStarsFromCrownCount(crownActressIds.length)
    if (crownBasedStars > starsCount) {
      // Supabase の PostgrestBuilder は then() が呼ばれて初めて実 HTTP request を送信する
      // (lazy-fetch) ため、void で捨てるとリクエスト自体が一度も送信されない。必ず await する。
      // LP投入自体(transfer_lp_to_actress)は既に成功済みなので、ここでの同期失敗を理由に
      // レスポンス全体を失敗扱いにはしない。
      const { error: syncStarsError } = await supabase.rpc('sync_user_stars', {
        p_user_id:     user.id,
        p_brand_id:    BRAND_ID,
        p_crown_count: crownActressIds.length,
      })
      if (syncStarsError) {
        console.error('[VERITY crown backfill] sync_user_stars failed:', syncStarsError.message)
      }
      starsCount = Math.max(starsCount, crownBasedStars)
    }

    const titlesData = (profile.titles_data ?? []) as UnlockedTitle[]
    const hasMasterTitle = titlesData.some(t => t.id === 'verity_master')
    if (isVerityMaster(crownActressIds.length) && !hasMasterTitle) {
      const { error: titlesUpdateError } = await supabase.from('profiles')
        .update({ titles_data: [...titlesData, { id: 'verity_master', unlocked_at: new Date().toISOString() }] })
        .eq('user_id', user.id)
        .eq('brand_id', BRAND_ID)
      if (titlesUpdateError) {
        console.error('[VERITY crown backfill] titles_data update failed:', titlesUpdateError.message)
      } else {
        newVerityMaster = true
      }
    }
  }

  const maxFavorites = computeMaxFavorites(
    starsCount,
    profile?.is_subscribed          ?? false,
    profile?.subscription_expires_at ?? null,
    profile?.purchased_slots         ?? 0,
  )

  return NextResponse.json({
    ...data,
    crown_actress_ids: crownActressIds,
    stars_count:        starsCount,
    max_favorites:       maxFavorites,
    new_verity_master:  newVerityMaster,
  })
}
