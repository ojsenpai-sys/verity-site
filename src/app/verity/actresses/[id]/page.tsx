export const dynamic = 'force-dynamic'
export const revalidate = 0

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, ShoppingCart, Bookmark, UserCircle, Tag, Flame, ExternalLink, Heart, ChevronLeft, ChevronRight, BarChart2, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { SignatureWorks } from '@/components/SignatureWorks'
import { LogView } from '@/components/LogView'
import { ShareButton } from '@/components/ShareButton'
import { FavoriteButton } from '@/components/FavoriteButton'
import { withAffiliate, withAffiliateForRegion } from '@/lib/affiliate'
import { getIsOverseasUser } from '@/lib/geoLocale'
import { FanzaLink } from '@/components/FanzaLink'
import { PurchaseLink } from '@/components/PurchaseLink'
import { deduplicateDigitalFirst } from '@/lib/fanzaUtils'
import { ActressDiscoveryBlock } from './ActressDiscoveryBlock'
import { EditorNoteBlock } from '@/components/EditorNoteBlock'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import type { Article, Actress } from '@/lib/types'

// ── i18n ──────────────────────────────────────────────────────────────────────

type Lang = 'ja' | 'en' | 'zh'
type Params = { id: string }

const BRAND_ID = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'
const ARCHIVE_PAGE_SIZE = 48
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'] as const

const SYSTEM_TAGS = new Set([
  'ハイビジョン', '独占配信', '4K', '単体作品', '配信限定',
  'VR', 'バーチャルリアリティ', 'HIGH-VISION',
])

function getActivityStatus(publishedAt: string | null | undefined): 'active' | 'semi' | 'retired' {
  if (!publishedAt) return 'retired'
  const diffDays = (Date.now() - new Date(publishedAt).getTime()) / 86400000
  if (diffDays <= 365) return 'active'
  if (diffDays <= 1095) return 'semi'
  return 'retired'
}

function getLang(raw: string | undefined | null): Lang {
  if (raw === 'en') return 'en'
  if (raw === 'zh') return 'zh'
  return 'ja'
}

type Strs = {
  metaTitle:        (name: string, month: number) => string
  metaDesc:         (name: string) => string
  backHome:         string
  backProfile:      string
  works:            (n: number) => string
  preOrder:         string
  preOrderBadge:    string
  recent:           string
  recentBadge:      string
  fanzaSearch:      (name: string) => string
  saleSection:      string
  saleBadge:        string
  noSale:           string
  fanzaSaleLink:    (name: string) => string
  genreCatalog:     string
  genreBadge:       (name: string) => string
  ctaTitle:         (name: string) => string
  ctaSub:           string
  ctaBtn:           string
  prText:           string
  rankBoostNote:    string
  rankBoostLink:    string
  archiveTitle:     string
  archiveBadge:     (n: number) => string
  profileTitle:     string
  labelHeight:      string
  labelBust:        string
  labelWaist:       string
  labelHip:         string
  labelCup:         string
  labelBirthday:    string
  labelDebut:       string
  labelAgency:      string
  // Phase 1
  activityActive:   string
  activitySemi:     string
  activityRetired:  string
  statsTitle:       string
  statsTotalWorks:  string
  statsActivity:    string
  statsActivityNow: string
  statsTopMaker:    string
  statsLastRelease: string
  similarTitle:     string
  mainGenresTitle:  string
}

