import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileClient } from './ProfileClient'
import {
  TITLE_DEFS, TITLE_MAP, computeGenreTitle, computeActivityTitle,
  CROWN_CLICK_THRESHOLD, CROWN_LP_THRESHOLD,
} from '@/lib/titles'
import type { Profile, Actress, UnlockedTitle } from '@/lib/types'
import type { GenreStats, TitleDef } from '@/lib/titles'
import { isBadImageUrl, cidToCdnUrl } from '@/lib/cidUtils'

export const metadata: Metadata = {
  title: 'マイページ — VERITY',
  description: 'VERITY メンバープロフィール・お気に入り設定',
}

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

export type LoginBonusResult = {
  already_claimed?: boolean
  ok?:              boolean
  bonus?:           number
  streak?:          number
  is_week?:         boolean
  balance?:         number
  error?:           string
}

type LogRow = {
  target_type: string
  target_id:   string
  created_at:  string
  action_type: string
}

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/verity/login?next=/verity/profile')

  // ── ログインボーナスを先に付与（DBを更新してから profile を取得） ──────────────
  let bonusResult: LoginBonusResult = {}
  const { data: bonusData, error: bonusErr } = await supabase.rpc('claim_login_bonus', {
    p_user_id:  user.id,
    p_brand_id: BRAND_ID,
  })
  if (!bonusErr && bonusData) bonusResult = bonusData as LoginBonusResult

  // ── プロフィール取得 ────────────────────────────────────────────────────────
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

  // ── 全データを並列取得 ──────────────────────────────────────────────────────
  const favIds      = resolvedProfile?.favorite_actress_ids ?? []
  const lastChecked = resolvedProfile?.last_gallery_checked_at ?? null

  const [
    actressResult,
    logResult,
    lpFavResult,
    lpAllResult,
    clickResult,
    achievementResult,
  ] = await Promise.all([
    favIds.length > 0
      ? supabase.from('actresses')
          .select('id, name, ruby, image_url, metadata, external_id')
          .in('id', favIds)
      : Promise.resolve({ data: [] as Actress[], error: null }),
    supabase.from('sn_user_logs')
      .select('target_type, target_id, created_at, action_type')
      .eq('user_id',  user.id)
      .eq('brand_id', BRAND_ID),
    favIds.length > 0
      ? supabase.from('sn_favorite_actresses')
          .select('actress_id, lp_points')
          .eq('user_id',  user.id)
          .eq('brand_id', BRAND_ID)
          .in('actress_id', favIds)
      : Promise.resolve({ data: [], error: null }),
    // All-time LP given to any actress (for cumulative display)
    supabase.from('sn_favorite_actresses')
      .select('lp_points')
      .eq('user_id',  user.id)
      .eq('brand_id', BRAND_ID),
    supabase.rpc('get_user_actress_purchase_clicks', { p_user_id: user.id, p_brand_id: BRAND_ID }),
    supabase.from('user_achievements')
      .select('epithet_id')
      .eq('user_id',  user.id)
      .eq('brand_id', BRAND_ID),
  ])

  let favoriteActresses = (actressResult.data ?? []) as Actress[]
  const logRows         = (logResult.data   ?? []) as LogRow[]
  const earnedSet       = new Set(
    (achievementResult.data ?? []).map(r => (r as { epithet_id: string }).epithet_id)
  )

  // ── LP マップ ────────────────────────────────────────────────────────────────
  const lpPointsMap: Record<string, number> = {}
  for (const row of (lpFavResult.data ?? []) as { actress_id: string; lp_points: number }[]) {
    lpPointsMap[row.actress_id] = row.lp_points ?? 0
  }

  // 累計LP = 現在残高 + 全女優へ送った合計
  const totalLpGiven = ((lpAllResult.data ?? []) as { lp_points: number }[])
    .reduce((sum, r) => sum + (r.lp_points ?? 0), 0)
  const lpTotalAccumulated = (resolvedProfile?.lp_balance ?? 0) + totalLpGiven

  // ── 購入クリック マップ ────────────────────────────────────────────────────
  const clickMap = new Map(
    ((clickResult.data ?? []) as { actress_external_id: string; purchase_clicks: number }[])
      .map(r => [r.actress_external_id, Number(r.purchase_clicks)])
  )

  // ── 行動ログ集計 ───────────────────────────────────────────────────────────
  const genreMap = new Map<string, number>()
  let totalClicks = 0
  for (const row of logRows) {
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

  // ── セカンダリ並列クエリ ────────────────────────────────────────────────────
  const favNames        = favoriteActresses.map(a => a.name)
  const articleViewRows = logRows.filter(r => r.target_type === 'article')
  const articleSlugs    = [...new Set(articleViewRows.map(r => r.target_id).filter(Boolean))]
  const needsAug        = favoriteActresses.filter(a => isBadImageUrl(a.image_url) && a.metadata?.latest_cid)
  const augCids         = needsAug.map(a => a.metadata!.latest_cid as string)

  const newPostsBase = supabase
    .from('social_feeds')
    .select('id', { count: 'exact', head: true })
    .not('image_url', 'is', null)
  const newPostsQuery = favNames.length > 0
    ? (lastChecked
        ? newPostsBase.in('actress_name', favNames).gt('created_at', lastChecked)
        : newPostsBase.in('actress_name', favNames))
    : newPostsBase.eq('id', '_never_')

  const [
    augArtResult,
    soloArtResult,
    newsSlugResult,
    coverageResult,
    newPostsResult,
  ] = await Promise.all([
    augCids.length > 0
      ? supabase.from('articles')
          .select('external_id, image_url')
          .in('external_id', augCids)
          .not('image_url', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    favNames.length > 0
      ? supabase.from('articles')
          .select('tags, image_url, metadata, published_at')
          .overlaps('tags', favNames)
          .not('image_url', 'is', null)
          .order('published_at', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [], error: null }),
    articleSlugs.length > 0
      ? supabase.from('sn_news').select('slug, published_at').in('slug', articleSlugs)
      : Promise.resolve({ data: [], error: null }),
    favNames.length > 0
      ? supabase.from('social_feeds').select('actress_name').in('actress_name', favNames)
      : Promise.resolve({ data: [], error: null }),
    newPostsQuery,
  ])

  // ── 壊れた画像を articles テーブルの画像で補完 ─────────────────────────────
  if (augCids.length > 0) {
    const artMap = new Map(
      ((augArtResult.data ?? []) as { external_id: string; image_url: string }[])
        .map(r => [r.external_id, r.image_url])
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

  // ── 最新ソロ作品の画像で上書き ─────────────────────────────────────────────
  const soloImageMap = new Map<string, string>()
  for (const art of (soloArtResult.data ?? []) as {
    tags: string[] | null
    image_url: string | null
    metadata: Record<string, unknown> | null
    published_at: string | null
  }[]) {
    const actressArr = Array.isArray(art.metadata?.actress) ? art.metadata!.actress as unknown[] : null
    if (!actressArr || actressArr.length !== 1 || !art.image_url) continue
    const tags = art.tags ?? []
    for (const name of favNames) {
      if (!soloImageMap.has(name) && tags.includes(name)) {
        soloImageMap.set(name, art.image_url)
      }
    }
  }
  favoriteActresses = favoriteActresses.map(a => {
    const soloImg = soloImageMap.get(a.name)
    return soloImg ? { ...a, image_url: soloImg } : a
  })

  // ── sn_news published_at マップ（clairvoyant / swift_reader 用）────────────
  const articlePubMap = new Map<string, string | null>(
    ((newsSlugResult.data ?? []) as { slug: string; published_at: string | null }[])
      .map(r => [r.slug, r.published_at])
  )

  // ── ギャラリー未読判定 ──────────────────────────────────────────────────────
  const coveredSet = new Set(
    ((coverageResult.data ?? []) as { actress_name: string }[]).map(r => r.actress_name)
  )
  const missingSnsActresses = favoriteActresses.filter(a => !coveredSet.has(a.name))
  const hasNewGalleryPosts  = ((newPostsResult as { count: number | null }).count ?? 0) > 0

  // ── 王冠バッジ判定 ─────────────────────────────────────────────────────────
  const crownActressIds = favoriteActresses
    .filter(a => {
      const clicks   = clickMap.get(a.external_id) ?? 0
      const lpPoints = lpPointsMap[a.id] ?? 0
      return clicks >= CROWN_CLICK_THRESHOLD && lpPoints >= CROWN_LP_THRESHOLD
    })
    .map(a => a.id)

  // ── Stars 計算 & DB 同期（ratchet） ───────────────────────────────────────
  const crownCount      = crownActressIds.length
  const dbStars         = resolvedProfile?.stars_count ?? 0
  const crownBasedStars = crownCount >= 9 ? 9 : crownCount >= 6 ? 6 : crownCount >= 3 ? 3 : 0
  const starsCount      = Math.max(dbStars, crownBasedStars)
  const maxFavorites    = starsCount >= 6 ? 9 : starsCount >= 3 ? 6 : 3
  const isLegend        = starsCount >= 9

  if (crownBasedStars > dbStars) {
    void supabase.rpc('sync_user_stars', {
      p_user_id:     user.id,
      p_brand_id:    BRAND_ID,
      p_crown_count: crownCount,
    })
  }

  // ── 解除済み称号 ───────────────────────────────────────────────────────────
  const unlocked = ((resolvedProfile?.titles_data ?? []) as UnlockedTitle[])
    .map(t => {
      const staticDef = TITLE_MAP[t.id] as TitleDef | undefined
      if (staticDef) return { def: staticDef, unlocked_at: t.unlocked_at }
      if (t.name && t.id.startsWith('actress_master_')) {
        return {
          def: { id: t.id, name: t.name, desc: '100 LP を捧げた女優', icon: '🌟' } as TitleDef,
          unlocked_at: t.unlocked_at,
        }
      }
      return null
    })
    .filter((t): t is { def: TitleDef; unlocked_at: string } => !!t)

  // ── 二つ名 達成判定 ────────────────────────────────────────────────────────

  const articleViewCount  = articleViewRows.length
  const searchLogCount    = logRows.filter(r => r.target_type === 'search').length
  const snsShareCount     = logRows.filter(r => r.target_type === 'sns').length

  // 午前4時台 JST = UTCHour 19 (4 - 9 = -5 → +24 = 19)
  const cyberGhostCount = articleViewRows.filter(r => {
    if (!r.created_at) return false
    return (new Date(r.created_at).getUTCHours() + 9) % 24 === 4
  }).length

  // 先行閲覧（published_at の10日以上前に閲覧）
  const isClairvoyant = articleViewRows.some(r => {
    const pub = articlePubMap.get(r.target_id)
    if (!pub || !r.created_at) return false
    return (new Date(pub).getTime() - new Date(r.created_at).getTime()) / 86400000 >= 10
  })

  // 公開日当日閲覧（JST 日付で比較）
  const toJSTDate = (iso: string) =>
    new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const isSwiftReader = articleViewRows.some(r => {
    const pub = articlePubMap.get(r.target_id)
    if (!pub || !r.created_at) return false
    return toJSTDate(r.created_at) === toJSTDate(pub)
  })

  // LP 集計
  const lpValues           = Object.values(lpPointsMap)
  const maxLp              = lpValues.length > 0 ? Math.max(...lpValues) : 0
  const totalLp            = lpValues.reduce((s, v) => s + v, 0)
  const totalPurchaseClicks = [...clickMap.values()].reduce((s, v) => s + v, 0)
  const hasActressMaster    = (resolvedProfile?.titles_data ?? []).some(
    (t: UnlockedTitle) => t.id.startsWith('actress_master_'),
  )

  // 条件チェック & 未付与リスト作成
  const toAward: string[] = []
  const check = (id: string, cond: boolean) => { if (cond && !earnedSet.has(id)) toAward.push(id) }

  check('rising_star',      favoriteActresses.length >= 1)
  check('first_action',     totalPurchaseClicks >= 1)
  check('devoted_guardian', maxLp >= 30)
  check('twin_wings',       crownActressIds.length >= 2)
  check('three_heroes',     crownActressIds.length >= 3)
  check('six_paths',        crownActressIds.length >= 6)
  check('strategist',       favoriteActresses.length >= 3)
  check('conquest',         starsCount >= 9)
  check('neon_overlord',    isLegend)
  check('wind_fire',        totalPurchaseClicks >= 50)
  check('golden_lion',      totalLpGiven >= 300)
  check('conquering_march', (resolvedProfile?.login_days_count ?? 0) >= 30)
  check('endless_cycle',    (resolvedProfile?.favorite_change_count ?? 0) >= 10)
  check('invincible_gem',   maxLp >= 100 || hasActressMaster)
  check('dawn_scout',       articleViewCount >= 5)
  check('data_diver',       articleViewCount >= 100)
  check('info_hermit',      searchLogCount >= 10)
  check('digital_bard',     snsShareCount >= 1)
  check('cyber_ghost',      cyberGhostCount >= 5)
  check('clairvoyant',      isClairvoyant)
  check('swift_reader',     isSwiftReader)
  // truth_seeker: 獲得済み + 今回付与分が 15 以上
  check('truth_seeker',     earnedSet.size + toAward.length >= 15)

  // 一括付与（冪等 upsert）
  if (toAward.length > 0) {
    const now = new Date().toISOString()
    await supabase.from('user_achievements').upsert(
      toAward.map(epithet_id => ({ user_id: user.id, brand_id: BRAND_ID, epithet_id, achieved_at: now })),
      { onConflict: 'user_id,brand_id,epithet_id', ignoreDuplicates: true },
    )
    for (const id of toAward) earnedSet.add(id)
  }

  const earnedEpithetIds = [...earnedSet]

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
        starsCount={starsCount}
        isLegend={isLegend}
        lpBalance={resolvedProfile?.lp_balance ?? 0}
        lpTotalAccumulated={lpTotalAccumulated}
        loginStreak={resolvedProfile?.login_streak ?? 0}
        bonusResult={bonusResult}
        lpPointsMap={lpPointsMap}
        hasNewGalleryPosts={hasNewGalleryPosts}
        missingSnsActresses={missingSnsActresses}
        earnedEpithetIds={earnedEpithetIds}
      />
    </div>
  )
}
