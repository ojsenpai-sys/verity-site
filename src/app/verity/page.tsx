import { Suspense } from 'react'
import Link from 'next/link'
import { Bookmark, BookOpen, Clock, Newspaper } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { FilterBar } from '@/components/FilterBar'
import { ActressMarquee } from '@/components/ActressMarquee'
import { FeaturedSection } from '@/components/FeaturedSection'
import { RecommendedActressSection } from '@/components/RecommendedActressSection'
import { MustOneSection } from '@/components/MustOneSection'
import { FastReviewSection } from '@/components/FastReviewSection'
import { SocialFeedSection } from '@/components/SocialFeedSection'
import { PopularActressRankingSection } from '@/components/PopularActressRankingSection'
import type { Article, Actress, FilterParams } from '@/lib/types'
import { deduplicateDigitalFirst } from '@/lib/fanzaUtils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  searchParams: Promise<FilterParams & { page?: string }>
}

const PAGE_SIZE = 18

// S クラス女優 — 各リストで先頭に優先表示
const S_CLASS_NAMES = ['石川澪', '小野六花', '本庄鈴', '石原希望', '白石透羽', '三咲まゆ'] as const
const S_CLASS_SET   = new Set<string>(S_CLASS_NAMES)

function sortSClassFirst(articles: Article[]): Article[] {
  const hi: Article[] = []
  const lo: Article[] = []
  for (const a of articles) {
    ;(a.tags ?? []).some((t) => S_CLASS_SET.has(t)) ? hi.push(a) : lo.push(a)
  }
  return [...hi, ...lo]
}

// ── Data helpers ───────────────────────────────────────────────────────────────

async function getFilterOptions() {
  const supabase = await createClient()
  const [
    { data: catRows,     error: catErr },
    { data: srcRows,     error: srcErr },
    { data: tagRows,     error: tagErr },
    { data: actressRows, error: actErr },
  ] = await Promise.all([
    supabase.from('articles').select('category').eq('is_active', true).not('category', 'is', null),
    supabase.from('articles').select('source').eq('is_active', true),
    supabase.from('articles').select('tags').eq('is_active', true).not('tags', 'is', null),
    supabase.from('actresses').select('*').eq('is_active', true),
  ])

  if (catErr)  console.error('[page] categories error:', catErr)
  if (srcErr)  console.error('[page] sources error:', srcErr)
  if (tagErr)  console.error('[page] tags error:', tagErr)
  if (actErr)  console.error('[page] actresses error:', actErr)

  const actresses = ((actressRows as Actress[]) ?? []).sort((a, b) => {
    const ra = (a.metadata?.monthly_rank as number) ?? 9999
    const rb = (b.metadata?.monthly_rank as number) ?? 9999
    return ra - rb
  })
  const actressNames = new Set(actresses.map((a) => a.name))

  const categories = [...new Set(catRows?.map((r) => r.category as string).filter(Boolean))].sort()
  const sources    = [...new Set(srcRows?.map((r) => r.source as string).filter(Boolean))].sort()

  // Count tag frequency, exclude actress names, take top 30 by occurrence
  const tagCounts = new Map<string, number>()
  for (const row of tagRows ?? []) {
    for (const t of (row.tags as string[]) ?? []) {
      if (t && !actressNames.has(t)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
  }
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag)

  return { categories, sources, tags, actresses }
}

async function getUpcomingArticles(
  filters: FilterParams,
  top100Names: string[],
): Promise<Article[]> {
  const supabase = await createClient()
  const hasFilter = !!(filters.category || filters.source || filters.tag || filters.q)

  // 重複排除後に 24 件残るよう多めに取得
  let query = supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .gt('published_at', new Date().toISOString())
    .order('published_at', { ascending: true })
    .limit(48)

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.source)   query = query.eq('source', filters.source)
  if (filters.tag)      query = query.contains('tags', [filters.tag])
  if (filters.q)        query = query.or(`title.ilike.%${filters.q}%,summary.ilike.%${filters.q}%`)
  const priorityNames = [...new Set([...S_CLASS_NAMES, ...top100Names])]
  if (!hasFilter && priorityNames.length > 0) query = query.overlaps('tags', priorityNames)

  const { data, error } = await query
  if (error) console.error('[page] upcoming error:', error)
  const deduped = deduplicateDigitalFirst((data as Article[]) ?? [])
  return sortSClassFirst(deduped).slice(0, 24)
}

