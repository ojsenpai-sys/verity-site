import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import type { Article } from '@/lib/types'

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
    title: `【${tag}】最新作・予約スケジュール一覧 — VERITY`,
    description: `${tag}の最新AV作品・予約スケジュール一覧。FANZA公式データと直結した自動更新カタログ。毎日0:00 JSTに新作を自動収録。`,
    alternates: { canonical: `${siteUrl}/verity/genres/${rawTag}` },
    openGraph: {
      title: `【${tag}】最新作・予約スケジュール一覧 — VERITY`,
      description: `${tag}の最新AV作品・予約スケジュール一覧。FANZA公式データと直結した自動更新カタログ。`,
      url: `${siteUrl}/verity/genres/${rawTag}`,
    },
  }
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

  const { data, count, error } = await supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, to)

  if (error) {
    console.error('[genres/tag] query error:', error.message)
  }

  const articles   = (data as Article[]) ?? []
  const total      = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (total === 0 && page === 1) notFound()

  function buildPageUrl(p: number): string {
    if (p <= 1) return `/verity/genres/${rawTag}`
    return `/verity/genres/${rawTag}?page=${p}`
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">

      {/* パンくず */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <Link href="/verity/genres" className="hover:text-[var(--magenta)] transition-colors">ジャンル</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">{tag}</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--magenta)]/30 bg-[var(--magenta)]/10">
            <Tag size={15} className="text-[var(--magenta)]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--text)]">
            {tag}
          </h1>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          {total.toLocaleString()}件の作品 — FANZA公式データより毎日0:00 JSTに自動更新
        </p>
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
          <p className="text-lg">このページに作品はありません</p>
          <Link href="/verity/genres" className="mt-4 text-sm text-[var(--magenta)] hover:underline">
            ジャンル一覧に戻る
          </Link>
        </div>
      )}

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
