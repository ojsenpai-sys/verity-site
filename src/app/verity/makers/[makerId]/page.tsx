import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Building2, ChevronRight, CalendarClock, Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import { getMakerById, MAKERS } from '@/lib/makers'
import type { Article } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// ─── Static params (任意 — force-dynamic なので省略可) ────────────────────────

export function generateStaticParams() {
  return MAKERS.map(m => ({ makerId: String(m.id) }))
}

// ─── Metadata ──────────────────────────────────────────────────────────────────

type PageProps = {
  params: Promise<{ makerId: string }>
  searchParams: Promise<{ filter?: string; page?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { makerId } = await params
  const maker = getMakerById(Number(makerId))
  if (!maker) return {}
  return {
    title: `${maker.name} — 最新作カタログ`,
    description: `${maker.name}（${maker.description}）の最新作・予約作品一覧。FANZAアフィリエイトAPIと直結した自動更新カタログ。`,
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 24

type FilterType = 'all' | 'new' | 'upcoming'

export default async function MakerDetailPage({ params, searchParams }: PageProps) {
  const { makerId } = await params
  const { filter: rawFilter, page: rawPage } = await searchParams

  const makerIdNum = Number(makerId)
  if (!Number.isInteger(makerIdNum) || makerIdNum <= 0) notFound()

  const maker = getMakerById(makerIdNum)
  if (!maker) notFound()

  const filter: FilterType = rawFilter === 'new' || rawFilter === 'upcoming'
    ? rawFilter
    : 'all'
  const page = Math.max(1, parseInt(rawPage ?? '1') || 1)
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

  const supabase = await createClient()

  // ── JSONB containment で maker ID を絞り込み（1作品1記事ルール: DB 側で重複なし）──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .contains('metadata', { maker: [{ id: makerIdNum }] })
    .order('published_at', { ascending: false, nullsFirst: false })

  const now = new Date().toISOString()
  if (filter === 'new') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    query = query
      .lte('published_at', now)
      .gte('published_at', thirtyDaysAgo)
  } else if (filter === 'upcoming') {
    query = query.gt('published_at', now)
  }

  const { data, count } = await query.range(from, to)
  const articles   = (data ?? []) as Article[]
  const total      = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // 予約件数（フィルタなし時のみ取得してヘッダーに表示）
  let upcomingCount = 0
  if (filter !== 'upcoming') {
    const { count: uc } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .contains('metadata', { maker: [{ id: makerIdNum }] })
      .gt('published_at', now)
    upcomingCount = uc ?? 0
  }

  const filterTabs: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all',      label: `全作品`,  count: filter === 'all' ? total : undefined },
    { key: 'new',      label: `新作（30日）` },
    { key: 'upcoming', label: `予約中`, count: upcomingCount > 0 ? upcomingCount : undefined },
  ]

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-6">

      {/* パンくずリスト */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/verity/makers" className="hover:text-[var(--magenta)] transition-colors">メーカー</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">{maker.name}</span>
      </nav>

      {/* メーカーヘッダー */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[var(--magenta)]/15 border border-[var(--magenta)]/30">
            <Building2 size={24} className="text-[var(--magenta)]" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[var(--text)]">{maker.name}</h1>
            {maker.nameEn && maker.nameEn !== maker.name && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{maker.nameEn}</p>
            )}
            <p className="mt-1 text-sm text-[var(--text-muted)]">{maker.description}</p>
          </div>
        </div>

        {/* 統計バッジ */}
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs">
            <Layers size={12} className="text-[var(--magenta)]" />
            <span className="text-[var(--text-muted)]">DB 収録:</span>
            <span className="font-semibold text-[var(--text)]">
              {filter === 'all' ? total.toLocaleString() : '—'} 作品
            </span>
          </div>
          {upcomingCount > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs">
              <CalendarClock size={12} className="text-sky-400" />
              <span className="text-sky-300/80">予約受付中:</span>
              <span className="font-semibold text-sky-300">{upcomingCount} 作品</span>
            </div>
          )}
        </div>
      </div>

      {/* フィルタータブ */}
      <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
        {filterTabs.map(tab => {
          const isActive = filter === tab.key
          const href = tab.key === 'all'
            ? `/verity/makers/${makerId}`
            : `/verity/makers/${makerId}?filter=${tab.key}`
          return (
            <Link
              key={tab.key}
              href={href}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                isActive
                  ? 'bg-[var(--magenta)] text-white shadow-[0_0_12px_rgba(226,0,116,0.4)]'
                  : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--magenta)]/50 hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive ? 'bg-white/25 text-white' : 'bg-[var(--magenta)]/20 text-[var(--magenta)]'
                }`}>
                  {tab.count}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* 作品グリッド */}
      {articles.length === 0 ? (
        <div className="py-20 text-center space-y-3">
          <p className="text-[var(--text-muted)]">
            {filter === 'upcoming'
              ? '現在予約受付中の作品はありません'
              : filter === 'new'
              ? '直近30日以内の新作はありません'
              : 'このメーカーの作品が見つかりませんでした'}
          </p>
          {filter !== 'all' && (
            <Link
              href={`/verity/makers/${makerId}`}
              className="inline-block text-xs text-[var(--magenta)] hover:underline underline-offset-2"
            >
              ← 全作品を表示
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {articles.map(article => (
            <ArticleCard key={article.id ?? article.external_id} article={article} />
          ))}
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 && (
            <Link
              href={`/verity/makers/${makerId}${buildFilterQuery(filter, page - 1)}`}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)]/50 hover:text-[var(--text)] transition-all"
            >
              ← 前へ
            </Link>
          )}
          <span className="text-sm text-[var(--text-muted)]">
            {page} / {totalPages} ページ
            <span className="ml-2 text-xs">（{total.toLocaleString()} 作品）</span>
          </span>
          {page < totalPages && (
            <Link
              href={`/verity/makers/${makerId}${buildFilterQuery(filter, page + 1)}`}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)]/50 hover:text-[var(--text)] transition-all"
            >
              次へ →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function buildFilterQuery(filter: FilterType, page: number): string {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('filter', filter)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}