async function getThisWeekArticles(
  filters: FilterParams,
  page: number,
  top100Names: string[],
): Promise<Article[]> {
  const supabase = await createClient()
  const now         = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const hasFilter   = !!(filters.category || filters.source || filters.tag || filters.q)

  // 重複排除後に PAGE_SIZE 件残るよう offset も考慮して多めに取得
  const fetchSize = PAGE_SIZE * 2
  let query = supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .gte('published_at', sevenDaysAgo)
    .lte('published_at', now.toISOString())
    .order('published_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + fetchSize - 1)

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.source)   query = query.eq('source', filters.source)
  if (filters.tag)      query = query.contains('tags', [filters.tag])
  if (filters.q)        query = query.or(`title.ilike.%${filters.q}%,summary.ilike.%${filters.q}%`)
  const priorityNames = [...new Set([...S_CLASS_NAMES, ...top100Names])]
  if (!hasFilter && priorityNames.length > 0) query = query.overlaps('tags', priorityNames)

  const { data, error } = await query
  if (error) console.error('[page] this week error:', error)
  const deduped = deduplicateDigitalFirst((data as Article[]) ?? [])
  return sortSClassFirst(deduped).slice(0, PAGE_SIZE)
}

// ── Async section components ────────────────────────────────────────────────────

async function UpcomingSection({
  filters,
  top100Names,
}: {
  filters: FilterParams
  top100Names: string[]
}) {
  const articles = await getUpcomingArticles(filters, top100Names)
  if (!articles.length) return null

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2.5">
        <Bookmark size={17} className="text-sky-400" />
        <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">
          【最速】予約・先行公開
        </h2>
        <span className="rounded-full bg-sky-600/20 px-2.5 py-0.5 text-[10px] font-bold text-sky-400">
          {articles.length}件
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  )
}