const I18N: Record<Lang, Strs> = {
  ja: {
    metaTitle:       (name, month) => `【${month}月最新】${name}の神作・出演動画まとめ！今すぐ使えるセール作品・無料サンプル情報【VERITY】`,
    metaDesc:        (name) => `${name}の最新作・セール中作品・無料サンプル動画を徹底まとめ。FANZAで視聴できる${name}出演AV作品をVERITY編集部がキュレーション。`,
    backHome:        'ダッシュボードへ戻る',
    backProfile:     'マイページへ戻る',
    works:           (n) => `全 ${n.toLocaleString()} 作品`,
    preOrder:        '予約受付中',
    preOrderBadge:   '先行予約',
    recent:          '最新作・準新作',
    recentBadge:     '今、買うべき作品',
    fanzaSearch:     (name) => `FANZAで${name}の全作品を検索`,
    saleSection:     'セール中の作品',
    saleBadge:       '期間限定',
    noSale:          '現在セール中の作品はありません',
    fanzaSaleLink:   (name) => `FANZAで${name}のセール作品をもっと見る`,
    genreCatalog:    'ジャンル別カタログ',
    genreBadge:      (name) => `${name} × ジャンル`,
    ctaTitle:        (name) => `${name}の全作品を今すぐチェック`,
    ctaSub:          '高画質・サンプル動画あり — 無料会員登録でポイントプレゼント中',
    ctaBtn:          'FANZAで見る — 無料サンプルあり',
    prText:          'アフィリエイト広告を含みます',
    rankBoostNote:   'お気に入り登録すると、この女優のランキングが +50pt ブーストされます',
    rankBoostLink:   'ランキングを見る',
    archiveTitle:    '全作品アーカイブ',
    archiveBadge:    (n) => `全${n.toLocaleString()}件`,
    profileTitle:    'プロフィール',
    labelHeight:     '身長',
    labelBust:       'バスト',
    labelWaist:      'ウエスト',
    labelHip:        'ヒップ',
    labelCup:        'カップ',
    labelBirthday:   '生年月日',
    labelDebut:      'デビュー年',
    labelAgency:     '所属事務所',
    activityActive:  '現役',
    activitySemi:    'セミリタイア',
    activityRetired: '引退',
    statsTitle:      'STATS',
    statsTotalWorks: '総作品数',
    statsActivity:   '活動期間',
    statsActivityNow:'現在',
    statsTopMaker:   '主要メーカー',
    statsLastRelease:'最新作',
    similarTitle:    '似た系統の女優',
    mainGenresTitle: 'MAIN GENRES',
  },
  en: {
    metaTitle:       (name, month) => `【Latest ${MONTHS_EN[month - 1]}】${name} Complete Works & Best Video Selection | VERITY`,
    metaDesc:        (name) => `Browse all ${name} videos on FANZA. Latest releases, sale picks & free sample movies curated by VERITY.`,
    backHome:        'Back to Dashboard',
    backProfile:     'My Page',
    works:           (n) => `${n.toLocaleString()} works total`,
    preOrder:        'Pre-order Available',
    preOrderBadge:   'Pre-order',
    recent:          'Latest Releases',
    recentBadge:     'Must-buy Now',
    fanzaSearch:     (name) => `Browse all ${name} works on FANZA`,
    saleSection:     'On Sale Now',
    saleBadge:       'Limited Time',
    noSale:          'No items currently on sale',
    fanzaSaleLink:   (name) => `See more ${name} sale items on FANZA`,
    genreCatalog:    'Genre Catalog',
    genreBadge:      (name) => `${name} × Genre`,
    ctaTitle:        (name) => `Browse All ${name} Works Now`,
    ctaSub:          'HD quality & free sample movies — sign up free to receive bonus points',
    ctaBtn:          'Watch on FANZA — Free Sample Available',
    prText:          'Contains affiliate links',
    rankBoostNote:   'Add to Favorites to boost this actress\'s VERITY ranking by +50pt',
    rankBoostLink:   'See Ranking',
    archiveTitle:    'Full Archive',
    archiveBadge:    (n) => `${n.toLocaleString()} total`,
    profileTitle:    'Profile',
    labelHeight:     'Height',
    labelBust:       'Bust',
    labelWaist:      'Waist',
    labelHip:        'Hip',
    labelCup:        'Cup',
    labelBirthday:   'Birthday',
    labelDebut:      'Debut',
    labelAgency:     'Agency',
    activityActive:  'Active',
    activitySemi:    'Semi-retired',
    activityRetired: 'Retired',
    statsTitle:      'STATS',
    statsTotalWorks: 'Total Works',
    statsActivity:   'Active Period',
    statsActivityNow:'Present',
    statsTopMaker:   'Top Maker',
    statsLastRelease:'Last Release',
    similarTitle:    'Similar Actresses',
    mainGenresTitle: 'MAIN GENRES',
  },
  zh: {
    metaTitle:       (name, month) => `【${month}月最新】${name} 的所有作品和精彩视频推荐 | VERITY`,
    metaDesc:        (name) => `浏览${name}在FANZA上的所有视频。VERITY编辑部精选最新发售、特价和免费试看视频。`,
    backHome:        '返回首页',
    backProfile:     '我的主页',
    works:           (n) => `共 ${n.toLocaleString()} 部作品`,
    preOrder:        '预约受付中',
    preOrderBadge:   '预约',
    recent:          '最新作品',
    recentBadge:     '现在必买',
    fanzaSearch:     (name) => `在FANZA搜索${name}的全部作品`,
    saleSection:     '特价中的作品',
    saleBadge:       '限时特价',
    noSale:          '目前没有特价作品',
    fanzaSaleLink:   (name) => `在FANZA查看更多${name}的特价作品`,
    genreCatalog:    '按类型分类',
    genreBadge:      (name) => `${name} × 类型`,
    ctaTitle:        (name) => `立即查看${name}的全部作品`,
    ctaSub:          '高画质・有试看视频 — 免费注册即送积分',
    ctaBtn:          '在FANZA观看 — 有免费试看',
    prText:          '含有推广链接',
    rankBoostNote:   '收藏后，此女优的VERITY排名将提升 +50pt',
    rankBoostLink:   '查看排名',
    archiveTitle:    '全部作品',
    archiveBadge:    (n) => `共${n.toLocaleString()}件`,
    profileTitle:    '个人资料',
    labelHeight:     '身高',
    labelBust:       '胸围',
    labelWaist:      '腰围',
    labelHip:        '臀围',
    labelCup:        '罩杯',
    labelBirthday:   '生日',
    labelDebut:      '出道年份',
    labelAgency:     '所属事务所',
    activityActive:  '现役',
    activitySemi:    '半退役',
    activityRetired: '引退',
    statsTitle:      'STATS',
    statsTotalWorks: '总作品数',
    statsActivity:   '活动期间',
    statsActivityNow:'至今',
    statsTopMaker:   '主要厂商',
    statsLastRelease:'最新作品',
    similarTitle:    '相似女优',
    mainGenresTitle: 'MAIN GENRES',
  },
}

