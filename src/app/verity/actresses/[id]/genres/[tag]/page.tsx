import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, Tag, UserCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { ArticleCard } from '@/components/ArticleCard'
import type { Article } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  params:       Promise<{ id: string; tag: string }>
  searchParams: Promise<{ page?: string }>
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
    title: `【${data.name}】の${tag}最新作・予約スケジュール一覧 — VERITY`,
    description: `女優「${data.name}」が出演する${tag}ジャンルの最新作品・予約スケジュールを網羅。毎日0:00自動更新。`,
    alternates: { canonical: `${siteUrl}/verity/actresses/${id}/genres/${rawTag}` },
    openGraph: {
      title:       `【${data.name}】の${tag}最新作 — VERITY`,
      description: `${data.name}が出演する${tag}ジャンルの最新AV作品一覧。FANZA公式データより毎日自動更新。`,
      url:         `${siteUrl}/verity/actresses/${id}/genres/${rawTag}`,
    },
  }
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function ActressGenrePage({ params, searchParams }: PageProps) {
  const { id, tag: rawTag } = await params
  const { page: rawPage }   = await searchParams

  const tag  = decodeURIComponent(rawTag)
  const page = Math.max(1, parseInt(rawPage ?? '1') || 1)
  const from = (page - 1) * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1

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

  const { data, count, error } = await supabase
    .from('articles')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .overlaps('tags', searchNames)
    .contains('tags', [tag])
    .not('metadata->>url', 'like', '%/dc/doujin/%')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(from, to)

  if (error) console.error('[actresses/genres] query error:', error.message)

  const articles   = (data as Article[]) ?? []
  const total      = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  if (total === 0 && page === 1) notFound()

  function buildPageUrl(p: number): string {
    const base = `/verity/actresses/${id}/genres/${rawTag}`
    return p <= 1 ? base : `${base}?page=${p}`
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
              {actressName}
              <span className="mx-2 text-[var(--text-muted)] font-normal text-lg">×</span>
              <span className="text-[var(--magenta)]">{tag}</span>
            </h1>
            {actressRuby && (
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{actressRuby}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-[var(--text-muted)]">
            {total.toLocaleString()}件の作品 — FANZA公式データより毎日0:00 JSTに自動更新
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
