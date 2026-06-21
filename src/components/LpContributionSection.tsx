import Link from 'next/link'
import { Crown, Heart, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { withAffiliateForRegion } from '@/lib/affiliate'
import { coverPosClass } from '@/lib/cidUtils'
import { FanzaLink } from './FanzaLink'
import type { Article, Actress } from '@/lib/types'

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

type DonationRow = { user_id: string; actress_id: string; lp_points: number }
type ProfileRow  = { user_id: string; display_name: string | null }
type ActressRow  = { id: string; name: string; external_id: string; image_url: string | null }

type RankEntry = {
  rank:        number
  userId:      string
  displayName: string
  total:       number
  topActress:  ActressRow | null
}

export async function LpContributionSection() {
  const supabase   = await createClient()
  const isOverseas = await getIsOverseasUser()

  // ── 全ブランドのLP送信履歴（上位100件で集計） ──────────────────────────────
  const { data: rawRows } = await supabase
    .from('sn_favorite_actresses')
    .select('user_id, actress_id, lp_points')
    .eq('brand_id', BRAND_ID)
    .gt('lp_points', 0)
    .order('lp_points', { ascending: false })
    .limit(100)

  const donations = (rawRows ?? []) as DonationRow[]
  if (!donations.length) return null

  // ── JS集計: ユーザーごとの総LP・推し女優ID ──────────────────────────────────
  const userTotalMap = new Map<string, number>()
  const userTopActressMap = new Map<string, string>()

  for (const row of donations) {
    userTotalMap.set(row.user_id, (userTotalMap.get(row.user_id) ?? 0) + row.lp_points)
    // donations is already sorted by lp_points desc → first occurrence per user = their top actress
    if (!userTopActressMap.has(row.user_id)) {
      userTopActressMap.set(row.user_id, row.actress_id)
    }
  }

  const topUsersSorted = [...userTotalMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (!topUsersSorted.length) return null

  const topUserIds    = topUsersSorted.map(([uid]) => uid)
  const topActressIds = [...new Set(topUsersSorted.map(([uid]) => userTopActressMap.get(uid)).filter(Boolean))] as string[]

  // ── 並列取得: プロフィール + 女優 ─────────────────────────────────────────
  const [profileResult, actressResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', topUserIds)
      .eq('brand_id', BRAND_ID),
    supabase
      .from('actresses')
      .select('id, name, external_id, image_url')
      .in('id', topActressIds)
      .eq('is_active', true),
  ])

  const profileMap = new Map<string, string>(
    ((profileResult.data ?? []) as ProfileRow[]).map(p => [p.user_id, p.display_name ?? 'VERITYメンバー'])
  )
  const actressMap = new Map<string, ActressRow>(
    ((actressResult.data ?? []) as ActressRow[]).map(a => [a.id, a])
  )

  const ranking: RankEntry[] = topUsersSorted.map(([userId, total], i) => ({
    rank:        i + 1,
    userId,
    displayName: profileMap.get(userId) ?? 'VERITYメンバー',
    total,
    topActress:  actressMap.get(userTopActressMap.get(userId) ?? '') ?? null,
  }))

  // ── Top contributorの推し女優の最新作を取得 ────────────────────────────────
  const featuredActress = ranking[0]?.topActress
  let featuredArticle: (Article & { affiliateUrl: string | null }) | null = null

  if (featuredActress) {
    const { data: artData } = await supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', [featuredActress.name])
      .lte('published_at', new Date().toISOString())
      .not('image_url', 'is', null)
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (artData) {
      const art  = artData as Article
      const meta = (art.metadata ?? {}) as Record<string, unknown>
      const rawUrl = (meta.affiliate_url ?? meta.url) as string | null
      featuredArticle = { ...art, affiliateUrl: withAffiliateForRegion(rawUrl, isOverseas) }
    }
  }

  const RANK_COLORS = [
    { text: 'text-amber-400',   border: 'border-amber-400/30',  bg: 'bg-amber-400/10',  glow: 'shadow-[0_0_16px_rgba(251,191,36,0.2)]' },
    { text: 'text-slate-300',   border: 'border-slate-300/20',  bg: 'bg-slate-300/8',   glow: '' },
    { text: 'text-amber-600',   border: 'border-amber-600/20',  bg: 'bg-amber-700/8',   glow: '' },
  ]

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Crown size={17} className="text-amber-400" />
        <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
          LP長者番付
        </h2>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/25">
          累計トップ貢献者
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">

        {/* Ranking list */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2.5rem_1fr_auto_10rem] gap-x-3 border-b border-[var(--border)] px-4 py-2.5 text-[9px] uppercase tracking-widest text-[var(--text-muted)]">
            <span className="text-center">順位</span>
            <span>ユーザー</span>
            <span className="hidden sm:block">推し女優</span>
            <span className="text-right">累計LP</span>
          </div>

          {ranking.map((entry) => {
            const rc = RANK_COLORS[entry.rank - 1]
            return (
              <div
                key={entry.userId}
                className={[
                  'grid grid-cols-[2.5rem_1fr_auto_10rem] gap-x-3 items-center px-4 py-3 border-b border-[var(--border)] last:border-0',
                  entry.rank <= 3 ? rc.glow : '',
                ].join(' ')}
              >
                {/* Rank badge */}
                <div className="flex justify-center">
                  {entry.rank <= 3 ? (
                    <span className={[
                      'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black border',
                      rc.bg, rc.border, rc.text,
                    ].join(' ')}>
                      {entry.rank}
                    </span>
                  ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--surface-2)] text-[10px] font-bold text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                      {entry.rank}
                    </span>
                  )}
                </div>

                {/* Display name */}
                <span className={[
                  'truncate text-sm font-bold',
                  entry.rank === 1 ? 'text-amber-300' : 'text-[var(--text)]',
                ].join(' ')}>
                  {entry.displayName}
                </span>

                {/* Top actress */}
                <span className="hidden sm:block truncate text-[11px] text-[var(--text-muted)] max-w-[8rem]">
                  {entry.topActress
                    ? (
                      <Link
                        href={`/verity/actresses/${entry.topActress.external_id}`}
                        className="text-[var(--magenta)] hover:underline"
                      >
                        {entry.topActress.name}
                      </Link>
                    )
                    : '—'
                  }
                </span>

                {/* LP total */}
                <div className="flex items-center justify-end gap-1 text-sm font-black">
                  <Heart size={11} className={entry.rank === 1 ? 'fill-amber-400 text-amber-400' : 'fill-[var(--magenta)] text-[var(--magenta)]'} />
                  <span className={entry.rank === 1 ? 'text-amber-300' : 'text-[var(--text)]'}>
                    {entry.total.toLocaleString()} LP
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Featured: top contributor's fave actress × latest article */}
        {featuredArticle && featuredActress && (
          <div className="rounded-2xl border border-amber-400/25 bg-[var(--surface)] overflow-hidden shadow-[0_0_24px_rgba(251,191,36,0.10)]">
            <div className="border-b border-[var(--border)] px-4 py-2.5">
              <p className="text-[9px] uppercase tracking-widest text-amber-400 font-bold">
                トップ貢献ユーザーの推し女優
              </p>
              <Link
                href={`/verity/actresses/${featuredActress.external_id}`}
                className="mt-0.5 block text-sm font-bold text-[var(--text)] hover:text-[var(--magenta)] transition-colors"
              >
                {featuredActress.name}
              </Link>
            </div>

            {/* Article card */}
            {featuredArticle.affiliateUrl ? (
              <FanzaLink
                href={featuredArticle.affiliateUrl}
                targetId={featuredArticle.external_id}
                position="lp_ranking_actress"
                className="group/lp block"
              >
                {featuredArticle.image_url && (
                  <div className="relative aspect-[16/9] overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/proxy/image?url=${encodeURIComponent(featuredArticle.image_url)}`}
                      alt={featuredArticle.title}
                      className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(featuredArticle.image_url)} transition-transform duration-300 group-hover/lp:scale-105`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                    <span className="absolute bottom-2 right-2 rounded-full bg-[var(--magenta)] px-2 py-0.5 text-[9px] font-bold text-white">
                      ▶ 観る
                    </span>
                  </div>
                )}
                <div className="p-3 space-y-2">
                  <p className="text-[11px] font-semibold leading-snug text-[var(--text)] line-clamp-2">
                    {featuredArticle.title}
                  </p>
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--magenta)]">
                    FANZAで観る <ExternalLink size={9} />
                  </span>
                </div>
              </FanzaLink>
            ) : (
              <div className="p-3">
                <p className="text-[11px] font-semibold leading-snug text-[var(--text)] line-clamp-2">
                  {featuredArticle.title}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