function LangSwitch({ lang }: { lang: Lang }) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-[var(--border)] bg-[var(--surface)]/60 p-0.5 text-[11px]"
      aria-label="Language"
    >
      <a
        href="?"
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'ja' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
      >
        JP
      </a>
      <a
        href="?lang=en"
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'en' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
      >
        EN
      </a>
      <a
        href="?lang=zh"
        className={`rounded-full px-2.5 py-1 font-bold transition-colors ${lang === 'zh' ? 'bg-[var(--magenta)] text-white' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
      >
        中文
      </a>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3">
      <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
      <dd className="text-sm font-bold text-[var(--text)] truncate">{value}</dd>
    </div>
  )
}

// ── generateMetadata ──────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
  searchParams,
}: {
  params:       Promise<Params>
  searchParams: Promise<{ lang?: string }>
}) {
  const { id }      = await params
  const { lang: lp } = await searchParams
  const lang         = getLang(lp)
  const t            = I18N[lang]

  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('name, ruby, image_url, metadata')
    .eq('external_id', id)
    .single()
  if (!data) return {}
  const BASE  = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'
  const meta  = data.metadata as Record<string, unknown> | null
  const month = new Date().getMonth() + 1

  const keywords = Array.isArray(meta?.seo_keywords)
    ? (meta!.seo_keywords as string[])
    : undefined

  const title = lang === 'ja'
    ? ((meta?.seo_title as string | undefined) ?? t.metaTitle(data.name, month))
    : t.metaTitle(data.name, month)

  const description = lang === 'ja'
    ? ((meta?.seo_description as string | undefined) ?? t.metaDesc(data.name))
    : t.metaDesc(data.name)

  return {
    title,
    description,
    ...(keywords && lang === 'ja' ? { keywords } : {}),
    alternates: { canonical: `${BASE}/verity/actresses/${id}` },
    openGraph: {
      title:       `${data.name} — VERITY`,
      description,
      images:      data.image_url ? [{ url: data.image_url, alt: data.name }] : undefined,
    },
    twitter: {
      title:       `${data.name} — VERITY`,
      description,
      images:      data.image_url ? [data.image_url] : undefined,
    },
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function ActressPage({
  params,
  searchParams,
}: {
  params:       Promise<Params>
  searchParams: Promise<{ lang?: string; page?: string }>
}) {
  const { id }                  = await params
  const { lang: lp, page: rawPage } = await searchParams
  const lang         = getLang(lp)
  const t            = I18N[lang]

  const supabase = await createClient()

  const { data: actressData } = await supabase
    .from('actresses')
    .select('*')
    .eq('external_id', id)
    .single()

  if (!actressData) notFound()

  const actress = actressData as Actress
  const now = new Date().toISOString()

  const aliases = (actress.metadata?.aliases ?? []) as string[]
  const searchNames = [actress.name, ...aliases]

  const isOverseas = await getIsOverseasUser()

  const archivePage = Math.max(1, parseInt(rawPage ?? '1') || 1)
  const archiveFrom = (archivePage - 1) * ARCHIVE_PAGE_SIZE
  const archiveTo   = archiveFrom + ARCHIVE_PAGE_SIZE - 1

  const [{ data: upcomingData }, { data: recentData }, { data: lpRankRows }, { data: tagRows }, { data: saleData }, { data: favCountData }, { data: archiveData, count: archiveCount }] = await Promise.all([
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .or(`published_at.gt.${now},published_at.is.null`)
      .order('published_at', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .lte('published_at', now)
      .order('published_at', { ascending: false })
      .limit(12),
    supabase.rpc('get_actress_lp_ranking', {
      p_actress_id: actress.id,
      p_brand_id:   BRAND_ID,
      p_limit:      10,
    }),
    supabase
      .from('articles')
      .select('tags, metadata')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .limit(300),
    supabase
      .from('articles')
      .select('*')
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .filter('metadata->>is_on_sale', 'eq', 'true')
      .lte('published_at', now)
      .order('published_at', { ascending: false })
      .limit(10),
    supabase.rpc('get_actress_favorite_count', { p_external_id: actress.external_id }),
    supabase
      .from('articles')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .overlaps('tags', searchNames)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .order('published_at', { ascending: false, nullsFirst: false })
      .range(archiveFrom, archiveTo),
  ])

  function soloFirst(rows: Article[]): Article[] {
    const isSolo = (a: Article) => {
      const meta = a.metadata as Record<string, unknown> | null
      return Array.isArray(meta?.actress) && (meta!.actress as unknown[]).length === 1
    }
    return [
      ...rows.filter(isSolo),
      ...rows.filter(a => !isSolo(a)),
    ].slice(0, 6)
  }

  const upcoming       = soloFirst(deduplicateDigitalFirst((upcomingData as Article[]) ?? []))
  const recent         = soloFirst(deduplicateDigitalFirst((recentData   as Article[]) ?? []))
  const saleArticles   = deduplicateDigitalFirst((saleData as Article[]) ?? []).slice(0, 8)
  const archiveArticles = deduplicateDigitalFirst((archiveData as Article[]) ?? [])
  const archiveTotal    = archiveCount ?? 0
  const archiveTotalPages = Math.max(1, Math.ceil(archiveTotal / ARCHIVE_PAGE_SIZE))
  const total           = archiveTotal

  type LpRankRow = { rank: number; display_name: string; lp_points: number }
  const lpRanking = (lpRankRows ?? []) as LpRankRow[]
  const favCount  = typeof favCountData === 'number' ? favCountData : 0

  const actressNameSet = new Set(searchNames)
  const tagCounts = new Map<string, number>()
  for (const row of tagRows ?? []) {
    for (const t2 of (row.tags as string[]) ?? []) {
      if (t2 && !actressNameSet.has(t2)) {
        tagCounts.set(t2, (tagCounts.get(t2) ?? 0) + 1)
      }
    }
  }
  const topGenres = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }))

  // Phase 1: Top3 filtered genres (exclude system tags, apply threshold)
  const tagSampleSize = tagRows?.length ?? 0
  const top3Genres = topGenres.filter(({ tag, count }) =>
    !SYSTEM_TAGS.has(tag) &&
    (count >= 5 || (tagSampleSize > 0 && count / tagSampleSize >= 0.15))
  ).slice(0, 3)

  const coStarFreq = new Map<string, number>()
  for (const art of [...((upcomingData as Article[]) ?? []), ...((recentData as Article[]) ?? [])]) {
    const meta = art.metadata?.actress
    if (Array.isArray(meta)) {
      for (const a of meta as { id: number; name: string }[]) {
        if (a.id > 0) {
          const extId = `dmm-actress-${a.id}`
          if (extId !== actress.external_id) {
            coStarFreq.set(extId, (coStarFreq.get(extId) ?? 0) + 1)
          }
        }
      }
    }
  }
  const coStarExtIds = [...coStarFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)

  type MakerEntry = { id: number; name: string }
  let makerEntry: MakerEntry | null = null
  for (const art of (recentData as Article[]) ?? []) {
    const raw = art.metadata?.maker
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as MakerEntry[]
        if (parsed[0]?.id) { makerEntry = parsed[0]; break }
      } catch { /* ignore */ }
    }
  }

  // Phase 1: Activity status + stats
  const lastPublishedAt = ((recentData as Article[])[0]?.published_at as string | null | undefined) ?? null
  const activityStatus  = getActivityStatus(lastPublishedAt)

  const debutYear      = actress.metadata?.debut_year as number | string | null | undefined
  const lastReleaseYear = lastPublishedAt ? new Date(lastPublishedAt).getFullYear() : null
  const activityPeriod  = debutYear
    ? `${debutYear} – ${activityStatus === 'active' ? t.statsActivityNow : (lastReleaseYear ?? '—')}`
    : lastReleaseYear ? `– ${lastReleaseYear}` : '—'

  const lastReleaseDisplay = lastPublishedAt
    ? (() => {
        const d = new Date(lastPublishedAt)
        return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
      })()
    : '—'

  // Phase 2: Current actress's maker/series profile from tagRows (up to 300 articles)
  const myMakerIds = new Set<number>()
  const mySeriesIds = new Set<number>()
  for (const row of tagRows ?? []) {
    const meta = (row as { tags: string[]; metadata: Record<string, unknown> | null }).metadata
    if (typeof meta?.maker === 'string') {
      try {
        for (const m of JSON.parse(meta.maker) as Array<{ id?: number }>) {
          if (m?.id) myMakerIds.add(m.id)
        }
      } catch { /* ignore */ }
    }
    if (typeof meta?.series === 'string') {
      try {
        for (const s of JSON.parse(meta.series) as Array<{ id?: number }>) {
          if (s?.id) mySeriesIds.add(s.id)
        }
      } catch { /* ignore */ }
    }
  }
  const myFilteredGenres = new Set(
    topGenres.filter(({ tag }) => !SYSTEM_TAGS.has(tag)).map(({ tag }) => tag)
  )

  // Phase 2: Similar actresses — score = genre×5 + maker×3 + series×2, active-first
  type SimilarRow = { external_id: string; name: string; ruby: string | null; image_url: string | null; is_active: boolean }
  let similarActresses: SimilarRow[] = []

  const top5GenresForSim = topGenres
    .filter(({ tag }) => !SYSTEM_TAGS.has(tag))
    .slice(0, 5)
    .map(g => g.tag)

  if (top5GenresForSim.length > 0) {
    const { data: genreArticles } = await supabase
      .from('articles')
      .select('tags, metadata')
      .eq('is_active', true)
      .overlaps('tags', top5GenresForSim)
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(300)

    type CandidateProfile = { genres: Set<string>; makers: Set<number>; series: Set<number> }
    const candidateProfiles = new Map<string, CandidateProfile>()

    for (const art of genreArticles ?? []) {
      const meta         = (art.metadata as Record<string, unknown> | null)
      const actressMeta  = meta?.actress
      if (!Array.isArray(actressMeta)) continue

      // Article-level makers
      const artMakerIds = new Set<number>()
      if (typeof meta?.maker === 'string') {
        try {
          for (const m of JSON.parse(meta.maker) as Array<{ id?: number }>) {
            if (m?.id) artMakerIds.add(m.id)
          }
        } catch { /* ignore */ }
      }
      // Article-level series
      const artSeriesIds = new Set<number>()
      if (typeof meta?.series === 'string') {
        try {
          for (const s of JSON.parse(meta.series) as Array<{ id?: number }>) {
            if (s?.id) artSeriesIds.add(s.id)
          }
        } catch { /* ignore */ }
      }
      // Article-level genres (tags minus actress names and system tags)
      const artGenres = new Set<string>()
      for (const tag of (art.tags as string[]) ?? []) {
        if (!SYSTEM_TAGS.has(tag) && !actressNameSet.has(tag)) artGenres.add(tag)
      }

      for (const a of actressMeta as Array<{ id?: number }>) {
        if (!a?.id) continue
        const extId = `dmm-actress-${a.id}`
        if (extId === actress.external_id) continue

        const p = candidateProfiles.get(extId) ?? { genres: new Set(), makers: new Set(), series: new Set() }
        for (const g of artGenres)    p.genres.add(g)
        for (const m of artMakerIds)  p.makers.add(m)
        for (const s of artSeriesIds) p.series.add(s)
        candidateProfiles.set(extId, p)
      }
    }

    type Scored = { extId: string; score: number }
    const scored: Scored[] = []
    for (const [extId, p] of candidateProfiles) {
      const genreMatch  = [...p.genres].filter(g  => myFilteredGenres.has(g)).length
      const makerMatch  = [...p.makers].filter(id => myMakerIds.has(id)).length
      const seriesMatch = [...p.series].filter(id => mySeriesIds.has(id)).length
      const score = genreMatch * 5 + makerMatch * 3 + seriesMatch * 2
      if (score > 0) scored.push({ extId, score })
    }
    scored.sort((a, b) => b.score - a.score)

    const topCandidateIds = scored.slice(0, 10).map(c => c.extId)
    if (topCandidateIds.length > 0) {
      const { data: simData } = await supabase
        .from('actresses')
        .select('external_id, name, ruby, image_url, is_active')
        .in('external_id', topCandidateIds)

      const scoreMap = new Map(scored.map(({ extId, score }) => [extId, score]))
      similarActresses = ((simData ?? []) as SimilarRow[])
        .sort((a, b) => {
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
          return (scoreMap.get(b.external_id) ?? 0) - (scoreMap.get(a.external_id) ?? 0)
        })
        .slice(0, 4)

      // ActressDiscoveryBlock と同じ実績パターン: image_url が null の女優は
      // articles テーブルから最新の有効な画像URLをフォールバックとして取得する。
      // metadata.latest_cid は形式不一致でCDN 404になるケースがあるため使用しない。
      const nullImageActresses = similarActresses.filter(a => !a.image_url)
      if (nullImageActresses.length > 0) {
        const nullNames = nullImageActresses.map(a => a.name)
        const { data: fbArts } = await supabase
          .from('articles')
          .select('tags, image_url')
          .overlaps('tags', nullNames)
          .eq('is_active', true)
          .not('image_url', 'is', null)
          .order('published_at', { ascending: false })
          .limit(nullNames.length * 4)

        const fbMap = new Map<string, string>()
        for (const art of (fbArts ?? []) as { tags: string[] | null; image_url: string | null }[]) {
          for (const tag of (art.tags ?? [])) {
            if (nullNames.includes(tag) && !fbMap.has(tag) && art.image_url) {
              fbMap.set(tag, art.image_url)
            }
          }
        }
        similarActresses = similarActresses.map(a => ({
          ...a,
          image_url: a.image_url ?? fbMap.get(a.name) ?? null,
        }))
      }
    }
  }

  function buildArchiveUrl(p: number): string {
    const qp = new URLSearchParams()
    if (lang !== 'ja') qp.set('lang', lang)
    if (p > 1) qp.set('page', String(p))
    const qs = qp.toString()
    return `/verity/actresses/${id}${qs ? `?${qs}` : ''}`
  }

  // Activity badge config
  const activityCfg = {
    active:  { dot: 'bg-emerald-400', text: 'text-emerald-400', border: 'border-emerald-400/30', bg: 'bg-emerald-400/10', label: t.activityActive,  ping: true  },
    semi:    { dot: 'bg-amber-400',   text: 'text-amber-400',   border: 'border-amber-400/30',   bg: 'bg-amber-400/10',   label: t.activitySemi,    ping: false },
    retired: { dot: 'bg-zinc-500',    text: 'text-zinc-400',    border: 'border-zinc-500/30',    bg: 'bg-zinc-500/10',    label: t.activityRetired, ping: false },
  }[activityStatus]

  const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://verity-official.com'

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-10">
      <LogView targetType="actress" targetId={actress.external_id} />

      {/* Person JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Person',
            name: actress.name,
            url: `${BASE}/verity/actresses/${actress.external_id}`,
            ...(actress.image_url ? { image: actress.image_url } : {}),
            ...(actress.metadata?.birthday ? { birthDate: String(actress.metadata.birthday) } : {}),
          }),
        }}
      />

      {/* Back navigation + Language Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
          >
            <ArrowLeft size={14} />
            {t.backHome}
          </Link>
          <span className="text-[var(--border)]" aria-hidden>|</span>
          <Link
            href="/verity/actresses"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
          >
            <UserCircle size={14} />
            {lang === 'en' ? 'All Actresses' : lang === 'zh' ? '女优一览' : '女優一覧'}
          </Link>
          <span className="text-[var(--border)]" aria-hidden>|</span>
          <Link
            href="/verity/profile"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
          >
            <UserCircle size={14} />
            {t.backProfile}
          </Link>
        </div>
        <LangSwitch lang={lang} />
      </div>

      {/* Actress header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-[var(--text)]">{actress.name}</h1>
            <div className="flex items-center gap-2">
              <FavoriteButton type="actress" id={actress.external_id} size="md" />
              {favCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
                  style={{
                    background: 'rgba(226,0,116,0.1)',
                    border:     '1px solid rgba(226,0,116,0.3)',
                    color:      '#E20074',
                  }}
                  title="お気に入り登録数"
                >
                  <Heart size={10} style={{ fill: '#E20074' }} />
                  {favCount.toLocaleString()}
                </span>
              )}
            </div>
          </div>
          {actress.ruby && (
            <p className="text-sm text-[var(--text-muted)]">{actress.ruby}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-[var(--text-muted)]">
              {t.works(total)}
            </p>
            {/* Activity badge */}
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${activityCfg.bg} ${activityCfg.border} ${activityCfg.text}`}>
              <span className="relative flex h-1.5 w-1.5">
                {activityCfg.ping && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                )}
                <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${activityCfg.dot}`} />
              </span>
              {activityCfg.label}
            </span>
          </div>
        </div>
        <ShareButton url={`/verity/actresses/${actress.external_id}`} title={actress.name} />
      </div>

      {/* ランキング熱量ヒント */}
      <div className="flex items-center gap-2 rounded-lg border border-[var(--magenta)]/20 bg-[var(--magenta)]/5 px-3 py-2 text-[11px] text-[var(--text-muted)]">
        <Heart size={11} className="shrink-0 text-[var(--magenta)]" />
        <span className="flex-1">{t.rankBoostNote}</span>
        <Link
          href={`/verity/ranking${lang !== 'ja' ? `?lang=${lang}` : ''}`}
          className="shrink-0 font-bold text-[var(--magenta)] hover:underline"
        >
          {t.rankBoostLink} →
        </Link>
      </div>

      {/* 編集部レビュー */}
      <EditorNoteBlock metadata={actress.metadata} lang={lang} />

      {/* プロフィール情報 */}
      {(() => {
        const m = actress.metadata ?? {}
        const rows: { label: string; value: string }[] = []
        if (m.height)   rows.push({ label: t.labelHeight,   value: `${m.height} cm` })
        if (m.bust)     rows.push({ label: t.labelBust,     value: `${m.bust} cm` })
        if (m.waist)    rows.push({ label: t.labelWaist,    value: `${m.waist} cm` })
        if (m.hip)      rows.push({ label: t.labelHip,      value: `${m.hip} cm` })
        if (m.cup)      rows.push({ label: t.labelCup,      value: String(m.cup) })
        if (m.birthday) rows.push({ label: t.labelBirthday, value: String(m.birthday) })
        if (m.debut_year) rows.push({ label: t.labelDebut,  value: String(m.debut_year) })
        if (m.agency)   rows.push({ label: t.labelAgency,   value: String(m.agency) })
        if (rows.length === 0) return null
        return (
          <section className="space-y-3">
            <p className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
              {t.profileTitle}
            </p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
              {rows.map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
                  <dd className="text-sm font-semibold text-[var(--text)]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )
      })()}

      {/* STATS — 4 metrics */}
      <section className="space-y-3">
        <p className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-muted)] flex items-center gap-1.5">
          <BarChart2 size={12} />
          {t.statsTitle}
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label={t.statsTotalWorks}  value={`${archiveTotal.toLocaleString()}${lang === 'ja' ? '件' : lang === 'zh' ? '件' : ''}`} />
          <StatCard label={t.statsActivity}    value={activityPeriod} />
          <StatCard label={t.statsTopMaker}    value={makerEntry?.name ?? '—'} />
          <StatCard label={t.statsLastRelease} value={lastReleaseDisplay} />
        </dl>
      </section>

      {/* Phase 4-3: Signature Works (user_events ベース 上位5作品) */}
      <SignatureWorks
        actressId={actress.external_id}
        actressName={actress.name}
        searchNames={searchNames}
      />

      {/* MAIN GENRES TOP3 */}
      {top3Genres.length > 0 && (
        <section className="space-y-3">
          <p className="text-[11px] font-bold tracking-widest uppercase text-[var(--text-muted)]">
            {t.mainGenresTitle}
          </p>
          <div className="flex flex-wrap gap-2">
            {top3Genres.map(({ tag, count }, i) => (
              <Link
                key={tag}
                href={`/verity/actresses/${actress.external_id}/genres/${encodeURIComponent(tag)}`}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--magenta)]/30 bg-[var(--magenta)]/8 px-4 py-2.5 text-sm font-bold text-[var(--magenta)] hover:bg-[var(--magenta)]/15 transition-colors"
              >
                <span className="text-[10px] font-black opacity-50 tabular-nums">{i + 1}</span>
                {tag}
                <span className="text-[10px] font-medium opacity-60 tabular-nums">{count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {total === 0 && (
        <p className="text-[var(--text-muted)]">作品が見つかりませんでした</p>
      )}

      {/* Pre-orders */}
      {upcoming.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Bookmark size={16} className="text-sky-400" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.preOrder}</h2>
            <span className="rounded-full bg-sky-600/20 px-2 py-0.5 text-[10px] font-bold text-sky-400">
              {t.preOrderBadge}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {upcoming.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* Latest Releases TOP5 */}
      {recent.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} className="text-[var(--magenta)]" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.recent}</h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              {t.recentBadge}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {recent.slice(0, 5).map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          <div className="pt-2 flex items-center gap-2.5 flex-wrap">
            <PurchaseLink
              href={withAffiliate(`https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(actress.name)}/`) ?? '#'}
              targetId={actress.external_id}
              actionType="purchase_click"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
            >
              <ShoppingCart size={13} />
              {t.fanzaSearch(actress.name)}
            </PurchaseLink>
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold tracking-widest bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">
              PR
            </span>
          </div>
        </section>
      )}

      {/* セール中の作品 */}
      <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Flame size={16} className="text-red-400" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.saleSection}</h2>
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-400">
              {t.saleBadge}
            </span>
          </div>
          {saleArticles.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
              {saleArticles.map((art) => {
                const meta = (art.metadata ?? {}) as Record<string, unknown>
                const rawUrl = (meta.affiliate_url ?? meta.url) as string | null
                const saleUrl = withAffiliateForRegion(rawUrl, isOverseas)
                const salePrice = typeof meta.sale_price === 'number' ? (meta.sale_price as number) : null
                const proxyImg = art.image_url
                  ? `/api/proxy/image?url=${encodeURIComponent(art.image_url)}`
                  : null
                return saleUrl ? (
                  <FanzaLink
                    key={art.id}
                    href={saleUrl}
                    targetId={art.external_id}
                    position="actress_sale_card"
                    className="group/sc relative shrink-0 w-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:border-red-400/50 transition-colors"
                  >
                    <div className="relative aspect-[2/3]">
                      {proxyImg ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={proxyImg} alt={art.title} className="absolute inset-0 h-full w-full object-cover object-right transition-transform duration-200 group-hover/sc:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-[var(--surface-2)]" />
                      )}
                      <span className="absolute bottom-1 left-0 rounded-r-full bg-red-500/95 px-1.5 py-0.5 text-[8px] font-black text-white">
                        {salePrice !== null ? `¥${salePrice}` : 'SALE'}
                      </span>
                    </div>
                    <p className="p-1.5 text-[9px] leading-tight text-[var(--text)] line-clamp-2">
                      {art.title}
                    </p>
                  </FanzaLink>
                ) : null
              })}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">{t.noSale}</p>
          )}
          <FanzaLink
            href={withAffiliateForRegion(
              `https://www.dmm.co.jp/digital/videoa/-/sale/=/searchstr=${encodeURIComponent(actress.name)}/`,
              isOverseas,
            ) ?? '#'}
            targetId={actress.external_id}
            position="actress_sale_search"
            className="inline-flex items-center gap-2 rounded-full border border-red-400/40 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Flame size={13} />
            {t.fanzaSaleLink(actress.name)}
            <ExternalLink size={12} />
          </FanzaLink>
      </section>

      {/* ジャンル別カタログ */}
      {topGenres.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Tag size={16} className="text-[var(--magenta)]" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.genreCatalog}</h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              {t.genreBadge(actress.name)}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {topGenres.map(({ tag, count }) => (
              <Link
                key={tag}
                href={`/verity/actresses/${actress.external_id}/genres/${encodeURIComponent(tag)}`}
                className="group flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm transition-all hover:border-[var(--magenta)]/50 hover:bg-[var(--magenta)]/8 hover:text-[var(--magenta)]"
              >
                <Tag size={11} className="text-[var(--text-muted)] group-hover:text-[var(--magenta)]" />
                <span className="font-medium text-[var(--text)] group-hover:text-[var(--magenta)]">{tag}</span>
                <span className="text-[10px] text-[var(--text-muted)] tabular-nums">{count}</span>
              </Link>
            ))}
          </div>
          {topGenres[0] && (
            <div className="flex flex-wrap gap-3 pt-1">
              {topGenres.slice(0, 3).map(({ tag }) => (
                <Link
                  key={tag}
                  href={`/verity/genres/${encodeURIComponent(tag)}`}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--magenta)] transition-colors"
                >
                  {tag}の全作品・全女優を見る →
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 全作品アーカイブ */}
      {archiveTotal > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <CalendarDays size={16} className="text-[var(--magenta)]" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.archiveTitle}</h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              {t.archiveBadge(archiveTotal)}
            </span>
            {archiveTotalPages > 1 && (
              <span className="text-[11px] text-[var(--text-muted)]">
                {archivePage} / {archiveTotalPages} ページ
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {archiveArticles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
          {archiveTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              {archivePage > 1 ? (
                <Link
                  href={buildArchiveUrl(archivePage - 1)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
                >
                  <ChevronLeft size={14} />
                  前へ
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] opacity-40 cursor-not-allowed">
                  <ChevronLeft size={14} />
                  前へ
                </span>
              )}
              <span className="text-sm text-[var(--text-muted)] tabular-nums">
                {archivePage} / {archiveTotalPages}
              </span>
              {archivePage < archiveTotalPages ? (
                <Link
                  href={buildArchiveUrl(archivePage + 1)}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)] hover:text-[var(--magenta)] transition-colors"
                >
                  次へ
                  <ChevronRight size={14} />
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] opacity-40 cursor-not-allowed">
                  次へ
                  <ChevronRight size={14} />
                </span>
              )}
            </div>
          )}
        </section>
      )}

      {/* 似た系統の女優 */}
      {similarActresses.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <Users size={16} className="text-[var(--magenta)]" />
            <h2 className="text-base font-bold text-[var(--text)]">{t.similarTitle}</h2>
            <span className="rounded-full bg-[var(--magenta)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              {top3Genres.slice(0, 2).map(g => g.tag).join(' / ')}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {similarActresses.map(sim => {
              // ActressDiscoveryBlock の actressProxyUrl と同一ロジック:
              // pl.jpg/ps.jpg → jp.jpg（縦向き正面表紙）に変換してプロキシへ渡す。
              // プロキシが jp.jpg を 404/placeholder と判定した場合は pl→ps の順にフォールバック。
              const thumbUrl = sim.image_url
                ? `/api/proxy/image?url=${encodeURIComponent(sim.image_url.replace(/(?:pl|ps)\.jpg$/, 'jp.jpg'))}`
                : null
              return (
                <Link
                  key={sim.external_id}
                  href={`/verity/actresses/${sim.external_id}`}
                  className="group flex flex-col items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 hover:border-[var(--magenta)]/50 transition-colors"
                >
                  {/* relative必須: absolute inset-0 の基準点。object-right: pl.jpg/jp.jpg ともに表紙が右寄り */}
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-[var(--surface-2)]">
                    {thumbUrl ? (
                      <ProxiedImage
                        src={thumbUrl}
                        alt={sim.name}
                        className="absolute inset-0 h-full w-full object-cover object-right"
                      />
                    ) : (
                      <NowPrinting />
                    )}
                  </div>
                  <p className="text-[11px] font-semibold text-center text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors line-clamp-2 w-full">
                    {sim.name}
                  </p>
                  {sim.ruby && (
                    <p className="text-[9px] text-[var(--text-muted)] text-center -mt-1">{sim.ruby}</p>
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* 自動レコメンド */}
      <ActressDiscoveryBlock
        actress={actress}
        recentArticles={(recentData as Article[]) ?? []}
        makerEntry={makerEntry}
        coStarExtIds={coStarExtIds}
        topGenres={topGenres}
      />

      {/* 大型 FANZA 誘導 CTA */}
      {(() => {
        const ctaUrl = withAffiliateForRegion(
          `https://www.dmm.co.jp/digital/videoa/-/list/search/=/searchstr=${encodeURIComponent(actress.name)}/`,
          isOverseas,
        )
        return ctaUrl ? (
          <FanzaLink
            href={ctaUrl}
            targetId={actress.external_id}
            position="actress_large_cta"
            className="block"
          >
            <div
              className="relative overflow-hidden rounded-2xl px-6 py-8 text-center hover:brightness-110 active:scale-[0.99] transition-all"
              style={{
                background: 'linear-gradient(135deg, #120006 0%, #1a000d 50%, #080010 100%)',
                border: '1px solid rgba(226,0,116,0.30)',
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage:
                    'linear-gradient(rgba(226,0,116,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(226,0,116,0.8) 1px, transparent 1px)',
                  backgroundSize: '32px 32px',
                }}
              />
              <div className="relative z-10 space-y-4">
                <p className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--magenta)]">FANZA 公式</p>
                <h2 className="text-xl font-black text-white">
                  {t.ctaTitle(actress.name)}
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  {t.ctaSub}
                </p>
                <div className="inline-flex items-center gap-2 rounded-full bg-[var(--magenta)] px-8 py-3 text-sm font-black text-white shadow-[0_0_24px_rgba(226,0,116,0.5)]">
                  <ExternalLink size={14} />
                  {t.ctaBtn}
                </div>
                <p className="text-[10px] text-[var(--text-muted)] tracking-widest">
                  {t.prText}
                </p>
              </div>
            </div>
          </FanzaLink>
        ) : null
      })()}

      {/* 宣伝担当ランキング */}
      {lpRanking.length > 0 && (
        <section className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl px-6 py-5"
            style={{
              background: 'linear-gradient(135deg, #0a0a0f 0%, #150a20 50%, #0a0f1a 100%)',
              border: '1px solid rgba(226,0,116,0.25)',
            }}>
            <div className="pointer-events-none absolute inset-0 opacity-10"
              style={{
                backgroundImage: 'linear-gradient(rgba(226,0,116,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(226,0,116,0.6) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }} />
            <div className="relative z-10 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/verity/king.png" alt="" width={22} height={22} style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.7))' }} />
              <div>
                <p className="text-xs font-black tracking-[0.2em] uppercase" style={{ color: '#E20074' }}>
                  宣伝担当ランキング
                </p>
                <p className="text-[10px]" style={{ color: 'rgba(240,240,248,0.5)' }}>
                  {actress.name}に最も LP を捧げた推し人
                </p>
              </div>
            </div>
          </div>

          <ol className="space-y-2">
            {lpRanking.map((row, i) => {
              const isTop3  = i < 3
              const rankColors = ['#fbbf24', '#94a3b8', '#b45309']
              const glowColors = ['rgba(251,191,36,0.3)', 'rgba(148,163,184,0.2)', 'rgba(180,83,9,0.2)']
              return (
                <li key={i} className="relative overflow-hidden rounded-xl px-4 py-3 flex items-center gap-4"
                  style={{
                    background:  isTop3
                      ? `linear-gradient(90deg, rgba(0,0,0,0.6), ${glowColors[i]}20, rgba(0,0,0,0.6))`
                      : 'rgba(18,18,26,0.8)',
                    border: isTop3
                      ? `1px solid ${rankColors[i]}30`
                      : '1px solid rgba(42,42,58,0.6)',
                    boxShadow: isTop3 ? `0 0 20px ${glowColors[i]}` : 'none',
                  }}>
                  <span className="w-8 shrink-0 text-center text-sm font-black font-mono"
                    style={{ color: isTop3 ? rankColors[i] : 'rgba(136,136,170,0.6)',
                             textShadow: isTop3 ? `0 0 8px ${rankColors[i]}` : 'none' }}>
                    {i < 9 ? `0${i + 1}` : `${i + 1}`}
                  </span>
                  <span className="flex-1 min-w-0 truncate font-bold text-sm"
                    style={{
                      color:       isTop3 ? '#f0f0f8' : 'rgba(240,240,248,0.7)',
                      textShadow:  isTop3 ? `0 0 12px ${rankColors[i]}40` : 'none',
                      letterSpacing: '0.03em',
                    }}>
                    {row.display_name}
                  </span>
                  <span className="shrink-0 font-black text-sm font-mono"
                    style={{
                      color:      isTop3 ? rankColors[i] : '#8888aa',
                      textShadow: isTop3 ? `0 0 10px ${rankColors[i]}` : 'none',
                    }}>
                    💙 {row.lp_points} LP
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}
    </div>
  )
}