async function ThisWeekGrid({
  filters,
  page,
  top100Names,
}: {
  filters: FilterParams
  page: number
  top100Names: string[]
}) {
  const articles = await getThisWeekArticles(filters, page, top100Names)

  if (!articles.length) {
    return (
      <div className="col-span-full flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
        <p className="text-4xl mb-4">📭</p>
        <p className="text-lg">今週のリリースはまだありません</p>
      </div>
    )
  }

  return (
    <>
      {articles.map((article) => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </>
  )
}

// ── Doujin Comic Pick ─────────────────────────────────────────────────────────

async function getDoujinPickArticles(): Promise<Article[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .filter('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false })
    .limit(3)
  if (error) console.error('[page] doujin pick error:', error)
  return (data as Article[]) ?? []
}

async function DoujinPickSection() {
  const articles = await getDoujinPickArticles()
  if (!articles.length) return null

  return (
    <section id="doujin-pick" className="space-y-5">
      {/* ヘッダー */}
      <div className="flex items-center gap-3">
        <div className="h-7 w-1 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-400/10" />
        <BookOpen size={17} className="text-emerald-400" />
        <h2 className="text-lg font-bold tracking-widest text-[var(--text)]">
          VERITY推薦！新作コミック
        </h2>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
          編集長厳選
        </span>
      </div>

      {/* カードグリッド */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {articles.map((article) => (
          <ArticleCard key={article.id} article={article} />
        ))}
      </div>
    </section>
  )
}

// ── News + Works Timeline ──────────────────────────────────────────────────────

type TimelineItem = {
  id:    string
  type:  'news' | 'work'
  date:  string | null
  title: string
  href:  string
}

const SITE_KEY = process.env.NEXT_PUBLIC_BRAND_ID ?? 'verity'

async function getTimelineItems(): Promise<TimelineItem[]> {
  const supabase = await createClient()

  const [{ data: newsData }, { data: worksData }] = await Promise.all([
    supabase
      .from('sn_news')
      .select('id, title, slug, published_at, created_at')
      .eq('site_key', SITE_KEY)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('articles')
      .select('id, title, slug, published_at')
      .eq('is_active', true)
      .order('published_at', { ascending: false })
      .limit(5),
  ])

  const newsItems: TimelineItem[] = (newsData ?? []).map(
    (n: { id: string; title: string; slug: string; published_at: string | null; created_at: string }) => ({
      id:    `n-${n.id}`,
      type:  'news',
      date:  n.published_at ?? n.created_at,
      title: n.title,
      href:  `/${SITE_KEY}/news/${n.slug}`,
    })
  )

  const workItems: TimelineItem[] = (worksData ?? []).map(
    (a: { id: string; title: string; slug: string; published_at: string | null }) => ({
      id:    `w-${a.id}`,
      type:  'work',
      date:  a.published_at,
      title: a.title,
      href:  `/${SITE_KEY}/articles/${a.slug}`,
    })
  )

  return [...newsItems, ...workItems]
    .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime())
    .slice(0, 5)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '——.——.——'
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function isWithin3Days(iso: string | null): boolean {
  if (!iso) return false
  return Date.now() - new Date(iso).getTime() < 3 * 24 * 60 * 60 * 1000
}

async function TimelineSection() {
  const items = await getTimelineItems()
  if (!items.length) return null

  return (
    <section id="latest-news" className="space-y-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-[var(--magenta)] to-[var(--magenta)]/10" />
          <Newspaper size={17} className="text-[var(--magenta)]" />
          <h2 className="text-lg font-bold tracking-widest uppercase text-[var(--text)]">
            新着情報
          </h2>
        </div>
        <Link
          href={`/${SITE_KEY}/news`}
          className="text-[11px] tracking-widest text-[var(--text-muted)] uppercase hover:text-[var(--magenta)] transition-colors"
        >
          すべて見る →
        </Link>
      </div>

      {/* タイムライン */}
      <ul className="divide-y divide-[var(--border)]">
        {items.map((item) => {
          const showNew = isWithin3Days(item.date)
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 py-3 transition-colors"
              >
                {/* 日付 — font-mono で縦揃え */}
                <span className="font-mono text-[11px] tabular-nums shrink-0 text-[var(--text-muted)]">
                  {fmtDate(item.date)}
                </span>

                {/* タイプバッジ */}
                {item.type === 'news' ? (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/30">
                    ニュース
                  </span>
                ) : (
                  <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
                    最新作
                  </span>
                )}

                {/* タイトル */}
                <span className="flex-1 min-w-0 text-sm text-[var(--text-muted)] group-hover:text-[var(--text)] group-hover:underline underline-offset-2 transition-colors leading-snug truncate">
                  {item.title}
                </span>

                {/* NEW マーク（3日以内） */}
                {showNew && (
                  <span className="shrink-0 flex items-center gap-1 text-[9px] font-black tracking-widest text-[var(--magenta)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--magenta)] animate-pulse" />
                    NEW
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams
  const page   = Number(params.page ?? 0)
  const filters: FilterParams = {
    category: params.category,
    source:   params.source,
    tag:      params.tag,
    q:        params.q,
  }
  const hasFilter    = !!(filters.category || filters.source || filters.tag || filters.q)
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v != null)
  ) as Record<string, string>

  const { categories, sources, tags, actresses } = await getFilterOptions()
  const top100Names = actresses.slice(0, 100).map((a) => a.name)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-10">

      {/* ── 1. ヒーローエリア ──────────────────────────────────────────────── */}
      <div className="space-y-6">
        <p className="text-[11px] sm:text-xs leading-relaxed tracking-wide text-[var(--text-muted)]">
          FANZA公式データと直結！旬の女優と最新作を最速で届けるAVキュレーション・メディア
        </p>

        {/* 女優スクロール: 月間ランキング Top 50 最新作パッケージ */}
        <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-[var(--surface)]" />}>
          <ActressMarquee actresses={actresses} />
        </Suspense>

        {/* 検索窓 ＋ ジャンルタグ（上位 30 + もっと見る） */}
        <Suspense>
          <FilterBar categories={categories} sources={sources} tags={tags} />
        </Suspense>
      </div>

      {/* ── 2. THE MUST ONE ───────────────────────────────────────────────── */}
      <section id="the-must-one">
        <MustOneSection />
      </section>

      {/* ── 2.5. 最新作最速レビュー ──────────────────────────────────────── */}
      <section id="fast-review">
        <Suspense fallback={<div className="h-72 animate-pulse rounded-2xl bg-[var(--surface)]" />}>
          <FastReviewSection />
        </Suspense>
      </section>

      {/* ── 3. VERITY 人気女優ランキング ─────────────────────────────────── */}
      <section id="popular-ranking">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-[var(--surface)]" />}>
          <PopularActressRankingSection />
        </Suspense>
      </section>

      {/* ── 4. SOCIAL FEEDS ──────────────────────────────────────────────── */}
      <section id="social-feeds">
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-[var(--surface)]" />}>
          <SocialFeedSection />
        </Suspense>
      </section>

      {/* ── 5. 新着情報タイムライン ──────────────────────────────────────── */}
      <section id="latest-news-preview">
        <Suspense fallback={
          <div className="space-y-2">
            <div className="h-7 w-36 animate-pulse rounded bg-[var(--surface)]" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-[var(--surface)]" />
            ))}
          </div>
        }>
          <TimelineSection />
        </Suspense>
      </section>

      {/* ── 6. VERITYオススメ女優 ─────────────────────────────────────────── */}
      <section id="recommended-actresses">
        <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-[var(--surface)]" />}>
          <FeaturedSection />
        </Suspense>
      </section>

      {/* ── 7. 旬の女優 最新作（FANZAイチオシ 30 名）────────────────────────── */}
      <section id="latest-releases">
        <Suspense fallback={<div className="h-72 animate-pulse rounded-xl bg-[var(--surface)]" />}>
          <RecommendedActressSection />
        </Suspense>
      </section>

      {/* ── 8. VERITY推薦！新作コミック ──────────────────────────────────── */}
      <section id="doujin-pick">
        <Suspense fallback={<div className="h-56 animate-pulse rounded-xl bg-[var(--surface)]" />}>
          <DoujinPickSection />
        </Suspense>
      </section>

      {/* ── 9. 【最速】予約・先行公開 ─────────────────────────────────────── */}
      <section id="pre-orders">
        <Suspense>
          <UpcomingSection filters={filters} top100Names={top100Names} />
        </Suspense>
      </section>

      {/* ── 10. 今週のリリース ────────────────────────────────────────────── */}
      <section id="weekly-releases" className="space-y-5">
        <div className="flex items-center gap-2.5">
          <Clock size={17} className="text-[var(--magenta)]" />
          <h2 className="text-lg font-bold tracking-tight text-[var(--text)]">今週のリリース</h2>
          {!hasFilter && (
            <span className="rounded-full bg-[var(--magenta)]/15 px-2.5 py-0.5 text-[10px] font-medium text-[var(--magenta)]">
              人気女優 Top 100
            </span>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Suspense
            fallback={Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-[var(--surface)]" />
            ))}
          >
            <ThisWeekGrid filters={filters} page={page} top100Names={top100Names} />
          </Suspense>
        </div>
      </section>

    </div>
  )
}
