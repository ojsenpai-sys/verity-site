import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, Tag, UserCircle, Calendar, Flame, Building2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import type { Article } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  params:       Promise<{ id: string; tag: string }>
  searchParams: Promise<{ page?: string; sort?: 'date' | 'popular'; maker?: string }>
}

const PAGE_SIZE = 24

// ─── Metadata ──────────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, tag: rawTag } = await params
  const tag = decodeURIComponent(rawTag)
  const supabase = await createClient()
  const { data } = await supabase
    .from('actresses')
    .select('name')
    .eq('external_id', id)
    .eq('is_active', true)
    .single()
  if (!data) return {}
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  return {
    title: `【${data.name}】の${tag}作品一覧 — VERITY`,
    description: `女優「${data.name}」が出演する${tag}ジャンル作品を発売日順・人気順・メーカー別に閲覧。FANZA公式データより毎日0:00自動更新。`,
    alternates: { canonical: `${siteUrl}/verity/actresses/${id}/genres/${rawTag}` },
    openGraph: {
      title:       `【${data.name}】の${tag}作品一覧 — VERITY`,
      description: `${data.name}が出演する${tag}ジャンルの最新AV作品一覧。`,
      url:         `${siteUrl}/verity/actresses/${id}/genres/${rawTag}`,
    },
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

type MakerEntry = { id: number; name: string }

function articleMakers(article: Article): MakerEntry[] {
  const raw = (article.metadata as Record<string, unknown> | null)?.maker
  if (Array.isArray(raw)) {
    return (raw as Array<{ id?: unknown; name?: unknown }>)
      .filter(m => typeof m.id === 'number' && typeof m.name === 'string')
      .map(m => ({ id: m.id as number, name: m.name as string }))
  }
  return []
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function ActressGenrePage({ params, searchParams }: PageProps) {
  const { id, tag: rawTag } = await params
  const { page: rawPage, sort: rawSort, maker: rawMaker } = await searchParams

  const tag      = decodeURIComponent(rawTag)
  const page     = Math.max(1, parseInt(rawPage ?? '1') || 1)
  const sort     = rawSort === 'popular' ? 'popular' : 'date'
  const makerId  = rawMaker ? parseInt(rawMaker, 10) : null

  const supabase = await createClient()

  const { data: actressData } = await supabase
    .from('actresses')
    .select('name, ruby, metadata')
    .eq('external_id', id)
    .eq('is_active', true)
    .single()

  if (!actressData) notFound()

  const actressName = actressData.name as string
  const actressRuby = actressData.ruby as string | null
  const aliases     = ((actressData.metadata as Record<string, unknown>)?.aliases ?? []) as string[]
  const searchNames = [actressName, ...aliases]

  // ── 一次取得: 全件 (この女優 × このジャンル) を最大 600 件まで ───────────────
  const { data: allRows, error } = await supabase
    .from('articles')
    .select('*')
    .eq('is_active', true)
    .overlaps('tags', searchNames)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(600)

  if (error) console.error('[actresses/genres] query error:', error.message)

  const all = (allRows as Article[]) ?? []
  if (all.length === 0 && page === 1) notFound()

  // ── メーカー集計 (チップ表示用) ─────────────────────────────────────────────
  const makerCounts = new Map<number, { entry: MakerEntry; count: number }>()
  for (const a of all) {
    for (const m of articleMakers(a)) {
      const prev = makerCounts.get(m.id)
      if (prev) prev.count++
      else makerCounts.set(m.id, { entry: m, count: 1 })
    }
  }
  const topMakers = [...makerCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ── メーカー絞り込み (URL params) ──────────────────────────────────────────
  let filtered = makerId
    ? all.filter(a => articleMakers(a).some(m => m.id === makerId))
    : all

  // ── 人気順スコアリング: user_events 集計 (fanza_click=3 / video_view=1) ───
  if (sort === 'popular' && filtered.length > 0) {
    const cids = filtered.map(a => a.external_id).filter(Boolean)
    if (cids.length) {
      const { data: events } = await supabase
        .from('user_events')
        .select('target_id, event_name')
        .eq('target_type', 'article')
        .in('event_name', ['fanza_click', 'video_view'])
        .in('target_id', cids)
        .gte('created_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
        .limit(10000)

      const score = new Map<string, number>()
      for (const r of (events ?? []) as { target_id: string; event_name: string }[]) {
        const w = r.event_name === 'fanza_click' ? 3 : 1
        score.set(r.target_id, (score.get(r.target_id) ?? 0) + w)
      }
      filtered = [...filtered].sort((a, b) => {
        const sa = score.get(a.external_id) ?? 0
        const sb = score.get(b.external_id) ?? 0
        if (sa !== sb) return sb - sa
        // 同点は新しい順
        return (b.published_at ?? '').localeCompare(a.published_at ?? '')
      })
    }
  }

  const total      = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const start      = (page - 1) * PAGE_SIZE
  const articles   = filtered.slice(start, start + PAGE_SIZE)

  function buildUrl(params: { page?: number; sort?: 'date' | 'popular'; maker?: number | null }): string {
    const qp = new URLSearchParams()
    const nextSort = params.sort ?? sort
    const nextMaker = params.maker !== undefined ? params.maker : makerId
    const nextPage = params.page ?? 1
    if (nextSort !== 'date') qp.set('sort', nextSort)
    if (nextMaker !== null && nextMaker !== undefined) qp.set('maker', String(nextMaker))
    if (nextPage > 1) qp.set('page', String(nextPage))
    const q = qp.toString()
    const base = `/verity/actresses/${id}/genres/${rawTag}`
    return q ? `${base}?${q}` : base
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">

      {/* パンくず */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)] flex-wrap">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/verity/actresses" className="hover:text-[var(--magenta)] transition-colors">Actresses</Link>
        <ChevronRight size={12} />
        <Link href={`/verity/actresses/${id}`} className="hover:text-[var(--magenta)] transition-colors">{actressName}</Link>
        <ChevronRight size={12} />
        <Link href="/verity/genres" className="hover:text-[var(--magenta)] transition-colors">ジャンル</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">{tag}</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--magenta)]/30 bg-[var(--magenta)]/10">
            <Tag size={16} className="text-[var(--magenta)]" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">
              <Link href={`/verity/actresses/${id}`} className="hover:text-[var(--magenta)] transition-colors">
                {actressName}
              </Link>
              <span className="mx-2 text-[var(--text-muted)] font-normal text-lg">の</span>
              <span className="text-[var(--magenta)]">{tag}</span>
              <span className="ml-1.5 text-base font-bold text-[var(--text)]">作品一覧</span>
            </h1>
            {actressRuby && <p className="text-xs text-[var(--text-muted)] mt-0.5">{actressRuby}</p>}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-[var(--text-muted)]">
            {total.toLocaleString()}件 — FANZA公式データより毎日0:00 JSTに自動更新
          </p>
          <Link
            href={`/verity/actresses/${id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--magenta)]/50 hover:text-[var(--magenta)] transition-colors"
          >
            <UserCircle size={11} />
            {actressName}の全作品へ
          </Link>
          <Link
            href={`/verity/genres/${rawTag}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--magenta)]/50 hover:text-[var(--magenta)] transition-colors"
          >
            <Tag size={11} />
            {tag}の全作品へ
          </Link>
        </div>
      </div>

      {/* ソート + メーカー絞り込みバー */}
      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        {/* ソート */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mr-1">並び替え</span>
          <Link
            href={buildUrl({ sort: 'date', page: 1 })}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
              sort === 'date'
                ? 'bg-[var(--magenta)] text-white shadow-[0_0_14px_rgba(226,0,116,0.35)]'
                : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)]/40 hover:text-[var(--magenta)]',
            ].join(' ')}
          >
            <Calendar size={11} />
            発売日順
          </Link>
          <Link
            href={buildUrl({ sort: 'popular', page: 1 })}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all',
              sort === 'popular'
                ? 'bg-amber-500 text-white shadow-[0_0_14px_rgba(245,158,11,0.4)]'
                : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-amber-500/40 hover:text-amber-400',
            ].join(' ')}
          >
            <Flame size={11} />
            人気順
          </Link>
        </div>

        {/* メーカー */}
        {topMakers.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold tracking-widest uppercase text-[var(--text-muted)] mr-1">
              <Building2 size={10} className="inline mr-0.5" />
              メーカー
            </span>
            <Link
              href={buildUrl({ maker: null, page: 1 })}
              className={[
                'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold transition-all',
                makerId === null
                  ? 'bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/50'
                  : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)]/40 hover:text-[var(--magenta)]',
              ].join(' ')}
            >
              すべて ({all.length})
            </Link>
            {topMakers.map(({ entry, count }) => (
              <Link
                key={entry.id}
                href={buildUrl({ maker: entry.id, page: 1 })}
                className={[
                  'inline-flex items-center rounded-full px-3 py-1 text-[11px] font-medium transition-all',
                  makerId === entry.id
                    ? 'bg-[var(--magenta)]/15 text-[var(--magenta)] border border-[var(--magenta)]/50'
                    : 'border border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--magenta)]/40 hover:text-[var(--magenta)]',
                ].join(' ')}
              >
                {entry.name}
                <span className="ml-1 tabular-nums opacity-70">({count})</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* 作品グリッド */}
      {articles.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {articles.map(article => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-[var(--text-muted)]">
          <p className="text-4xl mb-4">📭</p>
          <p className="text-lg">該当する作品はありません</p>
          <Link href={`/verity/actresses/${id}`} className="mt-4 text-sm text-[var(--magenta)] hover:underline">
            {actressName}の全作品に戻る
          </Link>
        </div>
      )}

      {/* ページネーション */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-4">
          {page > 1 ? (
            <Link
              href={buildUrl({ page: page - 1 })}
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
              href={buildUrl({ page: page + 1 })}
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

      <p className="text-center text-[11px] text-[var(--text-muted)]">
        作品情報は FANZA Affiliate API v3 より取得。毎日 0:00 JST に自動更新。
      </p>
    </div>
  )
}
