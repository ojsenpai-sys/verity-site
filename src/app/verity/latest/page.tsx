import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, Flame } from 'lucide-react'
import { getFastestReleasesPage } from '@/lib/fastestReleases'
import { FastestReleaseMakerSection } from '@/components/FastestReleaseMakerSection'

// Phase 1: 最新作最速更新情報の全メーカー版。Homepage(上位8社)に表示されない
// 9社目以降も含め、監視対象の全メーカーを直近更新順で確認できるページ。
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: '全メーカー最新作 | VERITY',
  description: 'VERITYが監視する全メーカーの最新作を、直近更新順で一覧表示。各メーカー5〜10作品を掲載。',
}

type PageProps = {
  searchParams: Promise<{ page?: string }>
}

export default async function LatestReleasesPage({ searchParams }: PageProps) {
  const { page: rawPage } = await searchParams
  const requestedPage = Math.max(1, parseInt(rawPage ?? '1', 10) || 1)

  const { sections, page, totalPages, totalMakers } = await getFastestReleasesPage(requestedPage)

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 space-y-8">
      {/* パンくずリスト */}
      <nav className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Link href="/" className="hover:text-[var(--magenta)] transition-colors">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-[var(--text)]">全メーカー最新作</span>
      </nav>

      {/* ヘッダー */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="h-7 w-1 rounded-full bg-gradient-to-b from-orange-500 to-red-600" />
          <Flame size={18} className="text-orange-400" />
          <h1 className="text-xl font-bold tracking-tight text-[var(--text)]">
            全メーカー最新作
          </h1>
        </div>
        <p className="pl-6 text-[11px] tracking-wide text-[var(--text-muted)]">
          監視対象 {totalMakers.toLocaleString()} メーカーを、直近更新順に表示しています。
        </p>
      </div>

      {/* メーカー別セクション */}
      {sections.length === 0 ? (
        <div className="py-20 text-center text-[var(--text-muted)]">
          表示できる作品がありませんでした。
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <FastestReleaseMakerSection key={section.id} section={section} />
          ))}
        </div>
      )}

      {/* ページネーション(既存 /verity/makers/[makerId] と同じスタイル) */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          {page > 1 && (
            <Link
              href={`/verity/latest?page=${page - 1}`}
              className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-muted)] hover:border-[var(--magenta)]/50 hover:text-[var(--text)] transition-all"
            >
              ← 前へ
            </Link>
          )}
          <span className="text-sm text-[var(--text-muted)]">
            {page} / {totalPages} ページ
            <span className="ml-2 text-xs">（{totalMakers.toLocaleString()} メーカー）</span>
          </span>
          {page < totalPages && (
            <Link
              href={`/verity/latest?page=${page + 1}`}
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
