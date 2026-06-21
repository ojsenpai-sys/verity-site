import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, Tag, TrendingUp, Flame, Calendar, Users, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { ProxiedImage } from '@/components/ProxiedImage'
import { NowPrinting } from '@/components/NowPrinting'
import { cidToCdnUrl, coverPosClass, isBadImageUrl, toHighResPackageUrl } from '@/lib/cidUtils'
import type { Article, Actress } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  params:       Promise<{ tag: string }>
  searchParams: Promise<{ page?: string }>
}

const PAGE_SIZE = 24

// ─── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { tag: rawTag } = await params
  const tag = decodeURIComponent(rawTag)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  return {
    title: `【${tag}】最新作・人気作品・出演女優一覧 — VERITY`,
    description: `${tag}の最新AV作品、人気作品、人気女優、急上昇トレンドをまとめた総合カタログ。FANZA公式データと直結して毎日0:00 JSTに自動更新。`,
    alternates: { canonical: `${siteUrl}/verity/genres/${rawTag}` },
    openGraph: {
      title: `【${tag}】総合カタログ — VERITY`,
      description: `${tag}の最新作・人気作・出演女優・関連ジャンルを一挙に。FANZA公式データより毎日自動更新。`,
      url: `${siteUrl}/verity/genres/${rawTag}`,
    },
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function proxyJacket(article: Pick<Article, 'image_url' | 'external_id'>): string | null {
  const raw = isBadImageUrl(article.image_url) ? null : article.image_url
  const hi = toHighResPackageUrl(raw)
  if (hi) return `/verity/api/proxy/image?url=${encodeURIComponent(hi)}`
  if (article.external_id) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(article.external_id, 'pl'))}`
  return null
}

function actressProxyImg(actress: Pick<Actress, 'image_url' | 'metadata'>): string | null {
  const raw = isBadImageUrl(actress.image_url) ? null : actress.image_url
  if (raw) return `/verity/api/proxy/image?url=${encodeURIComponent(toHighResPackageUrl(raw) ?? raw)}`
  const cid = (actress.metadata as Record<string, unknown> | null)?.latest_cid as string | undefined
  if (cid) return `/verity/api/proxy/image?url=${encodeURIComponent(cidToCdnUrl(cid, 'pl'))}`
  return null
}

type ActressMeta = { id: number; name: string }

// ─── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchAllInTag(tag: string, limit: number, orderByPublishedDesc = true) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: !orderByPublishedDesc, nullsFirst: false })
    .limit(limit)
  return (data as Article[]) ?? []
}

/** 過去 168h トレンド作品（RPC）→ tag でフィルタ */
async function fetchTrendingInTag(tag: string, take = 6): Promise<Article[]> {
  const supabase = await createClient()
  // RPC は genre フィルタを取らないため、広めに取って JS 側で絞る
  const { data: trending } = await supabase.rpc('get_trending_articles', { p_limit: 80, p_hours: 168 })
  if (!Array.isArray(trending) || trending.length === 0) return []
  const trendingCids = trending.map((r: { external_id: string }) => r.external_id).filter(Boolean)
  if (!trendingCids.length) return []

  const { data: enriched } = await supabase
    .from('articles')
    .select('*')
    .in('external_id', trendingCids)
    .eq('is_active', true)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .limit(take * 2)

  const map = new Map<string, Article>(((enriched as Article[]) ?? []).map(a => [a.external_id, a]))
  const ordered: Article[] = []
  for (const r of trending) {
    const a = map.get(r.external_id as string)
    if (a) ordered.push(a)
    if (ordered.length >= take) break
  }
  return ordered
}

/** user_events.fanza_click + video_view 集計で人気作品 (target_type='article') */
async function fetchPopularInTag(tag: string, take = 8): Promise<Article[]> {
  const supabase = await createClient()
  // 一度に広めの母集団を取って JS で集計（CV重みは fanza_click=3, video_view=1）
  const { data: events } = await supabase
    .from('user_events')
    .select('target_id, event_name')
    .eq('target_type', 'article')
    .in('event_name', ['fanza_click', 'video_view'])
    .not('target_id', 'is', null)
    .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
    .limit(20000)

  const score = new Map<string, number>()
  for (const r of (events ?? []) as { target_id: string; event_name: string }[]) {
    const w = r.event_name === 'fanza_click' ? 3 : 1
    score.set(r.target_id, (score.get(r.target_id) ?? 0) + w)
  }
  if (!score.size) return []

  const topCids = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([cid]) => cid)
  if (!topCids.length) return []

  const { data: enriched } = await supabase
    .from('articles')
    .select('*')
    .in('external_id', topCids)
    .eq('is_active', true)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .limit(take * 3)

  const map = new Map<string, Article>(((enriched as Article[]) ?? []).map(a => [a.external_id, a]))
  const ordered: Article[] = []
  for (const cid of topCids) {
    const a = map.get(cid)
    if (a) ordered.push(a)
    if (ordered.length >= take) break
  }
  return ordered
}

/** ジャンル内の出演女優を出演作品数順に集計 */
async function fetchPopularActressesInTag(tag: string, take = 8) {
  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('articles')
    .select('metadata')
    .eq('is_active', true)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(500)

  const counts = new Map<number, { meta: ActressMeta; count: number }>()
  for (const r of (rows ?? []) as { metadata: { actress?: ActressMeta[] } }[]) {
    const actresses = Array.isArray(r.metadata?.actress) ? r.metadata.actress : []
    for (const m of actresses) {
      if (!m || typeof m.id !== 'number' || m.id <= 0) continue
      const prev = counts.get(m.id)
      if (prev) prev.count++
      else counts.set(m.id, { meta: m, count: 1 })
    }
  }
  if (!counts.size) return [] as Array<{ actress: Actress; count: number }>

  const sortedIds = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, take * 2)
  const externalIds = sortedIds.map(s => `dmm-actress-${s.meta.id}`)

  const { data: acts } = await supabase
    .from('actresses')
    .select('id, external_id, name, image_url, metadata')
    .in('external_id', externalIds)
    .eq('is_active', true)

  const actMap = new Map<string, Actress>(((acts as Actress[]) ?? []).map(a => [a.external_id, a]))
  const result: Array<{ actress: Actress; count: number }> = []
  for (const s of sortedIds) {
    const a = actMap.get(`dmm-actress-${s.meta.id}`)
    if (a) result.push({ actress: a, count: s.count })
    if (result.length >= take) break
  }
  return result
}

/** タグ共起ベースで関連ジャンルを抽出 (除外: 女優名 + VR 派生) */
async function fetchRelatedGenres(tag: string, take = 10) {
  const supabase = await createClient()
  const [{ data: rows }, { data: actressNamesRows }] = await Promise.all([
    supabase
      .from('articles')
      .select('tags')
      .eq('is_active', true)
      .contains('tags', [tag])
      .not('metadata->>url', 'like', '%/dc/doujin/%')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(800),
    supabase.from('actresses').select('name').eq('is_active', true),
  ])
  const actressNameSet = new Set(
    ((actressNamesRows ?? []) as { name: string }[]).map(r => r.name)
  )
  const counts = new Map<string, number>()
  for (const r of (rows ?? []) as { tags: string[] }[]) {
    for (const t of r.tags ?? []) {
      if (!t || t === tag) continue
      if (actressNameSet.has(t)) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, take)
    .map(([name, count]) => ({ name, count }))
}

// ─── Section components ───────────────────────────────────────────────────────

function SectionHeader({
  icon, title, accent, sub,
}: { icon: React.ReactNode; title: string; accent: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${accent}`}>
        {icon}
      </span>
      <h2 className="text-base font-bold tracking-tight text-[var(--text)]">{title}</h2>
      {sub && <span className="text-[11px] text-[var(--text-muted)]">{sub}</span>}
    </div>
  )
}

