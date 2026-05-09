import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'
import {
  TITLE_DEFS, TITLE_MAP, computeGenreTitle, computeActivityTitle,
  CROWN_POINTS_THRESHOLD,
} from '@/lib/titles'
import type { Profile, Actress, UnlockedTitle } from '@/lib/types'
import type { GenreStats, TitleDef } from '@/lib/titles'
import { isBadImageUrl, cidToCdnUrl } from '@/lib/cidUtils'

export const metadata: Metadata = {
  title: 'マイページ — VERITY',
  description: 'VERITY メンバープロフィール・お気に入り設定',
}

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/verity/login?next=/verity/profile')

  // プロフィール取得（未作成なら作成）
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .eq('brand_id', BRAND_ID)
    .maybeSingle() as { data: Profile | null }

  let resolvedProfile = profile
  if (!resolvedProfile) {
    const now = new Date().toISOString()
    const { data: inserted } = await supabase
      .from('profiles')
      .insert({
        user_id:     user.id,
        brand_id:    BRAND_ID,
        title:       'newcomer',
        titles_data: [{ id: 'newcomer', unlocked_at: now }],
      })
      .select('*')
      .single() as { data: Profile | null }
    resolvedProfile = inserted
  }

  // お気に入り女優の詳細を取得
  let favoriteActresses: Actress[] = []
  if (resolvedProfile && resolvedProfile.favorite_actress_ids.length > 0) {
    const { data } = await supabase
      .from('actresses')
      .select('id, name, ruby, image_url, metadata, external_id')
      .in('id', resolvedProfile.favorite_actress_ids)
    favoriteActresses = (data ?? []) as Actress[]

    // image_url が欠落している場合、latest_cid から articles 経由で補完
    const needsAug = favoriteActresses.filter(
      a => isBadImageUrl(a.image_url) && a.metadata?.latest_cid,
    )
    if (needsAug.length > 0) {
      const cids = needsAug.map(a => a.metadata!.latest_cid as string)
      const { data: artRows } = await supabase
        .from('articles')
        .select('external_id, image_url')
        .in('external_id', cids)
        .not('image_url', 'is', null)
      const artMap = new Map(
        (artRows ?? []).map(r => [r.external_id as string, r.image_url as string]),
      )
      favoriteActresses = favoriteActresses.map(a => {
        if (isBadImageUrl(a.image_url) && a.metadata?.latest_cid) {
          const fromArt = artMap.get(a.metadata.latest_cid as string)
          if (fromArt && !isBadImageUrl(fromArt)) return { ...a, image_url: fromArt }
          return { ...a, image_url: cidToCdnUrl(a.metadata.latest_cid as string, 'pl') }
        }
        return a
      })
    }
  }

  // ── 行動ログ集計 ──────────────────────────────────────────────────────────
  const { data: logRows } = await supabase
    .from('sn_user_logs')
    .select('target_type, target_id')
    .eq('user_id',  user.id)
    .eq('brand_id', BRAND_ID)

  const genreMap = new Map<string, number>()
  let totalClicks = 0
  for (const row of logRows ?? []) {
    totalClicks++
    if (row.target_type === 'genre') {
      genreMap.set(row.target_id, (genreMap.get(row.target_id) ?? 0) + 1)
    }
  }

  const topGenres: GenreStats[] = [...genreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ id, count }))

  const genreTitle    = computeGenreTitle(topGenres)
  const activityTitle = computeActivityTitle(totalClicks)

  // ── 女優別ポイント集計（SECURITY DEFINER 経由） ───────────────────────────
  const { data: pointRows } = await supabase
    .rpc('get_user_actress_points', { p_user_id: user.id, p_brand_id: BRAND_ID })

  const pointMap = new Map(
    ((pointRows ?? []) as { actress_external_id: string; points: number }[])
      .map(r => [r.actress_external_id, Number(r.points)])
  )

  // 王冠バッジ獲得済み女優の UUID セット（お気に入り内）
  const crownActressIds = favoriteActresses
    .filter(a => (pointMap.get(a.external_id) ?? 0) >= CROWN_POINTS_THRESHOLD)
    .map(a => a.id)

  // ── 解除済み静的称号 ──────────────────────────────────────────────────────
  const unlocked = ((resolvedProfile?.titles_data ?? []) as UnlockedTitle[])
    .map(t => ({ def: TITLE_MAP[t.id] as TitleDef | undefined, unlocked_at: t.unlocked_at }))
    .filter((t): t is { def: TitleDef; unlocked_at: string } => !!t.def)

  // VERITY マスター称号保持者は最大6名まで追加可能
  const unlockedIds = unlocked.map(t => t.def.id)
  const isMaster    = unlockedIds.includes('verity_master')
  const maxFavorites = isMaster ? 6 : 3

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 space-y-8">
      <ProfileClient
        user={{ id: user.id, email: user.email ?? '' }}
        profile={resolvedProfile}
        favoriteActresses={favoriteActresses}
        unlockedTitles={unlocked}
        allTitleDefs={TITLE_DEFS}
        topGenres={topGenres}
        genreTitle={genreTitle}
        activityTitle={activityTitle}
        totalClicks={totalClicks}
        crownActressIds={crownActressIds}
        maxFavorites={maxFavorites}
      />
    </div>
  )
}
