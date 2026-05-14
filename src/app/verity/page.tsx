import { Suspense } from 'react'
import Link from 'next/link'
import { Bookmark, Clock, Newspaper } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { FilterBar } from '@/components/FilterBar'
import { ActressMarquee } from '@/components/ActressMarquee'
import { FeaturedSection } from '@/components/FeaturedSection'
import { RecommendedActressSection } from '@/components/RecommendedActressSection'
import { MustOneSection } from '@/components/MustOneSection'
import { SocialFeedSection } from '@/components/SocialFeedSection'
import { PopularActressRankingSection } from '@/components/PopularActressRankingSection'
import { fetchNewsList } from '@/app/verity/actions/news'
import type { Article, Actress, FilterParams, SnNewsWithActress } from '@/lib/types'

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

  let query = supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .gt('published_at', new Date().toISOString())
    .order('published_at', { ascending: true })
    .limit(24)

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.source)   query = query.eq('source', filters.source)
  if (filters.tag)      query = query.contains('tags', [filters.tag])
  if (filters.q)        query = query.or(`title.ilike.%${filters.q}%,summary.ilike.%${filters.q}%`)
  const priorityNames = [...new Set([...S_CLASS_NAMES, ...top100Names])]
  if (!hasFilter && priorityNames.length > 0) query = query.overlaps('tags', priorityNames)

  const { data, error } = await query
  if (error) console.error('[page] upcoming error:', error)
  return sortSClassFirst((data as Article[]) ?? [])
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

  let query = supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .gte('published_at', sevenDaysAgo)
    .lte('published_at', now.toISOString())
    .order('published_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

  if (filters.category) query = query.eq('category', filters.category)
  if (filters.source)   query = query.eq('source', filters.source)
  if (filters.tag)      query = query.contains('tags', [filters.tag])
  if (filters.q)        query = query.or(`title.ilike.%${filters.q}%,summary.ilike.%${filters.q}%`)
  const priorityNames = [...new Set([...S_CLASS_NAMES, ...top100Names])]
  if (!hasFilter && priorityNames.length > 0) query = query.overlaps('tags', priorityNames)

  const { data, error } = await query
  if (error) console.error('[page] this week error:', error)
  return sortSClassFirst((data as Article[]) ?? [])
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

// ── Latest News ────────────────────────────────────────────────────────────────

function proxyImg(url: string) {
  return `/verity/api/proxy/image?url=${encodeURIComponent(url)}`
}

function newsDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
}

async function LatestNewsSection() {
  const { items } = await fetchNewsList(9, 0)
  if (!items.length) return null

  return (
    <section id="latest-news" className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-[var(--magenta)] to-[var(--magenta)]/10" />
          <Newspaper size={17} className="text-[var(--magenta)]" />
          <h2 className="text-lg font-bold tracking-widest uppercase text-[var(--text)]">
            Latest News
          </h2>
        </div>
        <span className="hidden sm:block text-[11px] tracking-widest text-[var(--text-muted)] uppercase">
          VERITY Editorial
        </span>
      </div>

      {/* カードグリッド */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((news: SnNewsWithActress) => (
          <Link
            key={news.id}
            href={`/verity/news/${news.slug}`}
            className="group flex gap-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3.5 transition-all duration-200 hover:border-[var(--magenta)]/50 hover:shadow-[0_0_24px_rgba(226,0,116,0.14)] hover:-translate-y-0.5"
          >
            {/* サムネイル */}
            {news.thumbnail_url ? (
              <div className="relative h-16 w-[88px] flex-shrink-0 overflow-hidden rounded-lg bg-[var(--surface-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={proxyImg(news.thumbnail_url)}
                  alt={news.title}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            ) : (
              <div className="h-16 w-[88px] flex-shrink-0 rounded-lg bg-[var(--surface-2)]" />
            )}

            {/* テキスト */}
            <div className="flex flex-1 flex-col justify-between min-w-0 gap-1">
              {news.category && (
                <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--magenta)]">
                  {news.category}
                </span>
              )}
              <p className="text-sm font-semibold leading-snug text-[var(--text)] line-clamp-2 group-hover:text-[var(--magenta)] transition-colors">
                {news.title}
              </p>
              <span className="text-[10px] text-[var(--text-muted)]">
                {newsDate(news.published_at)}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {/* News一覧へ */}
      <div className="flex justify-center pt-1">
        <Link
          href="/verity/news"
          className="inline-flex items-center gap-2.5 rounded-full border border-[var(--magenta)]/40 bg-gradient-to-r from-[var(--magenta)]/10 to-transparent px-8 py-3 text-sm font-semibold tracking-wider text-[var(--magenta)] transition-all hover:border-[var(--magenta)] hover:bg-[var(--magenta)]/15 hover:shadow-[0_0_28px_rgba(226,0,116,0.28)]"
        >
          <Newspaper size={14} />
          News一覧へ
          <span className="opacity-50 text-xs">→</span>
        </Link>
      </div>
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

      {/* ── 5. LATEST NEWS ───────────────────────────────────────────────── */}
      <section id="latest-news-preview">
        <Suspense fallback={
          <div className="space-y-4">
            <div className="h-7 w-48 animate-pulse rounded bg-[var(--surface)]" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--surface)]" />
              ))}
            </div>
          </div>
        }>
          <LatestNewsSection />
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

      {/* ── 8. 【最速】予約・先行公開 ─────────────────────────────────────── */}
      <section id="pre-orders">
        <Suspense>
          <UpcomingSection filters={filters} top100Names={top100Names} />
        </Suspense>
      </section>

      {/* ── 9. 今週のリリース ─────────────────────────────────────────────── */}
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