function TrendingRail({ articles, tag }: { articles: Article[]; tag: string }) {
  if (!articles.length) return null
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Flame size={13} className="text-emerald-400" />}
        title="最近話題の作品"
        accent="border-emerald-500/40 bg-emerald-500/10"
        sub={`${tag} の直近トレンド`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {articles.map(a => {
          const img = proxyJacket(a)
          return (
            <Link
              key={a.id}
              href={`/verity/articles/${a.slug}`}
              className="group block rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.18)] hover:-translate-y-0.5"
            >
              <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
                {img ? (
                  <ProxiedImage
                    src={img}
                    alt={a.title}
                    className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(a.image_url)} transition-transform duration-300 group-hover:scale-105`}
                  />
                ) : <NowPrinting />}
                <span className="absolute left-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[9px] font-black tracking-widest text-white shadow-md">
                  <Flame size={8} /> HOT
                </span>
              </div>
              <p className="line-clamp-2 px-2.5 py-2 text-[11px] leading-snug text-[var(--text)] group-hover:text-emerald-300 transition-colors">
                {a.title}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function PopularRail({ articles, tag }: { articles: Article[]; tag: string }) {
  if (!articles.length) return null
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<TrendingUp size={13} className="text-amber-400" />}
        title="人気作品"
        accent="border-amber-500/40 bg-amber-500/10"
        sub={`${tag} の累計アクセス上位`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {articles.map((a, i) => {
          const img = proxyJacket(a)
          return (
            <Link
              key={a.id}
              href={`/verity/articles/${a.slug}`}
              className="group block rounded-lg border border-[var(--border)] bg-[var(--surface)] overflow-hidden transition-all hover:border-amber-500/50 hover:shadow-[0_0_18px_rgba(245,158,11,0.16)]"
            >
              <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-2)]">
                {img ? (
                  <ProxiedImage
                    src={img}
                    alt={a.title}
                    className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(a.image_url)} transition-transform duration-300 group-hover:scale-105`}
                  />
                ) : <NowPrinting />}
                <span className="absolute left-1.5 top-1.5 inline-flex items-center justify-center rounded-md bg-amber-500/95 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white shadow-md">
                  #{i + 1}
                </span>
              </div>
              <p className="line-clamp-2 px-2 py-1.5 text-[10px] leading-snug text-[var(--text)] group-hover:text-amber-300 transition-colors">
                {a.title}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function ActressesInGenre({
  items, tag,
}: { items: Array<{ actress: Actress; count: number }>; tag: string }) {
  if (!items.length) return null
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Users size={13} className="text-[var(--magenta)]" />}
        title="このジャンルの人気女優"
        accent="border-[var(--magenta)]/40 bg-[var(--magenta)]/10"
        sub={`${tag} に多く出演している女優`}
      />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {items.map(({ actress, count }) => {
          const img = actressProxyImg(actress)
          return (
            <Link
              key={actress.external_id}
              href={`/verity/actresses/${actress.external_id}/genres/${encodeURIComponent(tag)}`}
              className="group flex flex-col items-center gap-1.5 text-center"
            >
              <div className="relative aspect-square w-full overflow-hidden rounded-full ring-1 ring-[var(--border)] bg-[var(--surface-2)] transition-all duration-200 group-hover:ring-2 group-hover:ring-[var(--magenta)]/60 group-hover:shadow-[0_0_18px_rgba(226,0,116,0.3)]">
                {img ? (
                  <ProxiedImage
                    src={img}
                    alt={actress.name}
                    className={`absolute inset-0 h-full w-full object-cover ${coverPosClass(actress.image_url)} transition-transform duration-300 group-hover:scale-110`}
                  />
                ) : <div className="absolute inset-0 bg-[var(--surface-2)]" />}
              </div>
              <span className="line-clamp-1 text-[11px] font-semibold text-[var(--text)] group-hover:text-[var(--magenta)] transition-colors">
                {actress.name}
              </span>
              <span className="text-[9px] tabular-nums text-[var(--text-muted)]">
                {count}作品
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function RelatedGenres({ items, currentTag }: { items: Array<{ name: string; count: number }>; currentTag: string }) {
  if (!items.length) return null
  return (
    <section className="space-y-3">
      <SectionHeader
        icon={<Sparkles size={13} className="text-sky-400" />}
        title="関連ジャンル"
        accent="border-sky-500/40 bg-sky-500/10"
        sub={`${currentTag} と一緒によく付くタグ`}
      />
      <div className="flex flex-wrap gap-2">
        {items.map(({ name, count }) => (
          <Link
            key={name}
            href={`/verity/genres/${encodeURIComponent(name)}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-300 transition-all hover:border-sky-400 hover:bg-sky-500/20 hover:shadow-[0_0_10px_rgba(56,189,248,0.3)]"
          >
            <Tag size={10} />
            <span className="font-semibold">{name}</span>
            <span className="tabular-nums text-[10px] text-sky-400/70">{count}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function GenreTagPage({ params, searchParams }: PageProps) {
  const { tag: rawTag } = await params
  const { page: rawPage } = await searchParams

  const tag  = decodeURIComponent(rawTag)
  const page = Math.max(1, parseInt(rawPage ?? '1') || 1)
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const supabase = await createClient()

  // 最新作グリッド + 件数
  const { data: latestData, count, error } = await supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, to)

  if (error) console.error('[genres/tag] query error:', error.message)

  const articles   = (latestData as Article[]) ?? []
  const total      = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (total === 0 && page === 1) notFound()

  // ハブセクション（1ページ目のみ表示）
  const isFirstPage = page === 1
  const [trending, popular, actresses, related] = isFirstPage
    ? await Promise.all([
        fetchTrendingInTag(tag, 6),
        fetchPopularInTag(tag, 8),
        fetchPopularActressesInTag(tag, 8),
        fetchRelatedGenres(tag, 12),
      ])
    : [[], [], [], []] as [Article[], Article[], Array<{ actress: Actress; count: number }>, Array<{ name: string; count: number }>]

  function buildPageUrl(p: number): string {
    if (p <= 1) return `/verity/genres/${rawTag}`
    return `/verity/genres/${rawTag}?page=${p}`
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-10">

      {/* パンくず */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/verity/genres" className="hover:text-[var(--magenta)] transition-colors">ジャンル</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">{tag}</span>
      </nav>

      {/* ヘッダー */}
      <header className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--magenta)]/30 bg-[var(--magenta)]/10">
            <Tag size={16} className="text-[var(--magenta)]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">{tag}</h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--magenta)]/10 px-2.5 py-0.5 text-[10px] font-bold tracking-widest uppercase text-[var(--magenta)]/80">
            Genre Hub
          </span>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {total.toLocaleString()}件の作品 — FANZA公式データより毎日0:00 JSTに自動更新
        </p>
      </header>

      {/* ハブセクション */}
      {isFirstPage && (
        <>
          <TrendingRail articles={trending} tag={tag} />
          <PopularRail articles={popular} tag={tag} />
          <ActressesInGenre items={actresses} tag={tag} />
          <RelatedGenres items={related} currentTag={tag} />
        </>
      )}

      {/* 最新作グリッド */}
      <section className="space-y-4">
        <SectionHeader
          icon={<Calendar size={13} className="text-[var(--text-muted)]" />}
          title="最新作品"
          accent="border-[var(--border)] bg-[var(--surface)]"
          sub={`発売日の新しい順 — ${total.toLocaleString()}件中 ${from + 1}〜${Math.min(to + 1, total)}`}
        />
        {articles.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {articles.map(article => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
            <p className="text-4xl mb-4">📭</p>
            <p className="text-lg">このページに作品はありません</p>
            <Link href="/verity/genres" className="mt-4 text-sm text-[var(--magenta)] hover:underline">
              ジャンル一覧に戻る
            </Link>
          </div>
        )}
      </section>

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          {page > 1 ? (
            <Link
              href={buildPageUrl(page - 1)}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--magenta)]/50 hover:text-[var(--text)]"
            >
              <ChevronLeft size={14} />
              前のページ
            </Link>
          ) : (
            <span className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] opacity-40">
              <ChevronLeft size={14} />
              前のページ
            </span>
          )}

          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {page} / {totalPages} ページ（{total.toLocaleString()}作品）
          </span>

          {page < totalPages ? (
            <Link
              href={buildPageUrl(page + 1)}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--magenta)]/50 hover:text-[var(--text)]"
            >
              次のページ
              <ChevronRight size={14} />
            </Link>
          ) : (
            <span className="flex items-center gap-1 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] opacity-40">
              次のページ
              <ChevronRight size={14} />
            </span>
          )}
        </div>
      )}

      {/* フッター */}
      <p className="text-center text-[11px] text-[var(--text-muted)]">
        作品情報は FANZA Affiliate API v3 より取得。毎日 0:00 JST に自動更新。
      </p>
    </div>
  )
}
